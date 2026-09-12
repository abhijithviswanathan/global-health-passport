package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/care")
class CareApi {
  final PassportApi api;
  final RecordProvenance provenance;
  final ClinicianApi clinician;
  static final Set<String> STAFF =
      Set.of(
          "doctor", "nurse", "reception", "lab", "diagnostic", "coordinator", "admin", "pharmacy");
  static final Set<String> OPERATIONS = Set.of("reception", "coordinator", "admin");

  CareApi(PassportApi api, RecordProvenance provenance, ClinicianApi clinician) {
    this.api = api;
    this.provenance = provenance;
    this.clinician = clinician;
  }

  @PostConstruct
  void demoStaff() {
    if (!api.demo) return;
    var doctor = api.byUsername("doctor");
    if (doctor == null) return;
    for (String role : List.of("nurse", "reception", "diagnostic", "coordinator"))
      if (api.byUsername(role) == null)
        api.db.update(
            "insert into"
                + " app_user(id,username,display_name,role,password_hash,organization,clinic,department)"
                + " values(?,?,?,?,?,?,?,?)",
            id(),
            role,
            role + " (Synthetic)",
            role,
            doctor.get("password_hash"),
            "Northstar Demo Network",
            "Northstar Clinic",
            role.equals("diagnostic") ? "Diagnostics" : "General care");
    for (var u :
        api.db.queryForList(
            "select * from app_user where organization='Northstar Demo Network' and display_name"
                + " like '%(Synthetic)%'")) {
      api.db.update(
          "update app_user set clinic=coalesce(clinic,'Northstar"
              + " Clinic'),department=coalesce(department,'General care') where id=?",
          api.uid(u));
      if (Set.of("nurse", "diagnostic").contains(api.role(u))
          && api.db.queryForObject(
                  "select count(*) from practitioner_verification where user_id=?",
                  Integer.class,
                  api.uid(u))
              == 0)
        api.db.update(
            "insert into practitioner_verification values(?,?,?,?,?)",
            api.uid(u),
            "synthetic_verified",
            "Synthetic fixture only",
            now(),
            null);
    }
  }

  @PostConstruct
  void legacySnapshots() {
    for (var doc :
        api.db.queryForList(
            "select * from medical_document where provenance_record_id is null and"
                + " document_purpose='clinical'")) {
      if (api.db.queryForObject(
              "select count(*) from clinical_record where id=?", Integer.class, doc.get("id"))
          == 0)
        api.db.update(
            "insert into"
                + " clinical_record(id,patient_id,kind,title,details,author_id,source,status,created_at,source_type)"
                + " values(?,?,'document',?,?,?,?,?,?,'uploaded_document')",
            doc.get("id"),
            doc.get("patient_id"),
            doc.get("filename"),
            "Uploaded document. Original observation date and earlier changes unknown.",
            doc.get("author_id"),
            doc.get("source"),
            "active",
            doc.get("created_at"));
      api.db.update(
          "update medical_document set provenance_record_id=? where id=?",
          doc.get("id"),
          doc.get("id"));
    }
    for (var record :
        api.db.queryForList(
            "select * from clinical_record r where not exists(select 1 from record_revision v where"
                + " v.record_id=r.id)"))
      provenance.revision(
          record.get("id").toString(),
          null,
          "legacy_snapshot",
          "Snapshot at migration; earlier edit history and observation dates are unknown",
          null);
  }

  Map<String, Object> staff(HttpServletRequest r) {
    var u = api.user(r);
    if (!STAFF.contains(api.role(u))) throw error(403, "Staff workspace required");
    if (u.get("clinic") == null) throw error(403, "An administrator must assign your clinic first");
    return u;
  }

  boolean same(Map<String, Object> a, Map<String, Object> b) {
    return Objects.equals(a.get("organization"), b.get("organization"))
        && Objects.equals(a.get("clinic"), b.get("clinic"));
  }

  void manager(Map<String, Object> u) {
    if (!Set.of("admin", "coordinator").contains(api.role(u)))
      throw error(403, "Coordinator or administrator required");
  }

  Map<String, Object> person(String id) {
    var rows = api.db.queryForList("select * from app_user where id=?", id);
    if (rows.isEmpty()) throw error(404, "Person not found");
    return rows.getFirst();
  }

  boolean assigned(Map<String, Object> u, String p, String scope) {
    return api
        .db
        .queryForList(
            "select * from care_assignment where patient_id=? and staff_id=? and active=true",
            p,
            api.uid(u))
        .stream()
        .anyMatch(
            a ->
                same(a, u)
                    && Instant.parse(a.get("expires_at").toString()).isAfter(Instant.now())
                    && Arrays.asList(a.get("scopes").toString().split(",")).contains(scope));
  }

  void access(Map<String, Object> u, String p, String scope) {
    if (p == null) return;
    if (!assigned(u, p, scope))
      throw error(403, "An active clinic assignment for this work is required");
    if (!scope.equals("registration")) api.require(u, p, scope);
    else if (!OPERATIONS.contains(api.role(u))
        && !api.role(u).equals("doctor")
        && !api.role(u).equals("nurse")) throw error(403, "Registration access required");
  }

  void linked(Map<String, Object> u, String p, String encounter, String scope) {
    access(u, p, scope);
    if (encounter != null
        && (p == null
            || api.db.queryForObject(
                    "select count(*) from appointment where id=? and patient_id=?",
                    Integer.class,
                    encounter,
                    p)
                != 1)) throw error(400, "Encounter and patient must match");
  }

  void lock(String table, String id) {
    if (!Set.of("care_task", "clinical_record", "appointment", "care_assignment").contains(table))
      throw error(400, "Invalid resource");
    if (api.db.queryForList("select id from " + table + " where id=? for update", id).isEmpty())
      throw error(404, "Resource not found");
  }

  void version(Map<String, Object> b, Map<String, Object> row, String key) {
    if (api.number(b, "version", 0, Integer.MAX_VALUE, -1) != ((Number) row.get(key)).intValue())
      throw error(409, "This item changed. Refresh and review before saving again.");
  }

  String opt(Map<String, Object> b, String key, int max) {
    return provenance.optional(b, key, max);
  }

  void event(
      String type, String rid, Map<String, Object> u, String action, Object before, Object after) {
    api.db.update(
        "insert into care_event values(?,?,?,?,?,?,?,?)",
        id(),
        type,
        rid,
        api.uid(u),
        now(),
        action,
        before == null ? null : provenance.encode(before),
        provenance.encode(after));
    if (u.get("organization_id") != null)
      api.db.update(
          "insert into"
              + " organization_event(id,organization_id,actor_id,resource_type,resource_id,action,severity,created_at)"
              + " values(?,?,?,?,?,?,?,?)",
          id(),
          u.get("organization_id"),
          api.uid(u),
          type,
          rid,
          action,
          "routine",
          now());
    api.audit(api.uid(u), null, "CARE_" + action.toUpperCase(), rid);
  }

