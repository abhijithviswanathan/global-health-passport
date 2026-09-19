/**
 * Doctor appointments and encounter drafts. The doctor is resolved from the session,
 * not a client-supplied role. owned() scopes appointments to that doctor; access()
 * checks current patient permission before chart work. Draft and appointment versions
 * prevent one browser or mobile session from silently overwriting another.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/clinician")
public class ClinicianApi {
  final PassportApi api;
  static final Set<String> CLOSED = Set.of("completed", "cancelled", "no_show");

  ClinicianApi(PassportApi api) {
    this.api = api;
  }

  Map<String, Object> doctor(HttpServletRequest r) {
    var u = api.user(r);
    if (!api.role(u).equals("doctor")) throw error(403, "Doctor access required");
    return u;
  }

  Map<String, Object> owned(String id, Map<String, Object> u) {
    var rows =
        api.db.queryForList("select * from appointment where id=? and doctor_id=?", id, api.uid(u));
    if (rows.isEmpty()) throw error(404, "Appointment not found");
    return rows.getFirst();
  }

  // Serialize this doctor's booking checks inside a transaction to avoid overlapping concurrent inserts.
  void lockDoctor(Map<String, Object> u) {
    api.db.queryForMap("select id from app_user where id=? for update", api.uid(u));
  }

  void access(Map<String, Object> u, String p) {
    if (!api.hasGrant(u, p)) throw error(403, "Active patient permission is required");
  }

  long timestamp(Map<String, Object> b) {
    try {
      return Instant.parse(api.field(b, "startsAt", 40)).toEpochMilli();
    } catch (Exception e) {
      throw error(400, "Choose a valid appointment time");
    }
  }

  void slot(Map<String, Object> u, long start, int duration, String except) {
    api.tenants.available(u, Instant.ofEpochMilli(start), duration, except);
    long end = start + duration * 60000L;
    if (start < Instant.now().minusSeconds(300).toEpochMilli()
        || start > Instant.now().plusSeconds(366L * 86400).toEpochMilli())
      throw error(400, "Choose a time from now to one year ahead");
    if (api.db.queryForObject(
            "select count(*) from appointment where doctor_id=? and id<>? and status not in"
                + " ('cancelled','no_show') and starts_at < ? and starts_at + duration_minutes *"
                + " 60000 > ?",
            Integer.class,
            api.uid(u),
            except,
            end,
            start)
        > 0) throw error(409, "This time overlaps another appointment. Choose a different time.");
  }

  Map<String, Object> publicAppointment(Map<String, Object> a, Map<String, Object> u) {
    boolean access = api.hasGrant(u, a.get("patient_id").toString());
    var p =
        access
            ? api.db.queryForMap(
                "select display_name,health_id from app_user where id=?", a.get("patient_id"))
            : Map.<String, Object>of();
    Map<String, Object> result = new LinkedHashMap<>();
    for (String k :
        List.of(
            "id", "starts_at", "duration_minutes", "visit_mode", "status", "version", "updated_at"))
      result.put(k, a.get(k));
    result.put("patient_id", access ? a.get("patient_id") : null);
    result.put("patient_name", access ? p.get("display_name") : "Access no longer available");
    result.put("health_id", access ? p.get("health_id") : null);
    result.put("reason", access ? a.get("reason") : "");
    result.put("access", access);
    result.put(
        "can_document", access && api.allowed(u, a.get("patient_id").toString(), "encounter"));
    result.put("completed_record_id", access ? a.get("completed_record_id") : null);
    return result;
  }

  @GetMapping("/appointments")
  List<Map<String, Object>> list(
      @RequestParam String from, @RequestParam String to, HttpServletRequest r) {
    synchronized (api) {
      var u = doctor(r);
      long start, end;
      try {
        start = Instant.parse(from).toEpochMilli();
        end = Instant.parse(to).toEpochMilli();
      } catch (Exception e) {
        throw error(400, "Invalid date range");
      }
      if (end <= start || end - start > 93L * 86400000)
        throw error(400, "Date range must be between one and 93 days");
      var result =
          api
              .db
              .queryForList(
                  "select * from appointment where doctor_id=? and starts_at>=? and starts_at<?"
                      + " order by starts_at,id",
                  api.uid(u),
                  start,
                  end)
              .stream()
              .map(a -> publicAppointment(a, u))
              .toList();
      api.audit(api.uid(u), null, "SCHEDULE_READ", "own-schedule");
      return result;
    }
  }

  @GetMapping("/appointments/{aid}")
  Map<String, Object> one(@PathVariable String aid, HttpServletRequest r) {
    synchronized (api) {
      var u = doctor(r);
      var a = owned(aid, u);
      access(u, a.get("patient_id").toString());
      api.audit(api.uid(u), a.get("patient_id").toString(), "APPOINTMENT_READ", aid);
      return publicAppointment(a, u);
    }
  }

  @PostMapping("/appointments")
  Map<String, Object> book(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    synchronized (api) {
      api.csrf(r);
      var u = doctor(r);
      return api.tx.execute(
          s -> {
            lockDoctor(u);
            String p = api.field(b, "patientId", 36),
                reason = api.field(b, "reason", 200).trim(),
                mode = api.field(b, "mode", 20),
                key = api.field(b, "requestKey", 80);
            access(u, p);
            if (!Set.of("in_person", "video").contains(mode))
              throw error(400, "Invalid visit mode");
            long start = timestamp(b);
            int duration = api.number(b, "duration", 5, 180, 30);
            var existing =
                api.db.queryForList(
                    "select * from appointment where doctor_id=? and request_key=?",
                    api.uid(u),
                    key);
            if (!existing.isEmpty()) {
              var a = existing.getFirst();
              if (!p.equals(a.get("patient_id"))
                  || start != ((Number) a.get("starts_at")).longValue()
                  || duration != ((Number) a.get("duration_minutes")).intValue()
                  || !reason.equals(a.get("reason"))
                  || !mode.equals(a.get("visit_mode")))
                throw error(409, "This booking request was already used");
              return publicAppointment(a, u);
            }
            slot(u, start, duration, "");
            String aid = id();
            api.db.update(
                "insert into"
                    + " appointment(id,doctor_id,patient_id,starts_at,duration_minutes,reason,visit_mode,status,request_key,created_at,updated_at)"
                    + " values(?,?,?,?,?,?,?,'scheduled',?,?,?)",
                aid,
                api.uid(u),
                p,
                start,
                duration,
                reason,
                mode,
                key,
                now(),
                now());
            api.db.update(
                "update appointment set tenant_id=? where id=?", u.get("organization_id"), aid);
            api.audit(api.uid(u), p, "APPOINTMENT_BOOKED", aid);
            return publicAppointment(owned(aid, u), u);
          });
    }
  }

  @PatchMapping("/appointments/{aid}")
  Map<String, Object> update(
      @PathVariable String aid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    synchronized (api) {
      api.csrf(r);
      var u = doctor(r);
      return api.tx.execute(
          s -> {
            lockDoctor(u);
            var a = owned(aid, u);
            int version = api.number(b, "version", 0, Integer.MAX_VALUE, -1);
            if (version != ((Number) a.get("version")).intValue())
              throw error(409, "Appointment changed. Refresh before trying again.");
            String old = a.get("status").toString(), status = api.field(b, "status", 20);
            if (CLOSED.contains(old)) throw error(409, "Closed appointments cannot be changed");
            Set<String> next =
                switch (old) {
                  case "scheduled" ->
                      Set.of("scheduled", "checked_in", "in_progress", "cancelled", "no_show");
                  case "checked_in" -> Set.of("checked_in", "in_progress", "cancelled");
                  default -> Set.of("in_progress", "cancelled");
                };
            if (!next.contains(status)) throw error(400, "Invalid appointment transition");
            if (!status.equals("cancelled")) access(u, a.get("patient_id").toString());
            long start = ((Number) a.get("starts_at")).longValue();
            int duration = ((Number) a.get("duration_minutes")).intValue();
            if (b.containsKey("startsAt")) {
              if (!old.equals("scheduled") || !status.equals("scheduled"))
                throw error(409, "Only scheduled appointments can be rescheduled");
              start = timestamp(b);
              duration = api.number(b, "duration", 5, 180, duration);
              slot(u, start, duration, aid);
            }
            api.db.update(
                "update appointment set"
                    + " starts_at=?,duration_minutes=?,status=?,version=version+1,updated_at=?"
                    + " where id=?",
                start,
                duration,
                status,
                now(),
                aid);
            api.audit(api.uid(u), a.get("patient_id").toString(), "APPOINTMENT_UPDATED", aid);
            return publicAppointment(owned(aid, u), u);
          });
    }
  }

  void documentAccess(Map<String, Object> a, Map<String, Object> u) {
    access(u, a.get("patient_id").toString());
    api.require(u, a.get("patient_id").toString(), "encounter");
  }

  Map<String, Object> draft(String aid) {
    var rows =
        api.db.queryForList(
            "select subjective,objective,assessment,plan,version,updated_at from visit_draft where"
                + " appointment_id=?",
            aid);
    return rows.isEmpty()
        ? Map.of(
            "subjective",
            "",
            "objective",
            "",
            "assessment",
            "",
            "plan",
            "",
            "version",
            0,
            "updated_at",
            "")
        : rows.getFirst();
  }

  @GetMapping("/appointments/{aid}/draft")
  Map<String, Object> readDraft(@PathVariable String aid, HttpServletRequest r) {
    synchronized (api) {
      var u = doctor(r);
      var a = owned(aid, u);
      documentAccess(a, u);
      api.audit(api.uid(u), a.get("patient_id").toString(), "VISIT_DRAFT_READ", aid);
      return draft(aid);
    }
  }

  // Draft saves carry a version; the final encounter is created only through the completion endpoint.
  @PutMapping("/appointments/{aid}/draft")
  Map<String, Object> saveDraft(
      @PathVariable String aid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    synchronized (api) {
      api.csrf(r);
      var u = doctor(r);
      return api.tx.execute(
          s -> {
            lockDoctor(u);
            var a = owned(aid, u);
            documentAccess(a, u);
            if (CLOSED.contains(a.get("status"))) throw error(409, "This visit is closed");
            var d = draft(aid);
            int version = api.number(b, "version", 0, Integer.MAX_VALUE, -1);
            if (version != ((Number) d.get("version")).intValue())
              throw error(
                  409, "The draft changed in another window. Reopen the visit before editing.");
            List<String> values = new ArrayList<>();
            for (String field : List.of("subjective", "objective", "assessment", "plan")) {
              if (!(b.get(field) instanceof String text) || text.length() > 2000)
                throw error(400, "Each note section must be at most 2000 characters");
              values.add(text);
            }
            if (api.db.queryForObject(
                    "select count(*) from visit_draft where appointment_id=?", Integer.class, aid)
                == 0)
              api.db.update(
                  "insert into"
                      + " visit_draft(appointment_id,subjective,objective,assessment,plan,version,updated_at)"
                      + " values(?,?,?,?,?,1,?)",
                  aid,
                  values.get(0),
                  values.get(1),
                  values.get(2),
                  values.get(3),
                  now());
            else
              api.db.update(
                  "update visit_draft set"
                      + " subjective=?,objective=?,assessment=?,plan=?,version=version+1,updated_at=?"
                      + " where appointment_id=?",
                  values.get(0),
                  values.get(1),
                  values.get(2),
                  values.get(3),
                  now(),
                  aid);
            api.db.update(
                "insert into care_event values(?,?,?,?,?,?,?,?)",
                id(),
                "visit_draft",
                aid,
                api.uid(u),
                now(),
                "draft_saved",
                api.provenance.encode(d),
                api.provenance.encode(draft(aid)));
            api.audit(api.uid(u), a.get("patient_id").toString(), "VISIT_DRAFT_SAVED", aid);
            return draft(aid);
          });
    }
  }

  // Completing a visit links the saved documentation to a clinical record. Keep appointment
  // state, draft version and permission checks together in the transaction.
  @PostMapping("/appointments/{aid}/complete")
  Map<String, Object> complete(
      @PathVariable String aid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    synchronized (api) {
      api.csrf(r);
      var u = doctor(r);
      return api.tx.execute(
          s -> {
            lockDoctor(u);
            var a = owned(aid, u);
            documentAccess(a, u);
            if (a.get("completed_record_id") != null) return publicAppointment(a, u);
            if (!a.get("status").equals("in_progress"))
              throw error(409, "Start the visit before completing it");
            if (!Boolean.TRUE.equals(b.get("reviewed")))
              throw error(400, "Review the note and confirm the patient before filing");
            var d = draft(aid);
            if (api.number(b, "version", 0, Integer.MAX_VALUE, -1)
                    != ((Number) a.get("version")).intValue()
                || api.number(b, "draftVersion", 0, Integer.MAX_VALUE, -1)
                    != ((Number) d.get("version")).intValue())
              throw error(409, "Visit changed. Refresh and review the latest note.");
            if (d.get("assessment").toString().isBlank() || d.get("plan").toString().isBlank())
              throw error(400, "Add an assessment and plan before filing");
            String text =
                "Scheduled visit date: "
                    + Instant.ofEpochMilli(((Number) a.get("starts_at")).longValue())
                    + "\n\nSubjective\n"
                    + d.get("subjective")
                    + "\n\nObjective\n"
                    + d.get("objective")
                    + "\n\nAssessment\n"
                    + d.get("assessment")
                    + "\n\nPlan\n"
                    + d.get("plan");
            var record =
                api.create(
                    Map.of(
                        "patientId",
                        a.get("patient_id"),
                        "kind",
                        "encounter",
                        "title",
                        a.get("reason"),
                        "details",
                        text,
                        "encounterId",
                        aid,
                        "sourceType",
                        "clinician_observation",
                        "source",
                        "Doctor consultation"),
                    r);
            api.db.update(
                "update appointment set"
                    + " status='completed',completed_record_id=?,version=version+1,updated_at=?"
                    + " where id=?",
                record.get("id"),
                now(),
                aid);
            api.audit(api.uid(u), a.get("patient_id").toString(), "VISIT_COMPLETED", aid);
            return publicAppointment(owned(aid, u), u);
          });
    }
  }
}
