package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;

/**
 * Coordinates clinician use cases inside the original transaction/locking boundary. HTTP mapping
 * lives in ClinicianApi; SQL lives in AppointmentRepository. Actors must come from the server
 * session, and each use case checks doctor role and current consent. Preserve retry, version and
 * authorization ordering when extending a workflow.
 */
@Service
class ClinicianService {
  private final PassportApi api;
  private final AppointmentRepository appointments;
  private final AppointmentScheduler scheduler;
  private final AppointmentPolicy policy;

  ClinicianService(
      PassportApi api,
      AppointmentRepository appointments,
      AppointmentScheduler scheduler,
      AppointmentPolicy policy) {
    this.api = api;
    this.appointments = appointments;
    this.scheduler = scheduler;
    this.policy = policy;
  }

  private void requireDoctor(Map<String, Object> actor) {
    if (!api.role(actor).equals("doctor")) throw error(403, "Doctor access required");
  }

  private Map<String, Object> findOwned(String id, Map<String, Object> actor) {
    return appointments
        .findOwned(id, api.uid(actor))
        .orElseThrow(() -> error(404, "Appointment not found"));
  }

  private void requirePatientAccess(Map<String, Object> actor, String patient) {
    if (!api.hasGrant(actor, patient)) throw error(403, "Active patient permission is required");
  }

  private Map<String, Object> presentAppointment(
      Map<String, Object> appointment, Map<String, Object> actor) {
    boolean shared = api.hasGrant(actor, appointment.get("patient_id").toString());
    var patient =
        shared
            ? appointments.patientIdentity(appointment.get("patient_id").toString())
            : Map.<String, Object>of();
    Map<String, Object> result = new LinkedHashMap<>();
    for (String field :
        List.of(
            "id", "starts_at", "duration_minutes", "visit_mode", "status", "version", "updated_at"))
      result.put(field, appointment.get(field));
    result.put("patient_id", shared ? appointment.get("patient_id") : null);
    result.put("patient_name", shared ? patient.get("display_name") : "Access no longer available");
    result.put("health_id", shared ? patient.get("health_id") : null);
    result.put("reason", shared ? appointment.get("reason") : "");
    result.put("access", shared);
    result.put(
        "can_document",
        shared && api.allowed(actor, appointment.get("patient_id").toString(), "encounter"));
    result.put("completed_record_id", shared ? appointment.get("completed_record_id") : null);
    return result;
  }

  List<Map<String, Object>> list(String from, String to, Map<String, Object> actor) {
    synchronized (api) {
      requireDoctor(actor);
      long start, end;
      try {
        start = Instant.parse(from).toEpochMilli();
        end = Instant.parse(to).toEpochMilli();
      } catch (Exception invalidDate) {
        throw error(400, "Invalid date range");
      }
      if (end <= start || end - start > 93L * 86400000)
        throw error(400, "Date range must be between one and 93 days");
      var result =
          appointments.forDoctor(api.uid(actor), start, end).stream()
              .map(appointment -> presentAppointment(appointment, actor))
              .toList();
      api.audit(api.uid(actor), null, "SCHEDULE_READ", "own-schedule");
      return result;
    }
  }

  Map<String, Object> one(String appointmentId, Map<String, Object> actor) {
    synchronized (api) {
      requireDoctor(actor);
      var appointment = findOwned(appointmentId, actor);
      requirePatientAccess(actor, appointment.get("patient_id").toString());
      api.audit(
          api.uid(actor),
          appointment.get("patient_id").toString(),
          "APPOINTMENT_READ",
          appointmentId);
      return presentAppointment(appointment, actor);
    }
  }

  Map<String, Object> book(Map<String, Object> input, Map<String, Object> actor) {
    synchronized (api) {
      requireDoctor(actor);
      return api.tx.execute(
          transaction -> {
            scheduler.lockDoctor(actor);
            String patient = api.field(input, "patientId", 36),
                reason = api.field(input, "reason", 200).trim(),
                mode = api.field(input, "mode", 20),
                key = api.field(input, "requestKey", 80);
            requirePatientAccess(actor, patient);
            if (!Set.of("in_person", "video").contains(mode))
              throw error(400, "Invalid visit mode");
            long start = scheduler.timestamp(input);
            int duration = api.number(input, "duration", 5, 180, 30);
            var existing = appointments.findByRequest(api.uid(actor), key);
            if (!existing.isEmpty()) {
              var appointment = existing.getFirst();
              if (!patient.equals(appointment.get("patient_id"))
                  || start != ((Number) appointment.get("starts_at")).longValue()
                  || duration != ((Number) appointment.get("duration_minutes")).intValue()
                  || !reason.equals(appointment.get("reason"))
                  || !mode.equals(appointment.get("visit_mode")))
                throw error(409, "This booking request was already used");
              return presentAppointment(appointment, actor);
            }
            scheduler.slot(actor, start, duration, "");
            String appointmentId = id();
            appointments.insert(
                appointmentId,
                api.uid(actor),
                patient,
                start,
                duration,
                reason,
                mode,
                key,
                actor.get("organization_id"),
                now());
            api.audit(api.uid(actor), patient, "APPOINTMENT_BOOKED", appointmentId);
            return presentAppointment(findOwned(appointmentId, actor), actor);
          });
    }
  }