  List<String> strings(Map<String, Object> b, String key, int max) {
    Object raw = b.getOrDefault(key, List.of());
    if (!(raw instanceof List<?> list)
        || list.size() > max
        || list.stream().anyMatch(x -> !(x instanceof String) || x.toString().length() > 100))
      throw error(400, "Invalid " + key);
    return ((List<?>) raw).stream().map(Object::toString).distinct().toList();
  }

  @GetMapping("/workspace")
  Map<String, Object> workspace(HttpServletRequest r) {
    var u = staff(r);
    var patients = new ArrayList<Map<String, Object>>();
    for (var a :
        api.db.queryForList(
            "select * from care_assignment where staff_id=? and active=true", api.uid(u)))
      if (same(a, u) && Instant.parse(a.get("expires_at").toString()).isAfter(Instant.now())) {
        var p = person(a.get("patient_id").toString());
        var row = new LinkedHashMap<>(api.publicUser(p));
        row.put("assignment", a);
        patients.add(row);
      }
    var result = new LinkedHashMap<String, Object>();
    result.put("user", api.publicUser(u));
    result.put("clinic", u.get("clinic"));
    result.put("department", u.get("department"));
    result.put("patients", patients);
    result.put(
        "staff",
        api.db.queryForList(
            "select id,username,display_name as"
                + " name,role,organization,clinic,department,staff_active,staff_version,(select"
                + " status from practitioner_verification v where v.user_id=app_user.id) as"
                + " verification_status from app_user where organization=? and clinic=? and"
                + " role<>'patient'",
            u.get("organization"),
            u.get("clinic")));
    result.put("tasks", tasks(r));
    result.put("conversations", conversations(r));
    result.put("appointments", appointments(r));
    result.put("services", services(r));
    result.put("freshnessRules", freshnessRules(u));
    return result;
  }

  @GetMapping("/assignments")
  List<Map<String, Object>> assignments(HttpServletRequest r) {
    var u = staff(r);
    manager(u);
    return api.db.queryForList(
        "select a.*,p.display_name as patient_name,s.display_name as staff_name from"
            + " care_assignment a join app_user p on p.id=a.patient_id join app_user s on"
            + " s.id=a.staff_id where a.organization=? and a.clinic=?",
        u.get("organization"),
        u.get("clinic"));
  }

  @PostMapping("/assignments")
  synchronized Map<String, Object> assign(
      @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    manager(u);
    return atomic(
        tx -> {
          String p;
          if (b.containsKey("patientId")) p = api.field(b, "patientId", 36);
          else {
            var found =
                api.db.queryForList(
                    "select id from app_user where health_id=? and role='patient'",
                    HealthIds.normalize(api.field(b, "healthId", 20)));
            if (found.isEmpty()) throw error(404, "Patient not found");
            p = found.getFirst().get("id").toString();
          }
          String sid = api.field(b, "staffId", 36);
          var patient = person(p);
          var target = person(sid);
          if (!api.role(patient).equals("patient")
              || (!Objects.equals(patient.get("organization"), u.get("organization"))
                  && api.db.queryForObject(
                          "select count(*) from care_assignment where patient_id=? and"
                              + " organization=? and clinic=? and active=true",
                          Integer.class,
                          p,
                          u.get("organization"),
                          u.get("clinic"))
                      == 0)
              || !same(target, u)
              || !STAFF.contains(api.role(target)))
            throw error(403, "Assignments must stay inside your organization and clinic");
          var scopes = strings(b, "scopes", 30);
          if (scopes.isEmpty()
              || scopes.stream()
                  .anyMatch(x -> !PassportApi.KINDS.contains(x) && !x.equals("registration")))
            throw error(400, "Choose valid access scopes");
          String expires = provenance.time(b, "expiresAt");
          if (expires == null || !OffsetDateTime.parse(expires).toInstant().isAfter(Instant.now()))
            throw error(400, "Future assignment expiry required");
          var rows =
              api.db.queryForList(
                  "select * from care_assignment where patient_id=? and staff_id=? for update",
                  p,
                  sid);
          String aid = rows.isEmpty() ? id() : rows.getFirst().get("id").toString();
          if (rows.isEmpty())
            api.db.update(
                "insert into"
                    + " care_assignment(id,patient_id,staff_id,organization,clinic,scopes,expires_at,assigned_by,created_at)"
                    + " values(?,?,?,?,?,?,?,?,?)",
                aid,
                p,
                sid,
                u.get("organization"),
                u.get("clinic"),
                String.join(",", scopes),
                expires,
                api.uid(u),
                now());
          else {
            version(b, rows.getFirst(), "version");
            api.db.update(
                "update care_assignment set scopes=?,expires_at=?,active=?,version=version+1 where"
                    + " id=?",
                String.join(",", scopes),
                expires,
                !Boolean.FALSE.equals(b.get("active")),
                aid);
          }
          var a = api.db.queryForMap("select * from care_assignment where id=?", aid);
          event(
              "assignment", aid, u, "assignment_saved", rows.isEmpty() ? null : rows.getFirst(), a);
          return a;
        });
  }

  @PostMapping("/staff")
  synchronized Map<String, Object> provision(
      @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    if (!api.role(u).equals("admin")) throw error(403, "Administrator required");
    String username = api.field(b, "username", 80),
        name = api.field(b, "name", 150),
        role = api.field(b, "role", 20),
        department = api.field(b, "department", 100),
        password = api.field(b, "password", 72);
    if (!username.matches("[a-zA-Z0-9._-]{3,80}")
        || password.length() < 12
        || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72)
      throw error(
          400, "Use a valid username and a password of at least 12 characters (at most 72 bytes)");
    if (!STAFF.contains(role) || role.equals("admin"))
      throw error(400, "Choose a supported staff role");
    return atomic(
        tx -> {
          if (api.byUsername(username) != null) throw error(409, "Username already exists");
          String sid = id();
          api.db.update(
              "insert into"
                  + " app_user(id,username,display_name,role,password_hash,organization,clinic,department)"
                  + " values(?,?,?,?,?,?,?,?)",
              sid,
              username,
              name,
              role,
              api.passwords.encode(password),
              u.get("organization"),
              u.get("clinic"),
              department);
          event(
              "staff",
              sid,
              u,
              "staff_created",
              null,
              Map.of("name", name, "role", role, "department", department));
          api.db.update(
              "update app_user set organization_id=? where id=?", u.get("organization_id"), sid);
          api.tenants.enroll(person(sid), TenantService.professional(role), null, "unverified");
          return api.publicUser(person(sid));
        });
  }

