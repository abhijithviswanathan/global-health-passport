/**
 * Organization clinical execution: structured orders, nursing entries and handoffs.
 * Uses EcosystemApi for organization identity and CareApi for patient scope checks.
 * Order changes may create linked clinical records and care tasks in one transaction;
 * keep those links and ownership checks together when adding an order state.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ecosystem")
class ClinicalOperationsApi {
  final EcosystemApi eco;
  final PassportApi api;
  final CareApi care;

  ClinicalOperationsApi(EcosystemApi eco) {
    this.eco = eco;
    this.api = eco.api;
    this.care = eco.care;
  }

  Map<String, Object> actor(HttpServletRequest r) {
    var u = eco.staff(r);
    if (!eco.tenants.trusted(u)) throw error(403, "Verified organization required");
    return u;
  }

  // Map the operational order kind to the clinical consent scope before viewing or changing it.
  void access(Map<String, Object> u, Map<String, Object> o) {
    care.access(u, o.get("patient_id").toString(), scope(o.get("kind").toString()));
  }

  static String scope(String kind) {
    return switch (kind) {
      case "laboratory" -> "lab_order";
      case "imaging" -> "imaging_order";
      case "medication" -> "prescription";
      default -> "referral";
    };
  }

  @GetMapping("/orders")
  List<Map<String, Object>> orders(HttpServletRequest r) {
    var u = actor(r);
    return api
        .db
        .queryForList(
            "select o.*,p.display_name as patient_name,p.health_id,u.display_name as"
                + " assignee_name,d.display_name as requester_name from clinical_order o join"
                + " app_user p on o.patient_id=p.id join app_user u on o.assigned_id=u.id join"
                + " app_user d on o.requester_id=d.id where o.organization_id=? order by"
                + " o.created_at desc",
            eco.tenants.org(u))
        .stream()
        .filter(
            o -> {
              try {
                access(u, o);
                return Set.of("doctor", "nurse").contains(api.role(u))
                    || Objects.equals(o.get("assigned_id"), api.uid(u));
              } catch (Exception ex) {
                return false;
              }
            })
        .toList();
  }

  @PostMapping("/orders")
  Map<String, Object> order(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = actor(r);
    eco.roles(u, "doctor");
    String kind = eco.field(b, "kind", 30);
    if (!Set.of("laboratory", "imaging", "medication", "procedure", "consultation", "therapy")
        .contains(kind)) throw error(400, "Unsupported order type");
    String patient = eco.field(b, "patientId", 36),
        recipient = eco.field(b, "assigneeId", 36),
        encounter = eco.opt(b, "encounterId", 36),
        code = eco.field(b, "code", 100),
        instructions = eco.field(b, "instructions", 4000),
        priority = eco.field(b, "priority", 20);
    if (!Set.of("routine", "high", "urgent").contains(priority))
      throw error(400, "Invalid priority");
    var target = care.person(recipient);
    if (!care.same(u, target))
      throw error(403, "Order recipient must belong to your organization and clinic");
    String role = api.role(target);
    if ((kind.equals("laboratory") && !role.equals("lab"))
        || (kind.equals("imaging") && !role.equals("diagnostic"))
        || (kind.equals("medication") && !role.equals("pharmacy")))
      throw error(400, "Choose the appropriate service recipient");
    return eco.atomic(
        () -> {
          var payload = new LinkedHashMap<String, Object>(b);
          payload.put("kind", scope(kind));
          payload.put("patientId", patient);
          payload.put("title", code);
          payload.put("details", instructions);
          payload.put("sourceType", "clinician_observation");
          payload.put("source", "Structured clinical order");
          payload.put("recipientId", recipient);
          payload.put("idempotencyKey", eco.field(b, "requestKey", 100));
          if (encounter != null) payload.put("encounterId", encounter);
          var record = care.record(payload, r);
          String recordId = record.get("id").toString();
          var previous =
              api.db.queryForList("select * from clinical_order where record_id=?", recordId);
          if (!previous.isEmpty()) return previous.getFirst();
          var task = new LinkedHashMap<String, Object>();
          task.put("patientId", patient);
          task.put("scope", scope(kind));
          task.put("encounterId", encounter);
          task.put("assigneeId", recipient);
          task.put("title", code);
          task.put("details", instructions);
          task.put("priority", priority);
          task.put("requestKey", "order:" + recordId);
          var t = care.taskCreate(task, r);
          String oid = id();
          api.db.update(
              "insert into"
                  + " clinical_order(id,organization_id,record_id,patient_id,encounter_id,kind,code,modality,instructions,priority,status,assigned_id,requester_id,task_id,specimen_type,specimen_code,created_at,updated_at)"
                  + " values(?,?,?,?,?,?,?,?,?,?,'ordered',?,?,?,?,?,?,?)",
              oid,
              eco.tenants.org(u),
              recordId,
              patient,
              encounter,
              kind,
              code,
              eco.opt(b, "modality", 30),
              instructions,
              priority,
              recipient,
              api.uid(u),
              t.get("id"),
              eco.opt(b, "specimenType", 80),
              kind.equals("laboratory") ? "SP-" + HealthIds.generate() : null,
              now(),
              now());
          api.db.update(
              "update care_task set task_type=?,tenant_id=? where id=?",
              kind,
              eco.tenants.org(u),
              t.get("id"));
          var result = eco.row("clinical_order", oid, u);
          eco.event(u, "order", oid, "order_created", null, result, priority, patient);
          return result;
        });
  }

  // State transitions validate the acting team/recipient and linked work. A changed status may
  // require a report or dispensing record; it is not a generic editable text field.
  @PatchMapping("/orders/{oid}")
  Map<String, Object> update(
      @PathVariable String oid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = actor(r);
    return eco.atomic(
        () -> {
          var old = eco.row("clinical_order", oid, u);
          access(u, old);
          eco.version(b, old);
          String next = eco.field(b, "status", 30),
              kind = old.get("kind").toString(),
              status = old.get("status").toString();
          boolean doctor = api.role(u).equals("doctor"), nurse = api.role(u).equals("nurse");
          if (!Objects.equals(old.get("assigned_id"), api.uid(u))
              && !(nurse && kind.equals("laboratory") && next.equals("specimen_collected"))
              && !(doctor && Set.of("reviewed", "report_signed").contains(next)))
            throw error(
                403, "Only the assigned service or responsible clinician may update this order");
          if (next.equals("reviewed") && !Objects.equals(old.get("requester_id"), api.uid(u)))
            throw error(403, "Ordering clinician must review the result");
          List<String> flow =
              kind.equals("laboratory")
                  ? List.of(
                      "ordered",
                      "accepted",
                      "specimen_collected",
                      "processing",
                      "result_pending",
                      "result_ready",
                      "reviewed",
                      "completed")
                  : kind.equals("imaging")
                      ? List.of(
                          "ordered",
                          "scheduled",
                          "patient_arrived",
                          "imaging",
                          "study_available",
                          "interpretation",
                          "result_ready",
                          "report_signed",
                          "reviewed",
                          "completed")
                      : List.of("ordered", "accepted", "in_progress", "completed");
          int index = flow.indexOf(status);
          if (index < 0 || index + 1 >= flow.size() || !flow.get(index + 1).equals(next))
            throw error(409, "Complete the preceding order stage first");
          if (next.equals("specimen_collected")) {
            if (!Objects.equals(old.get("specimen_code"), b.get("specimenCode"))
                || !Objects.equals(
                    care.person(old.get("patient_id").toString()).get("health_id"),
                    b.get("patientHealthId")))
              throw error(409, "Patient and specimen identifiers do not match");
            api.db.update(
                "update clinical_order set collected_by=?,collected_at=? where id=?",
                api.uid(u),
                eco.instant(b, "observedAt", true),
                oid);
          }
          if (next.equals("study_available")) {
            String study = eco.field(b, "studyUid", 100);
            if (!study.matches("[0-9]+(\\.[0-9]+)+") || study.length() > 64)
              throw error(400, "Use a valid DICOM Study Instance UID");
            api.db.update("update clinical_order set study_uid=? where id=?", study, oid);
          }
          if (next.equals("result_ready")) {
            String report = eco.field(b, "report", 10000);
            var payload = new LinkedHashMap<String, Object>();
            payload.put("patientId", old.get("patient_id"));
            payload.put("encounterId", old.get("encounter_id"));
            payload.put("kind", kind.equals("laboratory") ? "lab_result" : "imaging_report");
            payload.put("relatedId", old.get("record_id"));
            payload.put("title", old.get("code") + " result");
            payload.put("details", report);
            payload.put("observedAt", eco.instant(b, "observedAt", true));
            payload.put(
                "sourceType", kind.equals("laboratory") ? "laboratory" : "clinician_observation");
            payload.put(
                "source", kind.equals("laboratory") ? "Laboratory result" : "Imaging report");
            payload.put("idempotencyKey", "result:" + oid);
            var record = care.record(payload, r);
            api.db.update(
                "update clinical_order set result_id=?,critical=? where id=?",
                record.get("id"),
                Boolean.TRUE.equals(b.get("critical")),
                oid);
          }
          if (Set.of("report_signed", "reviewed").contains(next)) {
            if (old.get("result_id") == null) throw error(409, "A result must be recorded first");
            eco.field(b, "review", 1000);
            if (!Boolean.TRUE.equals(b.get("reviewed")))
              throw error(400, "Confirm that you reviewed the result");
            if (next.equals("report_signed")
                && !eco.tenants.employment(u).get("professional_role").equals("radiologist"))
              throw error(403, "Radiologist reporting privileges required");
            var result = care.clinical(old.get("result_id").toString(), u);
            api.db.update(
                "insert into clinical_attestation values(?,?,?,?,?,?,?)",
                id(),
                eco.tenants.org(u),
                result.get("id"),
                api.uid(u),
                IdentityService.hash(result.get("details").toString()),
                now(),
                next);
            if (next.equals("reviewed"))
              care.review(result.get("id").toString(), Map.of("comment", b.get("review")), r);
          }
          api.db.update(
              "update clinical_order set status=?,updated_at=?,version=version+1 where id=?",
              next,
              now(),
              oid);
          if (!next.equals("completed"))
            api.db.update(
                "update care_task set status=?,updated_at=?,version=version+1 where id=? and status"
                    + " not in ('completed','cancelled')",
                next.equals("accepted") || next.equals("scheduled") ? "accepted" : "in_progress",
                now(),
                old.get("task_id"));
          if (next.equals("completed"))
            api.db.update(
                "update care_task set"
                    + " status='completed',completed_at=?,updated_at=?,version=version+1 where"
                    + " id=?",
                now(),
                now(),
                old.get("task_id"));
          var after = eco.row("clinical_order", oid, u);
          eco.event(
              u,
              "order",
              oid,
              "order_" + next,
              old,
              after,
              Boolean.TRUE.equals(after.get("critical")) ? "critical" : "routine",
              old.get("patient_id").toString());
          return after;
        });
  }

  @PostMapping("/nursing")
  Map<String, Object> nursing(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = actor(r);
    eco.roles(u, "nurse");
    String type = eco.field(b, "entryType", 40);
    if (!Set.of(
            "pain",
            "assessment",
            "observation",
            "intake_output",
            "medication_administration",
            "wound",
            "patient_status",
            "nursing_note")
        .contains(type)) throw error(400, "Unsupported nursing entry");
    String patient = eco.field(b, "patientId", 36), prescription = eco.opt(b, "prescriptionId", 36);
    int pain = api.number(b, "painScore", 0, 10, 0),
        intake = api.number(b, "intakeMl", 0, 100000, 0),
        output = api.number(b, "outputMl", 0, 100000, 0);
    if (type.equals("medication_administration")) {
      if (!Set.of("nurse", "nurse_practitioner")
          .contains(eco.tenants.employment(u).get("professional_role")))
        throw error(403, "Medication administration privileges required");
      if (prescription == null) throw error(400, "Select an active authorized prescription");
      var rx = care.clinical(prescription, u);
      if (!patient.equals(rx.get("patient_id"))
          || !"prescription".equals(rx.get("kind"))
          || !"active".equals(rx.get("status")))
        throw error(409, "Prescription does not match this patient or is inactive");
      eco.field(b, "dose", 120);
      eco.field(b, "route", 80);
      if (!Boolean.TRUE.equals(b.get("identityChecked")))
        throw error(400, "Confirm patient, prescription, dose, route and time");
    }
    return eco.atomic(
        () -> {
          var payload = new LinkedHashMap<String, Object>(b);
          payload.put("kind", "nursing_observation");
          payload.put("title", type.replace('_', ' '));
          String details = eco.field(b, "details", 6000);
          if (type.equals("pain")) details += "\nPain score: " + pain + "/10";
          if (type.equals("intake_output"))
            details += "\nIntake: " + intake + " mL; output: " + output + " mL";
          if (type.equals("medication_administration"))
            details += "\nAdministered dose: " + b.get("dose") + "; route: " + b.get("route");
          payload.put("details", details);
          payload.put("sourceType", "nurse_observation");
          payload.put("source", "Direct nursing entry");
          payload.put("idempotencyKey", eco.field(b, "requestKey", 100));
          payload.put("observedAt", eco.instant(b, "observedAt", true));
          var record = care.record(payload, r);
          if (api.db.queryForObject(
                  "select count(*) from nursing_entry where record_id=?",
                  Integer.class,
                  record.get("id"))
              == 0) {
            String nid = id();
            api.db.update(
                "insert into"
                    + " nursing_entry(id,organization_id,record_id,entry_type,prescription_id,dose,route,pain_score,intake_ml,output_ml,room)"
                    + " values(?,?,?,?,?,?,?,?,?,?,?)",
                nid,
                eco.tenants.org(u),
                record.get("id"),
                type,
                prescription,
                eco.opt(b, "dose", 120),
                eco.opt(b, "route", 80),
                type.equals("pain") ? pain : null,
                type.equals("intake_output") ? intake : null,
                type.equals("intake_output") ? output : null,
                eco.opt(b, "room", 100));
            eco.event(
                u,
                "nursing",
                nid,
                "nursing_entry_created",
                null,
                Map.of("record", record.get("id"), "type", type),
                "routine",
                patient);
          }
          return record;
        });
  }

  @GetMapping("/handoffs")
  List<Map<String, Object>> handoffs(HttpServletRequest r) {
    var u = actor(r);
    return api
        .db
        .queryForList(
            "select h.*,p.display_name as patient_name,a.display_name as"
                + " outgoing_name,b.display_name as incoming_name from shift_handoff h join"
                + " app_user p on h.patient_id=p.id join app_user a on h.outgoing_id=a.id join"
                + " app_user b on h.incoming_id=b.id where h.organization_id=? and (h.outgoing_id=?"
                + " or h.incoming_id=?) order by h.created_at desc",
            eco.tenants.org(u),
            api.uid(u),
            api.uid(u))
        .stream()
        .filter(
            h ->
                care.assigned(u, h.get("patient_id").toString(), "nursing_observation")
                    && api.allowed(u, h.get("patient_id").toString(), "nursing_observation"))
        .toList();
  }

  @PostMapping("/handoffs")
  Map<String, Object> handoff(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = actor(r);
    eco.roles(u, "doctor", "nurse");
    String patient = eco.field(b, "patientId", 36), incoming = eco.field(b, "incomingId", 36);
    var target = care.person(incoming);
    if (!care.same(u, target)) throw error(403, "Incoming staff must be on the same clinic team");
    care.access(u, patient, "nursing_observation");
    care.access(target, patient, "nursing_observation");
    String encounter = eco.opt(b, "encounterId", 36);
    care.linked(u, patient, encounter, "nursing_observation");
    String details =
        String.join(
            "\n\n",
            List.of(
                "Patient status: " + eco.field(b, "patientStatus", 2000),
                "Pending tasks: " + eco.field(b, "pendingTasks", 2000),
                "Medication attention: " + eco.field(b, "medications", 2000),
                "Tests awaiting results: " + eco.field(b, "tests", 2000),
                "Observations: " + eco.field(b, "observations", 2000),
                "Escalation concerns: " + eco.field(b, "concerns", 2000)));
    return eco.atomic(
        () -> {
          String hid = id();
          api.db.update(
              "insert into"
                  + " shift_handoff(id,organization_id,patient_id,encounter_id,outgoing_id,incoming_id,details,status,created_at)"
                  + " values(?,?,?,?,?,?,?,'sent',?)",
              hid,
              eco.tenants.org(u),
              patient,
              encounter,
              api.uid(u),
              incoming,
              details,
              now());
          eco.event(
              u, "handoff", hid, "handoff_sent", null, Map.of("status", "sent"), "high", patient);
          return eco.row("shift_handoff", hid, u);
        });
  }

  @PostMapping("/handoffs/{hid}/acknowledge")
  Map<String, Object> acknowledge(
      @PathVariable String hid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = actor(r);
    return eco.atomic(
        () -> {
          var h = eco.row("shift_handoff", hid, u);
          if (!Objects.equals(h.get("incoming_id"), api.uid(u)))
            throw error(403, "Incoming employee must acknowledge");
          care.access(u, h.get("patient_id").toString(), "nursing_observation");
          eco.version(b, h);
          if (!h.get("status").equals("sent")) throw error(409, "Handoff already acknowledged");
          api.db.update(
              "update shift_handoff set status='acknowledged',acknowledged_at=?,version=version+1"
                  + " where id=?",
              now(),
              hid);
          eco.event(u, "handoff", hid, "handoff_acknowledged", h, Map.of("acknowledged", true));
          return eco.row("shift_handoff", hid, u);
        });
  }

  @GetMapping("/operations")
  Map<String, Object> operations(HttpServletRequest r) {
    var u = actor(r);
    eco.roles(u, "admin", "coordinator", "reception", "security", "billing");
    String oid = eco.tenants.org(u);
    return Map.of(
        "workingStaff",
        eco.shifts(r).stream()
            .filter(
                s ->
                    s.get("status").equals("active")
                        && !eco.shifts(r).stream()
                            .anyMatch(
                                block ->
                                    block.get("employee_id").equals(s.get("employee_id"))
                                        && block.get("status").equals("active")
                                        && Set.of("leave", "break", "procedure", "on_call")
                                            .contains(block.get("kind"))
                                        && !Instant.parse(block.get("starts_at").toString())
                                            .isAfter(Instant.now())
                                        && Instant.parse(block.get("ends_at").toString())
                                            .isAfter(Instant.now()))
                        && Set.of("shift", "coverage", "rotation", "substitution")
                            .contains(s.get("kind"))
                        && !Instant.parse(s.get("starts_at").toString()).isAfter(Instant.now())
                        && Instant.parse(s.get("ends_at").toString()).isAfter(Instant.now()))
            .count(),
        "orderWorkload",
        api.db.queryForList(
            "select kind,status,count(*) as count from clinical_order where organization_id=? group"
                + " by kind,status",
            oid),
        "taskWorkload",
        api.db.queryForList(
            "select status,priority,count(*) as count from care_task where organization=? group by"
                + " status,priority",
            u.get("organization")),
        "appointmentCount",
        api.db.queryForObject(
            "select count(*) from appointment a join app_user d on a.doctor_id=d.id where"
                + " d.organization_id=? and a.starts_at>?",
            Integer.class,
            oid,
            Instant.now().toEpochMilli()));
  }
}