  Map<String, Object> update(
      String appointmentId, Map<String, Object> input, Map<String, Object> actor) {
    synchronized (api) {
      requireDoctor(actor);
      return api.tx.execute(
          transaction -> {
            scheduler.lockDoctor(actor);
            var appointment = findOwned(appointmentId, actor);
            int version = api.number(input, "version", 0, Integer.MAX_VALUE, -1);
            if (version != ((Number) appointment.get("version")).intValue())
              throw error(409, "Appointment changed. Refresh before trying again.");
            String old = appointment.get("status").toString(),
                status = api.field(input, "status", 20);
            if (policy.isClosed(old)) throw error(409, "Closed appointments cannot be changed");
            Set<String> next = policy.transitionsFrom(old);
            if (!next.contains(status)) throw error(400, "Invalid appointment transition");
            if (!status.equals("cancelled"))
              requirePatientAccess(actor, appointment.get("patient_id").toString());
            long start = ((Number) appointment.get("starts_at")).longValue();
            int duration = ((Number) appointment.get("duration_minutes")).intValue();
            if (input.containsKey("startsAt")) {
              if (!old.equals("scheduled") || !status.equals("scheduled"))
                throw error(409, "Only scheduled appointments can be rescheduled");
              start = scheduler.timestamp(input);
              duration = api.number(input, "duration", 5, 180, duration);
              scheduler.slot(actor, start, duration, appointmentId);
            }
            appointments.update(appointmentId, start, duration, status, now());
            api.audit(
                api.uid(actor),
                appointment.get("patient_id").toString(),
                "APPOINTMENT_UPDATED",
                appointmentId);
            return presentAppointment(findOwned(appointmentId, actor), actor);
          });
    }
  }

  private void requireDocumentationAccess(
      Map<String, Object> appointment, Map<String, Object> actor) {
    requirePatientAccess(actor, appointment.get("patient_id").toString());
    api.require(actor, appointment.get("patient_id").toString(), "encounter");
  }

  private Map<String, Object> readDraftData(String appointmentId) {
    return appointments.draft(appointmentId);
  }

  Map<String, Object> readDraft(String appointmentId, Map<String, Object> actor) {
    synchronized (api) {
      requireDoctor(actor);
      var appointment = findOwned(appointmentId, actor);
      requireDocumentationAccess(appointment, actor);
      api.audit(
          api.uid(actor),
          appointment.get("patient_id").toString(),
          "VISIT_DRAFT_READ",
          appointmentId);
      return readDraftData(appointmentId);
    }
  }

  // Draft saves carry a version; the final encounter is created only through the completion
  // endpoint.
  Map<String, Object> saveDraft(
      String appointmentId, Map<String, Object> input, Map<String, Object> actor) {
    synchronized (api) {
      requireDoctor(actor);
      return api.tx.execute(
          transaction -> {
            scheduler.lockDoctor(actor);
            var appointment = findOwned(appointmentId, actor);
            requireDocumentationAccess(appointment, actor);
            if (policy.isClosed(appointment.get("status").toString()))
              throw error(409, "This visit is closed");
            var visitDraft = readDraftData(appointmentId);
            int version = api.number(input, "version", 0, Integer.MAX_VALUE, -1);
            if (version != ((Number) visitDraft.get("version")).intValue())
              throw error(
                  409, "The draft changed in another window. Reopen the visit before editing.");
            VisitNote note;
            try {
              note = VisitNote.from(input);
            } catch (IllegalArgumentException invalid) {
              throw error(400, invalid.getMessage());
            }
            appointments.saveDraft(appointmentId, note, now());
            appointments.recordDraftRevision(
                id(),
                appointmentId,
                api.uid(actor),
                now(),
                api.provenance.encode(visitDraft),
                api.provenance.encode(readDraftData(appointmentId)));
            api.audit(
                api.uid(actor),
                appointment.get("patient_id").toString(),
                "VISIT_DRAFT_SAVED",
                appointmentId);
            return readDraftData(appointmentId);
          });
    }
  }

  // Completing a visit links the saved documentation to a clinical record. Keep appointment
  // state, draft version and permission checks together in the transaction.
  Map<String, Object> complete(
      String appointmentId, Map<String, Object> input, Map<String, Object> actor) {
    synchronized (api) {
      requireDoctor(actor);
      return api.tx.execute(
          transaction -> {
            scheduler.lockDoctor(actor);
            var appointment = findOwned(appointmentId, actor);
            requireDocumentationAccess(appointment, actor);
            if (appointment.get("completed_record_id") != null)
              return presentAppointment(appointment, actor);
            if (!appointment.get("status").equals("in_progress"))
              throw error(409, "Start the visit before completing it");
            if (!Boolean.TRUE.equals(input.get("reviewed")))
              throw error(400, "Review the note and confirm the patient before filing");
            var visitDraft = readDraftData(appointmentId);
            if (api.number(input, "version", 0, Integer.MAX_VALUE, -1)
                    != ((Number) appointment.get("version")).intValue()
                || api.number(input, "draftVersion", 0, Integer.MAX_VALUE, -1)
                    != ((Number) visitDraft.get("version")).intValue())
              throw error(409, "Visit changed. Refresh and review the latest note.");
            if (visitDraft.get("assessment").toString().isBlank()
                || visitDraft.get("plan").toString().isBlank())
              throw error(400, "Add an assessment and plan before filing");
            String text =
                VisitNote.from(visitDraft)
                    .formatEncounter(
                        Instant.ofEpochMilli(((Number) appointment.get("starts_at")).longValue()));
            var record =
                api.createForActor(
                    Map.of(
                        "patientId",
                        appointment.get("patient_id"),
                        "kind",
                        "encounter",
                        "title",
                        appointment.get("reason"),
                        "details",
                        text,
                        "encounterId",
                        appointmentId,
                        "sourceType",
                        "clinician_observation",
                        "source",
                        "Doctor consultation"),
                    actor);
            appointments.complete(appointmentId, record.get("id"), now());
            api.audit(
                api.uid(actor),
                appointment.get("patient_id").toString(),
                "VISIT_COMPLETED",
                appointmentId);
            return presentAppointment(findOwned(appointmentId, actor), actor);
          });
    }
  }
}