  @PatchMapping("/staff/{sid}")
  synchronized Map<String, Object> staffEdit(
      @PathVariable String sid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    if (!api.role(u).equals("admin")) throw error(403, "Administrator required");
    return atomic(
        tx -> {
          var target = person(sid);
          if (!same(u, target) || !STAFF.contains(api.role(target)) || sid.equals(api.uid(u)))
            throw error(403, "Cannot change this member");
          version(b, target, "staff_version");
          String department = api.field(b, "department", 100);
          boolean active = !Boolean.FALSE.equals(b.get("active"));
          int changed =
              api.db.update(
                  "update app_user set department=?,staff_active=?,staff_version=staff_version+1"
                      + " where id=? and staff_version=?",
                  department,
                  active,
                  sid,
                  target.get("staff_version"));
          if (changed != 1) throw error(409, "Staff membership changed");
          if (!active)
            api.db.update("update identity_session set revoked=true where user_id=?", sid);
          event(
              "staff",
              sid,
              u,
              "staff_updated",
              Map.of(
                  "department",
                  String.valueOf(target.get("department")),
                  "active",
                  target.get("staff_active")),
              Map.of("department", department, "active", active));
          return api.publicUser(person(sid));
        });
  }

  @PostMapping("/registration")
  synchronized Map<String, Object> registration(
      @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    if (!OPERATIONS.contains(api.role(u))) throw error(403, "Registration staff required");
    String health = api.field(b, "healthId", 20);
    var ps =
        api.db.queryForList("select * from app_user where health_id=? and role='patient'", health);
    if (ps.isEmpty())
      throw error(404, "No matching patient. The patient must create their account first.");
    var p = ps.getFirst();
    return atomic(
        tx -> {
          String pid = api.uid(p);
          var rows =
              api.db.queryForList(
                  "select id from care_assignment where patient_id=? and staff_id=?",
                  pid,
                  api.uid(u));
          if (rows.isEmpty())
            api.db.update(
                "insert into"
                    + " care_assignment(id,patient_id,staff_id,organization,clinic,scopes,expires_at,assigned_by,created_at)"
                    + " values(?,?,?,?,?,'registration',?,?,?)",
                id(),
                pid,
                api.uid(u),
                u.get("organization"),
                u.get("clinic"),
                Instant.now().plusSeconds(86400).toString(),
                api.uid(u),
                now());
          api.audit(api.uid(u), pid, "REGISTRATION_MATCHED", pid);
          return api.publicUser(p);
        });
  }

  @GetMapping("/patients/{pid}/timeline")
  List<Map<String, Object>> timeline(@PathVariable String pid, HttpServletRequest r) {
    var u = staff(r);
    var output = new ArrayList<Map<String, Object>>();
    for (var row :
        api.db.queryForList(
            "select * from clinical_record where patient_id=? order by created_at desc", pid))
      if (assigned(u, pid, row.get("kind").toString())
          && api.tenants.recordVisible(u, row)
          && api.allowed(u, pid, row.get("kind").toString())) {
        var v = provenance.view(row);
        v.put("entry_type", "record");
        output.add(v);
      }
    for (var t : tasks(r))
      if (pid.equals(t.get("patient_id"))) {
        var v = new LinkedHashMap<>(t);
        v.put("entry_type", "task");
        v.put("kind", "task");
        output.add(v);
      }
    for (var c : conversations(r))
      if (pid.equals(c.get("patient_id"))) {
        var v = new LinkedHashMap<>(c);
        v.put("entry_type", "conversation");
        v.put("kind", "communication");
        output.add(v);
      }
    if (output.isEmpty()
        && !api
            .db
            .queryForList(
                "select * from care_assignment where patient_id=? and staff_id=? and active=true",
                pid,
                api.uid(u))
            .stream()
            .anyMatch(
                a ->
                    same(a, u)
                        && Instant.parse(a.get("expires_at").toString()).isAfter(Instant.now())))
      throw error(403, "Patient is not assigned to you");
    api.audit(api.uid(u), pid, "CARE_TIMELINE_READ", pid);
    output.sort(
        Comparator.comparing(x -> String.valueOf(x.get("created_at")), Comparator.reverseOrder()));
    return output;
  }

  @PostMapping("/records")
  synchronized Map<String, Object> record(
      @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    String p = api.field(b, "patientId", 36), kind = api.field(b, "kind", 40);
    access(u, p, kind);
    String key = api.field(b, "idempotencyKey", 100);
    return atomic(
        tx -> {
          api.db.queryForMap("select id from app_user where id=? for update", api.uid(u));
          var rows =
              api.db.queryForList(
                  "select * from clinical_record where author_id=? and idempotency_key=?",
                  api.uid(u),
                  key);
          if (!rows.isEmpty()) {
            var old = rows.getFirst();
            if (!p.equals(old.get("patient_id"))
                || !kind.equals(old.get("kind"))
                || !Objects.equals(b.get("title"), old.get("title"))
                || !Objects.equals(b.get("details"), old.get("details")))
              throw error(409, "Submission key already used");
            return provenance.view(old);
          }
          var created = api.create(b, r);
          if (kind.equals("encounter")
              && "signed".equals(created.get("note_state"))
              && created.get("encounter_id") != null) finishEncounter(created, u);
          return created;
        });
  }

  Map<String, Object> clinical(String rid, Map<String, Object> u) {
    var rows = api.db.queryForList("select * from clinical_record where id=?", rid);
    if (rows.isEmpty()) throw error(404, "Record not found");
    var row = rows.getFirst();
    if (!api.tenants.recordVisible(u, row))
      throw error(403, "Record belongs to another organization");
    access(u, row.get("patient_id").toString(), row.get("kind").toString());
    return row;
  }

  @GetMapping("/records/{rid}/history")
  Map<String, Object> history(@PathVariable String rid, HttpServletRequest r) {
    var u = staff(r);
    clinical(rid, u);
    api.audit(api.uid(u), null, "RECORD_HISTORY_READ", rid);
    return Map.of(
        "revisions",
        api.db.queryForList(
            "select r.*,u.display_name as actor_name,u.role as actor_role from record_revision r"
                + " left join app_user u on u.id=r.actor_id where record_id=? order by occurred_at",
            rid),
        "confirmations",
        api.db.queryForList(
            "select c.*,u.display_name as actor_name from record_confirmation c join app_user u on"
                + " u.id=c.actor_id where record_id=? order by confirmed_at",
            rid));
  }

  @PostMapping("/records/{rid}/confirm")
  synchronized Map<String, Object> confirm(
      @PathVariable String rid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    if (!Set.of("doctor", "nurse").contains(api.role(u)))
      throw error(403, "Clinician confirmation required");
    return atomic(
        tx -> {
          lock("clinical_record", rid);
          var old = clinical(rid, u);
          version(b, old, "record_version");
          String comment = api.field(b, "comment", 1000);
          api.db.update(
              "insert into record_confirmation values(?,?,?,?,?)",
              id(),
              rid,
              api.uid(u),
              now(),
              comment);
          api.db.update(
              "update clinical_record set record_version=record_version+1,updated_at=? where id=?",
              now(),
              rid);
          provenance.revision(rid, api.uid(u), "confirmed_current", comment, old);
          return provenance.view(
              api.db.queryForMap("select * from clinical_record where id=?", rid));
        });
  }

  @PatchMapping("/records/{rid}/draft")
  synchronized Map<String, Object> draft(
      @PathVariable String rid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    return atomic(
        tx -> {
          lock("clinical_record", rid);
          var old = clinical(rid, u);
          version(b, old, "record_version");
          if (!api.role(u).equals("doctor")
              || !api.uid(u).equals(old.get("author_id"))
              || !"draft".equals(old.get("note_state")))
            throw error(403, "Only the author can edit their unsigned draft");
          String text = api.field(b, "details", 10000);
          boolean finalize = Boolean.TRUE.equals(b.get("finalize"));
          if (finalize && !Boolean.TRUE.equals(b.get("reviewed")))
            throw error(400, "Review and confirm the note before signing");
          api.db.update(
              "update clinical_record set"
                  + " details=?,note_state=?,signed_at=?,updated_at=?,record_version=record_version+1"
                  + " where id=?",
              text,
              finalize ? "signed" : "draft",
              finalize ? now() : null,
              now(),
              rid);
          provenance.revision(rid, api.uid(u), finalize ? "signed" : "draft_saved", null, old);
          if (finalize && old.get("kind").equals("encounter") && old.get("encounter_id") != null)
            finishEncounter(old, u);
          return provenance.view(
              api.db.queryForMap("select * from clinical_record where id=?", rid));
        });
  }

  List<Map<String, Object>> freshnessRules(Map<String, Object> u) {
    var rows = api.db.queryForList("select * from freshness_rule order by kind");
    return rows.stream()
        .map(
            rule -> {
              var custom =
                  api.db.queryForList(
                      "select * from clinic_freshness where organization=? and clinic=? and kind=?",
                      u.get("organization"),
                      u.get("clinic"),
                      rule.get("kind"));
              return custom.isEmpty() ? rule : custom.getFirst();
            })
        .toList();
  }

  @PutMapping("/freshness/{kind}")
  synchronized Map<String, Object> freshness(
      @PathVariable String kind, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    if (!api.role(u).equals("admin")) throw error(403, "Administrator required");
    return atomic(
        tx -> {
          api.db.queryForMap("select id from app_user where id=? for update", api.uid(u));
          var existing =
              freshnessRules(u).stream().filter(x -> kind.equals(x.get("kind"))).toList();
          if (existing.isEmpty()) throw error(404, "Rule not found");
          var old = existing.getFirst();
          version(b, old, "version");
          int minutes = api.number(b, "minutes", 1, 5256000, -1);
          if (minutes < 1) throw error(400, "Enter a positive interval");
          int changed =
              api.db.update(
                  "update clinic_freshness set"
                      + " minutes=?,version=version+1,updated_at=?,updated_by=? where"
                      + " organization=? and clinic=? and kind=? and version=?",
                  minutes,
                  now(),
                  api.uid(u),
                  u.get("organization"),
                  u.get("clinic"),
                  kind,
                  old.get("version"));
          if (changed == 0) {
            if (((Number) old.get("version")).intValue() != 0) throw error(409, "Rule changed");
            api.db.update(
                "insert into clinic_freshness values(?,?,?,?,1,?,?)",
                u.get("organization"),
                u.get("clinic"),
                kind,
                minutes,
                api.uid(u),
                now());
          }
          var result =
              freshnessRules(u).stream()
                  .filter(x -> kind.equals(x.get("kind")))
                  .findFirst()
                  .orElseThrow();
          event("freshness", kind, u, "rule_updated", old, result);
          return result;
        });
  }

  void finishEncounter(Map<String, Object> rec, Map<String, Object> u) {
    String aid = rec.get("encounter_id").toString();
    lock("appointment", aid);
    var a = api.db.queryForMap("select * from appointment where id=?", aid);
    if (!api.uid(u).equals(a.get("doctor_id")) || !"in_progress".equals(a.get("status")))
      throw error(
          409, "The assigned doctor must start the appointment before signing its consultation");
    api.db.update(
        "update appointment set"
            + " status='completed',completed_record_id=?,version=version+1,updated_at=? where id=?",
        rec.get("id"),
        now(),
        aid);
    event("appointment", aid, u, "consultation_finalized", a, Map.of("recordId", rec.get("id")));
  }

  <T> T atomic(
      java.util.function.Function<org.springframework.transaction.TransactionStatus, T> work) {
    // Use the same lock order as legacy clinical endpoints before taking database row locks.
    synchronized (api) {
      return api.tx.execute(work::apply);
    }
  }

  boolean taskVisible(Map<String, Object> t, Map<String, Object> u) {
    if (!same(t, u)) return false;
    boolean member =
        api.uid(u).equals(t.get("creator_id"))
            || api.uid(u).equals(t.get("assignee_id"))
            || (t.get("assignee_id") == null && Objects.equals(u.get("department"), t.get("team")));
    if (!member) return false;
    try {
      access(u, (String) t.get("patient_id"), t.get("scope").toString());
      return true;
    } catch (org.springframework.web.server.ResponseStatusException e) {
      return false;
    }
  }

  Map<String, Object> task(String tid, Map<String, Object> u) {
    var rows = api.db.queryForList("select * from care_task where id=?", tid);
    if (rows.isEmpty() || !taskVisible(rows.getFirst(), u))
      throw error(403, "Task access not authorized");
    return rows.getFirst();
  }

  Map<String, Object> taskView(Map<String, Object> t) {
    var v = new LinkedHashMap<>(t);
    v.put("creator_name", person(t.get("creator_id").toString()).get("display_name"));
    v.put(
        "assignee_name",
        t.get("assignee_id") == null
            ? t.get("team")
            : person(t.get("assignee_id").toString()).get("display_name"));
    if (t.get("patient_id") != null)
      v.put("patient_name", person(t.get("patient_id").toString()).get("display_name"));
    boolean open = !Set.of("completed", "cancelled").contains(t.get("status"));
    v.put(
        "overdue",
        open
            && t.get("due_at") != null
            && OffsetDateTime.parse(t.get("due_at").toString())
                .toInstant()
                .isBefore(Instant.now()));
    v.put(
        "unacknowledged",
        t.get("status").equals("open")
            && t.get("acknowledge_by") != null
            && OffsetDateTime.parse(t.get("acknowledge_by").toString())
                .toInstant()
                .isBefore(Instant.now()));
    return v;
  }

  @GetMapping("/tasks")
  List<Map<String, Object>> tasks(HttpServletRequest r) {
    var u = staff(r);
    return api
        .db
        .queryForList(
            "select * from care_task where organization=? and clinic=? order by created_at desc",
            u.get("organization"),
            u.get("clinic"))
        .stream()
        .filter(t -> taskVisible(t, u))
        .map(this::taskView)
        .toList();
  }

  @PostMapping("/tasks")
  synchronized Map<String, Object> taskCreate(
      @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    return atomic(
        tx -> {
          String p = opt(b, "patientId", 36),
              encounter = opt(b, "encounterId", 36),
              scope = api.field(b, "scope", 40),
              sid = opt(b, "assigneeId", 36),
              team = opt(b, "team", 100),
              key = api.field(b, "requestKey", 100),
              title = api.field(b, "title", 200),
              details = api.field(b, "details", 6000),
              priority = api.field(b, "priority", 20);
          if ((sid == null) == (team == null))
            throw error(400, "Choose one assignee or department team");
          if (!Set.of("routine", "urgent", "high").contains(priority))
            throw error(400, "Choose a valid priority");
          linked(u, p, encounter, scope);
          if (sid != null) {
            var target = person(sid);
            if (!same(target, u)
                || !STAFF.contains(api.role(target))
                || Boolean.FALSE.equals(target.get("staff_active")))
              throw error(403, "Assignee must be active in your clinic");
            access(target, p, scope);
          } else {
            var members =
                api.db.queryForList(
                    "select * from app_user where organization=? and clinic=? and department=? and"
                        + " staff_active=true and role<>'patient'",
                    u.get("organization"),
                    u.get("clinic"),
                    team);
            if (members.stream()
                .noneMatch(
                    m -> {
                      try {
                        access(m, p, scope);
                        return true;
                      } catch (Exception e) {
                        return false;
                      }
                    })) throw error(400, "No authorized members in that team");
          }
          String due = provenance.time(b, "dueAt"), ack = provenance.time(b, "acknowledgeBy");
          var rows =
              api.db.queryForList(
                  "select * from care_task where creator_id=? and request_key=?", api.uid(u), key);
          if (!rows.isEmpty()) {
            var old = rows.getFirst();
            if (!Objects.equals(old.get("patient_id"), p)
                || !Objects.equals(old.get("assignee_id"), sid)
                || !old.get("title").equals(title)
                || !old.get("details").equals(details))
              throw error(409, "Task submission key already used");
            return taskView(old);
          }
          String tid = id();
          api.db.update(
              "insert into"
                  + " care_task(id,organization,clinic,patient_id,encounter_id,scope,title,details,creator_id,assignee_id,team,priority,due_at,acknowledge_by,status,request_key,created_at,updated_at)"
                  + " values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?)",
              tid,
              u.get("organization"),
              u.get("clinic"),
              p,
              encounter,
              scope,
              title,
              details,
              api.uid(u),
              sid,
              team,
              priority,
              due,
              ack,
              key,
              now(),
              now());
          api.db.update(
              "update care_task set tenant_id=?,task_type=?,location_label=? where id=?",
              u.get("organization_id"),
              Objects.toString(opt(b, "taskType", 40), "care_task"),
              opt(b, "location", 120),
              tid);
          for (String dependency : strings(b, "dependencies", 30)) {
            var dep = task(dependency, u);
            if (!Objects.equals(dep.get("patient_id"), p))
              throw error(400, "Task dependencies must share the patient context");
            api.db.update("insert into task_dependency values(?,?)", tid, dependency);
          }
          var t = task(tid, u);
          event("task", tid, u, "task_sent", null, t);
          return taskView(t);
        });
  }

  @PatchMapping("/tasks/{tid}")
  synchronized Map<String, Object> taskUpdate(
      @PathVariable String tid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    return atomic(
        tx -> {
          lock("care_task", tid);
          var t = task(tid, u);
          version(b, t, "version");
          String next = api.field(b, "status", 20), old = t.get("status").toString();
          if (t.get("assignee_id") != null
              && !api.uid(u).equals(t.get("assignee_id"))
              && !(next.equals("cancelled") && api.uid(u).equals(t.get("creator_id"))))
            throw error(403, "Only the assignee can acknowledge or complete this task");
          Set<String> transitions =
              switch (old) {
                case "open" -> Set.of("accepted", "cancelled", "escalated");
                case "accepted" ->
                    Set.of("in_progress", "blocked", "waiting", "cancelled", "escalated");
                case "in_progress" ->
                    Set.of("blocked", "completed", "waiting", "cancelled", "escalated");
                case "blocked", "waiting", "escalated" -> Set.of("in_progress", "cancelled");
                default -> Set.of();
              };
          if (!transitions.contains(next)) throw error(409, "Invalid task transition");
          if (Set.of("in_progress", "completed").contains(next)
              && api.db.queryForObject(
                      "select count(*) from task_dependency d join care_task t on d.depends_on=t.id"
                          + " where d.task_id=? and t.status<>'completed'",
                      Integer.class,
                      tid)
                  > 0) throw error(409, "Complete prerequisite tasks first");
          String comment = api.field(b, "comment", 1000);
          api.db.update(
              "update care_task set"
                  + " status=?,assignee_id=coalesce(assignee_id,?),version=version+1,updated_at=?"
                  + " where id=?",
              next,
              api.uid(u),
              now(),
              tid);
          if (next.equals("completed"))
            api.db.update("update care_task set completed_at=? where id=?", now(), tid);
          var after = task(tid, u);
          event("task", tid, u, next, t, Map.of("task", after, "comment", comment));
          return taskView(after);
        });
  }

  @PostMapping("/tasks/{tid}/verify")
  Map<String, Object> verifyTask(
      @PathVariable String tid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    return atomic(
        tx -> {
          lock("care_task", tid);
          var t = task(tid, u);
          version(b, t, "version");
          if (!"completed".equals(t.get("status")))
            throw error(409, "Complete the task before verification");
          if (!api.uid(u).equals(t.get("creator_id")) || api.uid(u).equals(t.get("assignee_id")))
            throw error(403, "The assigning colleague must independently verify completion");
          String reason = api.field(b, "comment", 1000);
          api.db.update(
              "update care_task set verified_by=?,verified_at=?,version=version+1 where id=?",
              api.uid(u),
              now(),
              tid);
          event("task", tid, u, "verified", t, Map.of("reason", reason));
          return taskView(task(tid, u));
        });
  }

  @GetMapping("/tasks/{tid}")
  Map<String, Object> taskDetail(@PathVariable String tid, HttpServletRequest r) {
    var u = staff(r);
    var t = task(tid, u);
    return Map.of(
        "task",
        taskView(t),
        "comments",
        messages(null, tid),
        "history",
        api.db.queryForList(
            "select e.*,u.display_name as actor_name from care_event e join app_user u on"
                + " u.id=e.actor_id where resource_type='task' and resource_id=? order by"
                + " occurred_at",
            tid));
  }

  boolean conversationVisible(Map<String, Object> c, Map<String, Object> u) {
    if (!same(c, u)
        || api.db.queryForObject(
                "select count(*) from conversation_member where conversation_id=? and user_id=?",
                Integer.class,
                c.get("id"),
                api.uid(u))
            != 1) return false;
    try {
      access(u, (String) c.get("patient_id"), c.get("scope").toString());
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  Map<String, Object> conversation(String cid, Map<String, Object> u) {
    var rows = api.db.queryForList("select * from care_conversation where id=?", cid);
    if (rows.isEmpty() || !conversationVisible(rows.getFirst(), u))
      throw error(403, "Conversation access not authorized");
    return rows.getFirst();
  }

  @GetMapping("/conversations")
  List<Map<String, Object>> conversations(HttpServletRequest r) {
    var u = staff(r);
    return api
        .db
        .queryForList(
            "select * from care_conversation where organization=? and clinic=? order by created_at"
                + " desc",
            u.get("organization"),
            u.get("clinic"))
        .stream()
        .filter(c -> conversationVisible(c, u))
        .map(
            c -> {
              var v = new LinkedHashMap<>(c);
              v.put("creator_name", person(c.get("creator_id").toString()).get("display_name"));
              String read =
                  api.db.queryForObject(
                      "select read_at from conversation_member where conversation_id=? and"
                          + " user_id=?",
                      String.class,
                      c.get("id"),
                      api.uid(u));
              v.put(
                  "unread",
                  api.db.queryForObject(
                      "select count(*) from care_message where conversation_id=? and author_id<>?"
                          + " and created_at>?",
                      Integer.class,
                      c.get("id"),
                      api.uid(u),
                      read == null ? "" : read));
              return (Map<String, Object>) v;
            })
        .toList();
  }

  @PostMapping("/conversations")
  synchronized Map<String, Object> conversationCreate(
      @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    return atomic(
        tx -> {
          String p = opt(b, "patientId", 36),
              encounter = opt(b, "encounterId", 36),
              scope = api.field(b, "scope", 40),
              kind = api.field(b, "kind", 30),
              title = api.field(b, "title", 200);
          if (!Set.of("patient", "encounter", "department", "direct", "group").contains(kind))
            throw error(400, "Invalid conversation type");
          if (Set.of("patient", "encounter").contains(kind) && p == null)
            throw error(400, "Select a patient");
          if (kind.equals("encounter") && encounter == null)
            throw error(400, "Select an encounter");
          linked(u, p, encounter, scope);
          var members = new ArrayList<>(strings(b, "members", 40));
          if (!members.contains(api.uid(u))) members.add(api.uid(u));
          if (members.size() < 2) throw error(400, "Add at least one colleague");
          for (String mid : members) {
            var target = person(mid);
            if (!same(target, u)
                || !STAFF.contains(api.role(target))
                || Boolean.FALSE.equals(target.get("staff_active")))
              throw error(403, "Only active clinic staff may join");
            if (kind.equals("department")
                && !Objects.equals(target.get("department"), u.get("department")))
              throw error(403, "Department membership required");
            access(target, p, scope);
          }
          String key = api.field(b, "requestKey", 100);
          var previous =
              api.db.queryForList(
                  "select * from care_conversation where creator_id=? and request_key=?",
                  api.uid(u),
                  key);
          if (!previous.isEmpty()) {
            var old = previous.getFirst();
            if (!Objects.equals(old.get("patient_id"), p) || !old.get("title").equals(title))
              throw error(409, "Conversation key already used");
            return conversation(old.get("id").toString(), u);
          }
          String cid = id();
          api.db.update(
              "insert into care_conversation values(?,?,?,?,?,?,?,?,?,?,?)",
              cid,
              u.get("organization"),
              u.get("clinic"),
              p,
              encounter,
              scope,
              kind,
              title,
              api.uid(u),
              now(),
              key);
          for (String mid : members)
            api.db.update("insert into conversation_member values(?,?,null)", cid, mid);
          event("conversation", cid, u, "conversation_created", null, Map.of("members", members));
          return conversation(cid, u);
        });
  }

  List<Map<String, Object>> messages(String cid, String tid) {
    return api.db.queryForList(
        "select m.*,u.display_name as author_name,u.role as author_role,u.department as"
            + " author_department from care_message m join app_user u on u.id=m.author_id where "
            + (cid != null ? "conversation_id" : "task_id")
            + "=? order by created_at",
        cid != null ? cid : tid);
  }

  @GetMapping("/conversations/{cid}")
  Map<String, Object> conversationDetail(@PathVariable String cid, HttpServletRequest r) {
    var u = staff(r);
    var c = conversation(cid, u);
    api.audit(api.uid(u), (String) c.get("patient_id"), "CONVERSATION_READ", cid);
    return Map.of(
        "conversation",
        c,
        "messages",
        messages(cid, null),
        "members",
        api.db.queryForList(
            "select m.*,u.display_name as name from conversation_member m join app_user u on"
                + " u.id=m.user_id where conversation_id=?",
            cid));
  }

  @PostMapping("/conversations/{cid}/read")
  synchronized Map<String, Object> read(
      @PathVariable String cid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    conversation(cid, u);
    String mid = api.field(b, "lastMessageId", 36);
    var rows =
        api.db.queryForList(
            "select created_at from care_message where id=? and conversation_id=?", mid, cid);
    if (rows.isEmpty()) throw error(400, "Message not in this conversation");
    String at = rows.getFirst().get("created_at").toString();
    api.db.update(
        "update conversation_member set read_at=? where conversation_id=? and user_id=? and"
            + " (read_at is null or read_at<?)",
        at,
        cid,
        api.uid(u),
        at);
    return Map.of("readAt", at);
  }

  @PostMapping("/messages")
  synchronized Map<String, Object> message(
      @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    return atomic(
        tx -> {
          String cid = opt(b, "conversationId", 36), tid = opt(b, "taskId", 36);
          if ((cid == null) == (tid == null)) throw error(400, "Choose one conversation or task");
          var parent = cid != null ? conversation(cid, u) : task(tid, u);
          String body = api.field(b, "body", 6000), key = api.field(b, "requestKey", 100);
          var mentions = strings(b, "mentions", 40);
          var attachments = strings(b, "attachments", 20);
          for (String mid : mentions) {
            var target = person(mid);
            if (cid != null ? !conversationVisible(parent, target) : !taskVisible(parent, target))
              throw error(403, "Mentioned colleague is not a participant");
          }
          for (String rid : attachments) {
            var rec = clinical(rid, u);
            if (!Objects.equals(rec.get("patient_id"), parent.get("patient_id"))
                || !rec.get("kind").equals(parent.get("scope")))
              throw error(
                  403, "Attachments must match this patient's permitted conversation scope");
          }
          var rows =
              api.db.queryForList(
                  "select * from care_message where author_id=? and request_key=?",
                  api.uid(u),
                  key);
          if (!rows.isEmpty()) {
            var old = rows.getFirst();
            if (!Objects.equals(old.get("conversation_id"), cid)
                || !Objects.equals(old.get("task_id"), tid)
                || !old.get("body").equals(body))
              throw error(409, "Message submission key already used");
            return old;
          }
          String priority = Objects.toString(opt(b, "priority", 20), "routine");
          if (!Set.of("routine", "urgent", "critical").contains(priority))
            throw error(400, "Invalid message priority");
          String mid = id();
          api.db.update(
              "insert into"
                  + " care_message(id,conversation_id,task_id,author_id,body,mentions,attachments,created_at,request_key)"
                  + " values(?,?,?,?,?,?,?,?,?)",
              mid,
              cid,
              tid,
              api.uid(u),
              body,
              String.join(",", mentions),
              String.join(",", attachments),
              now(),
              key);
          api.db.update("update care_message set priority=? where id=?", priority, mid);
          if (u.get("organization_id") != null)
            api.db.update(
                "insert into"
                    + " organization_event(id,organization_id,actor_id,resource_type,resource_id,action,severity,created_at)"
                    + " values(?,?,?,'message',?,'message_sent',?,?)",
                id(),
                u.get("organization_id"),
                api.uid(u),
                mid,
                priority,
                now());
          api.audit(api.uid(u), (String) parent.get("patient_id"), "MESSAGE_SENT", mid);
          return api.db.queryForMap("select * from care_message where id=?", mid);
        });
  }

  @PostMapping("/messages/{mid}/record")
  synchronized Map<String, Object> promote(
      @PathVariable String mid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    if (!api.role(u).equals("doctor")) throw error(403, "Doctor review required");
    var rows = api.db.queryForList("select * from care_message where id=?", mid);
    if (rows.isEmpty()) throw error(404, "Message not found");
    var m = rows.getFirst();
    var parent =
        m.get("conversation_id") != null
            ? conversation(m.get("conversation_id").toString(), u)
            : task(m.get("task_id").toString(), u);
    String p = (String) parent.get("patient_id");
    if (p == null) throw error(400, "Only patient-linked discussions can become records");
    if (!Boolean.TRUE.equals(b.get("reviewed")))
      throw error(400, "Review the decision before recording it");
    var content = new LinkedHashMap<String, Object>();
    content.put("patientId", p);
    content.put("kind", "note");
    content.put("title", api.field(b, "title", 200));
    content.put(
        "details",
        api.field(b, "details", 6000)
            + "\n\nDiscussion source: "
            + mid
            + "; message by "
            + person(m.get("author_id").toString()).get("display_name")
            + " at "
            + m.get("created_at"));
    content.put("sourceType", "imported_record");
    content.put("source", "Reviewed staff discussion");
    content.put("observedAt", m.get("created_at"));
    content.put("historical", true);
    content.put("idempotencyKey", "message-" + mid);
    return record(content, r);
  }

  @GetMapping("/notifications")
  List<Map<String, Object>> notifications(HttpServletRequest r) {
    var u = staff(r);
    var result = new ArrayList<Map<String, Object>>();
    for (var t : tasks(r))
      if (!t.get("status").equals("completed")) {
        boolean escalated =
            Boolean.TRUE.equals(t.get("overdue")) || Boolean.TRUE.equals(t.get("unacknowledged"));
        result.add(
            Map.of(
                "id",
                t.get("id"),
                "type",
                "task",
                "preview",
                escalated ? "Work requires attention" : "Task update available",
                "escalated",
                escalated));
      }
    if (Set.of("admin", "coordinator").contains(api.role(u)))
      for (var t :
          api.db.queryForList(
              "select * from care_task where organization=? and clinic=? and status<>'completed'",
              u.get("organization"),
              u.get("clinic"))) {
        var v = taskView(t);
        if (Boolean.TRUE.equals(v.get("overdue")) || Boolean.TRUE.equals(v.get("unacknowledged")))
          result.add(
              Map.of(
                  "id",
                  t.get("id"),
                  "type",
                  "escalation",
                  "preview",
                  "Clinic work needs acknowledgment or is overdue",
                  "escalated",
                  true,
                  "assignee",
                  String.valueOf(v.get("assignee_name"))));
      }
    for (var c : conversations(r))
      if (((Number) c.get("unread")).intValue() > 0)
        result.add(
            Map.of(
                "id",
                c.get("id"),
                "type",
                "conversation",
                "preview",
                "New staff message",
                "unread",
                c.get("unread")));
    return result;
  }

  @GetMapping("/appointments")
  List<Map<String, Object>> appointments(HttpServletRequest r) {
    var u = staff(r);
    var result = new ArrayList<Map<String, Object>>();
    for (var a :
        api.db.queryForList(
            "select a.*,p.display_name as patient_name,d.display_name as doctor_name from"
                + " appointment a join app_user p on p.id=a.patient_id join app_user d on"
                + " d.id=a.doctor_id where d.organization=? and d.clinic=? order by starts_at",
            u.get("organization"),
            u.get("clinic"))) {
      String p = a.get("patient_id").toString();
      if (assigned(u, p, "registration")
          || assigned(u, p, "encounter") && api.allowed(u, p, "encounter")) {
        var row = new LinkedHashMap<>(a);
        if (OPERATIONS.contains(api.role(u))) {
          row.remove("reason");
          row.remove("completed_record_id");
        }
        result.add(row);
      }
    }
    return result;
  }

  @PostMapping("/appointments")
  synchronized Map<String, Object> book(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    if (!Set.of("doctor", "reception", "coordinator", "admin").contains(api.role(u)))
      throw error(403, "Scheduling role required");
    return atomic(
        tx -> {
          String p = api.field(b, "patientId", 36),
              did = api.field(b, "doctorId", 36),
              key = api.field(b, "requestKey", 80);
          access(u, p, "registration");
          var doctor = person(did);
          if (!same(u, doctor) || !api.role(doctor).equals("doctor"))
            throw error(403, "Choose a doctor in your clinic");
          access(doctor, p, "encounter");
          clinician.lockDoctor(doctor);
          long starts = clinician.timestamp(b);
          int duration = api.number(b, "duration", 5, 180, 30);
          String mode = api.field(b, "mode", 20);
          if (!Set.of("in_person", "video").contains(mode)) throw error(400, "Invalid visit mode");
          var old =
              api.db.queryForList(
                  "select * from appointment where doctor_id=? and request_key=?", did, key);
          if (!old.isEmpty()) {
            var a = old.getFirst();
            if (!a.get("patient_id").equals(p)
                || ((Number) a.get("starts_at")).longValue() != starts
                || ((Number) a.get("duration_minutes")).intValue() != duration)
              throw error(409, "Booking key already used");
            return a;
          }
          clinician.slot(doctor, starts, duration, "");
          String aid = id();
          api.db.update(
              "insert into"
                  + " appointment(id,doctor_id,patient_id,starts_at,duration_minutes,reason,visit_mode,status,request_key,created_at,updated_at)"
                  + " values(?,?,?,?,?,'Clinic appointment',?,'scheduled',?,?,?)",
              aid,
              did,
              p,
              starts,
              duration,
              mode,
              key,
              now(),
              now());
          api.db.update(
              "update appointment set tenant_id=? where id=?", doctor.get("organization_id"), aid);
          var a = api.db.queryForMap("select * from appointment where id=?", aid);
          event("appointment", aid, u, "scheduled", null, a);
          return a;
        });
  }

  @PatchMapping("/appointments/{aid}/stage")
  synchronized Map<String, Object> stage(
      @PathVariable String aid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    return atomic(
        tx -> {
          lock("appointment", aid);
          var rows = appointments(r).stream().filter(a -> aid.equals(a.get("id"))).toList();
          if (rows.isEmpty()) throw error(403, "Appointment access not authorized");
          var a = rows.getFirst();
          version(b, a, "version");
          String next = api.field(b, "stage", 30), old = a.get("workflow_stage").toString();
          String expected =
              switch (old) {
                case "registered" -> "checked_in";
                case "checked_in" -> "triage";
                case "triage" -> "consultation";
                case "consultation" -> "follow_up";
                case "follow_up" -> "discharged";
                default -> "";
              };
          if (!next.equals(expected)) throw error(409, "Complete the previous care stage first");
          boolean permitted =
              next.equals("checked_in")
                  ? OPERATIONS.contains(api.role(u))
                  : next.equals("triage")
                      ? Set.of("nurse", "doctor").contains(api.role(u))
                      : api.role(u).equals("doctor");
          if (!permitted) throw error(403, "Your role cannot complete this stage");
          if (!OPERATIONS.contains(api.role(u)))
            access(
                u, a.get("patient_id").toString(), next.equals("triage") ? "vital" : "encounter");
          if (Set.of("follow_up", "discharged").contains(next)
              && !"completed".equals(a.get("status")))
            throw error(409, "Finalize the consultation before follow-up or discharge");
          String status =
              next.equals("checked_in")
                  ? "checked_in"
                  : next.equals("consultation") ? "in_progress" : a.get("status").toString();
          api.db.update(
              "update appointment set workflow_stage=?,status=?,version=version+1,updated_at=?"
                  + " where id=?",
              next,
              status,
              now(),
              aid);
          var after = api.db.queryForMap("select * from appointment where id=?", aid);
          event("appointment", aid, u, "stage_changed", a, after);
          return after;
        });
  }

  @GetMapping("/services")
  List<Map<String, Object>> services(HttpServletRequest r) {
    var u = staff(r);
    return api
        .db
        .queryForList(
            "select r.*,s.status as service_status,s.version as"
                + " service_version,v.reviewed_at,v.reviewer_id from clinical_record r left join"
                + " service_status s on s.record_id=r.id left join result_review v on"
                + " v.record_id=r.id where r.kind in"
                + " ('lab_order','imaging_order','lab_result','imaging_report','prescription','dispense','referral','follow_up','discharge')"
                + " and r.status='active' order by r.created_at desc")
        .stream()
        .filter(
            row ->
                assigned(u, row.get("patient_id").toString(), row.get("kind").toString())
                    && api.allowed(u, row.get("patient_id").toString(), row.get("kind").toString())
                    && (!Set.of("lab", "diagnostic", "pharmacy").contains(api.role(u))
                        || api.uid(u).equals(row.get("recipient_id"))
                        || api.uid(u).equals(row.get("author_id"))))
        .map(provenance::view)
        .toList();
  }

  @PatchMapping("/services/{rid}")
  synchronized Map<String, Object> service(
      @PathVariable String rid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    return atomic(
        tx -> {
          lock("clinical_record", rid);
          var rec = clinical(rid, u);
          if (!api.uid(u).equals(rec.get("recipient_id"))
              || !Set.of("lab", "diagnostic", "pharmacy").contains(api.role(u)))
            throw error(403, "Assigned service staff required");
          var rows = api.db.queryForList("select * from service_status where record_id=?", rid);
          var old =
              rows.isEmpty()
                  ? Map.<String, Object>of("status", "requested", "version", 0)
                  : rows.getFirst();
          version(b, old, "version");
          String next = api.field(b, "status", 30);
          var valid =
              switch (old.get("status").toString()) {
                case "requested" -> Set.of("accepted", "clarification_requested");
                case "accepted" ->
                    Set.of("specimen_collected", "examination_started", "clarification_requested");
                case "specimen_collected", "examination_started" ->
                    Set.of("processing", "clarification_requested");
                case "clarification_requested" -> Set.of("accepted");
                case "processing" -> Set.of("result_posted");
                default -> Set.<String>of();
              };
          if (!valid.contains(next)) throw error(409, "Invalid service transition");
          if (next.equals("result_posted")
              && api.db.queryForObject(
                      "select count(*) from clinical_record where related_id=? and status='active'",
                      Integer.class,
                      rid)
                  < 1) throw error(409, "Post a linked result before completing the request");
          if (rows.isEmpty())
            api.db.update(
                "insert into service_status values(?,?,1,?,?)", rid, next, now(), api.uid(u));
          else
            api.db.update(
                "update service_status set status=?,version=version+1,updated_at=?,updated_by=?"
                    + " where record_id=?",
                next,
                now(),
                api.uid(u),
                rid);
          var after = api.db.queryForMap("select * from service_status where record_id=?", rid);
          event("service", rid, u, "service_updated", old, after);
          return after;
        });
  }

  @PostMapping("/results/{rid}/review")
  synchronized Map<String, Object> review(
      @PathVariable String rid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    if (!api.role(u).equals("doctor")) throw error(403, "Doctor review required");
    return atomic(
        tx -> {
          lock("clinical_record", rid);
          var rec = clinical(rid, u);
          if (!Set.of("lab_result", "imaging_report").contains(rec.get("kind"))
              || !"active".equals(rec.get("status"))) throw error(400, "Choose an active result");
          String comment = api.field(b, "comment", 1000);
          var old = api.db.queryForList("select * from result_review where record_id=?", rid);
          if (!old.isEmpty()) return old.getFirst();
          api.db.update(
              "insert into result_review values(?,?,?,?)", rid, api.uid(u), now(), comment);
          var after = api.db.queryForMap("select * from result_review where record_id=?", rid);
          event("result", rid, u, "result_reviewed", null, after);
          return after;
        });
  }
}
