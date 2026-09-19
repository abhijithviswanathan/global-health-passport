/**
 * Core patient-record API and shared request checks used by the other controllers.
 * Read user(), allowed()/require(), and create() before changing clinical access.
 * Database rows use snake_case; explicit request fields usually use camelCase.
 * This class also owns local synthetic seeding, consent, access requests, audit and exports.
 */
package org.healthpassport;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.*;
import java.nio.file.*;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class PassportApi {
  @org.springframework.beans.factory.annotation.Autowired IdentityService identity;
  final JdbcTemplate db;
  final ObjectMapper json;
  final TransactionTemplate tx;
  final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
  final String dummyPasswordHash = passwords.encode(token());
  final Map<String, List<Instant>> failures = new ConcurrentHashMap<>();

  @Value("${DEMO_MODE:false}")
  boolean demo;

  @Value("${DEMO_PASSWORD:}")
  String demoPassword;

  @Value("${REQUIRE_STAFF_MFA:true}")
  boolean requireStaffMfa;

  @Value("${spring.profiles.active:}")
  String activeProfiles;

  @org.springframework.beans.factory.annotation.Autowired RecordProvenance provenance;
  @org.springframework.beans.factory.annotation.Autowired TenantService tenants;

  static final Set<String> KINDS =
      Set.of(
          "vital",
          "history",
          "nursing_observation",
          "imaging_order",
          "referral",
          "follow_up",
          "discharge",
          "allergy",
          "condition",
          "medication",
          "encounter",
          "lab_order",
          "lab_result",
          "prescription",
          "dispense",
          "note",
          "imaging_report",
          "document");

  PassportApi(JdbcTemplate db, ObjectMapper json, PlatformTransactionManager tm) {
    this.db = db;
    this.json = json;
    this.tx = new TransactionTemplate(tm);
  }

  // Internal record/resource key. This is deliberately separate from the short public Health ID.
  static String id() {
    return UUID.randomUUID().toString();
  }

  static String token() {
    byte[] b = new byte[32];
    new SecureRandom().nextBytes(b);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
  }

  static String now() {
    return Instant.now().toString();
  }

  static ResponseStatusException error(int code, String s) {
    return new ResponseStatusException(HttpStatus.valueOf(code), s);
  }

  String field(Map<String, Object> b, String k, int max) {
    Object v = b.get(k);
    if (!(v instanceof String s) || s.isBlank() || s.length() > max)
      throw error(400, "Invalid " + k);
    return (String) v;
  }

  int number(Map<String, Object> b, String k, int min, int max, int fallback) {
    Object v = b.get(k);
    if (v == null) return fallback;
    if (!(v instanceof Number n)
        || n.doubleValue() != n.intValue()
        || n.intValue() < min
        || n.intValue() > max) throw error(400, "Invalid " + k);
    return ((Number) v).intValue();
  }

  String optional(Map<String, Object> b, String k) {
    return b.get(k) instanceof String s ? s : "";
  }

  // Only an empty synthetic database receives seed accounts; this never resets existing passwords.
  @PostConstruct
  void seed() throws Exception {
    verifyLaunchMode();
    if (!demo || db.queryForObject("select count(*) from app_user", Integer.class) > 0) return;
    String password = demoPassword.isBlank() ? token() : demoPassword;
    if (password.length() < 12
        || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72)
      throw new IllegalStateException("DEMO_PASSWORD must contain at least 12 characters");
    if (demoPassword.isBlank()) {
      Path p = Path.of("data/demo-credentials.txt");
      Files.createDirectories(p.getParent());
      Files.writeString(
          p,
          "Synthetic demo accounts: patient, doctor, lab, pharmacy, admin, security\nPassword: "
              + password
              + "\n");
      try {
        Files.setPosixFilePermissions(
            p, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
      } catch (UnsupportedOperationException ignored) {
      }
    }
    String hash = passwords.encode(password);
    for (String role : List.of("patient", "doctor", "lab", "pharmacy", "admin", "security")) {
      String uid = id();
      String health = null;
      if (role.equals("patient")) {
        health = HealthIds.generate();
      }
      db.update(
          "insert into app_user(id,username,display_name,role,password_hash,health_id,organization)"
              + " values(?,?,?,?,?,?,?)",
          uid,
          role,
          switch (role) {
            case "patient" -> "Alex Morgan (Synthetic)";
            case "doctor" -> "Dr. Jordan Chen (Synthetic)";
            case "lab" -> "Northstar Laboratory (Synthetic)";
            case "pharmacy" -> "Harbor Pharmacy (Synthetic)";
            default -> role + " (Synthetic)";
          },
          role,
          hash,
          health,
          "Northstar Demo Network");
    }
    String patient = byUsername("patient").get("id").toString(),
        doctor = byUsername("doctor").get("id").toString();
    seedRecord(
        patient,
        doctor,
        "allergy",
        "Penicillin",
        "Synthetic allergy: rash. Verify before clinical decisions.",
        "active");
    seedRecord(
        patient,
        doctor,
        "condition",
        "Essential hypertension",
        "Synthetic demonstration condition.",
        "active");
    seedRecord(
        patient,
        doctor,
        "medication",
        "Amlodipine 5 mg",
        "Synthetic medication: once daily, oral. Not a real prescription.");
    seedRecord(
        patient,
        doctor,
        "encounter",
        "Annual wellness visit",
        "Synthetic visit: blood pressure 128/82 mmHg, pulse 72 bpm.");
    seedRecord(
        patient,
        doctor,
        "lab_result",
        "Complete blood count",
        "Synthetic result: hemoglobin 14.2 g/dL. Demonstration only.");
  }

  void verifyLaunchMode() {
    boolean production =
        Arrays.stream(activeProfiles.split(","))
            .map(String::trim)
            .anyMatch(p -> p.equals("production") || p.equals("prod"));
    if (production && demo)
      throw new IllegalStateException("Synthetic demo mode is forbidden in production profiles");
    if (production && !requireStaffMfa)
      throw new IllegalStateException("Staff MFA is mandatory in production profiles");
  }

  void seedRecord(String p, String a, String k, String title, String detail) {
    seedRecord(p, a, k, title, detail, null);
  }

  void seedRecord(
      String p, String a, String k, String title, String detail, String clinicalStatus) {
    db.update(
        "insert into"
            + " clinical_record(id,patient_id,kind,title,details,author_id,source,status,created_at,replaces_id,related_id,clinical_status)"
            + " values(?,?,?,?,?,?,?,?,?,?,?,?)",
        id(),
        p,
        k,
        title,
        detail,
        a,
        "Synthetic seed",
        "active",
        now(),
        null,
        null,
        clinicalStatus);
  }

  Map<String, Object> byUsername(String name) {
    var rows = db.queryForList("select * from app_user where username=?", name);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  // Resolve the session on every request, then recheck suspension, employment and practitioner status.
  // Do not accept a user ID or role from the submitted form as a substitute.
  Map<String, Object> user(HttpServletRequest r) {
    HttpSession s = r.getSession(false);
    if (s == null || s.getAttribute("uid") == null) throw error(401, "Authentication required");
    identity.validateSession(r);
    var u = db.queryForMap("select * from app_user where id=?", s.getAttribute("uid"));
    if (Boolean.FALSE.equals(u.get("staff_active"))) throw error(403, "Staff access is suspended");
    tenants.validate(u);
    verifyPractitioner(u);
    return u;
  }

  void verifyPractitioner(Map<String, Object> u) {
    if (!Set.of("doctor", "nurse", "diagnostic", "lab", "pharmacy").contains(role(u))) return;
    var rows =
        db.queryForList("select status from practitioner_verification where user_id=?", uid(u));
    if (rows.isEmpty()
        || !("verified".equals(rows.getFirst().get("status"))
            || (demo && "synthetic_verified".equals(rows.getFirst().get("status")))))
      throw error(403, "Practitioner verification required or access suspended");
  }

  String uid(Map<String, Object> u) {
    return u.get("id").toString();
  }

  String role(Map<String, Object> u) {
    return u.get("role").toString();
  }

  Map<String, Object> publicUser(Map<String, Object> u) {
    Map<String, Object> v = new LinkedHashMap<>();
    for (String k : List.of("id", "username", "role", "health_id", "organization"))
      v.put(k, u.get(k));
    v.put("name", u.get("display_name"));
    v.put("displayName", u.get("display_name"));
    v.put("healthId", u.get("health_id"));
    v.put("organizationId", u.get("organization_id"));
    if (u.get("organization_id")!=null) {
      var e=tenants.employment(u);v.put("workId",e.get("work_id"));v.put("professionalRole",e.get("professional_role"));
    }
    return v;
  }

  void csrf(HttpServletRequest r) {
    HttpSession s = r.getSession(false);
    String h = r.getHeader("X-CSRF-TOKEN");
    if (s == null
        || h == null
        || !MessageDigest.isEqual(h.getBytes(), String.valueOf(s.getAttribute("csrf")).getBytes()))
      throw error(403, "CSRF token required");
  }

  @GetMapping("/csrf")
  Map<String, Object> csrfToken(HttpServletRequest r) {
    var s = r.getSession(true);
    if (s.getAttribute("csrf") == null) s.setAttribute("csrf", token());
    return Map.of("token", s.getAttribute("csrf"), "headerName", "X-CSRF-TOKEN");
  }

  // Run a BCrypt comparison even for an unknown account; bound input before BCrypt truncation.
  boolean matchesPassword(String raw, String encoded) {
    boolean validLength = raw.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 72;
    boolean matched =
        passwords.matches(
            validLength ? raw : "oversized-password-rejected",
            encoded == null || !validLength ? dummyPasswordHash : encoded);
    return validLength && encoded != null && matched;
  }

  @PostMapping("/auth/login")
  Map<String, Object> login(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    csrf(r);
    String name = field(b, "username", 80),
        password = field(b, "password", 200),
        key = r.getRemoteAddr() + ":" + name;
    var f = failures.computeIfAbsent(key, k -> Collections.synchronizedList(new ArrayList<>()));
    synchronized (f) {
      f.removeIf(t -> t.isBefore(Instant.now().minusSeconds(900)));
      if (f.size() >= 5) throw error(429, "Try again later");
    }
    var u = byUsername(name);
    if (!matchesPassword(password, u == null ? null : u.get("password_hash").toString())) {
      f.add(Instant.now());
      audit(null, null, "LOGIN_FAILED", name);
      throw error(401, "Invalid credentials");
    }
    if (!demo && requireStaffMfa && !role(u).equals("patient") && !identity.enabled(uid(u))) {
      audit(uid(u), null, "STAFF_MFA_REQUIRED", uid(u));
      throw error(
          403,
          "Staff must enroll a second factor through verified provisioning or use an enrolled"
              + " passkey");
    }
    verifyPractitioner(u);
    identity.verifySecondFactor(uid(u), b);
    failures.remove(key);
    r.getSession().removeAttribute("photoRegistrationOwner");
    r.getSession().removeAttribute("photoRegistrationUntil");
    r.changeSessionId();
    r.getSession().setAttribute("uid", uid(u));
    identity.registerSession(uid(u), r);
    audit(uid(u), null, "LOGIN", uid(u));
    return publicUser(u);
  }

  @PostMapping("/auth/logout")
  Map<String, Object> logout(HttpServletRequest r) {
    csrf(r);
    var u = user(r);
    audit(uid(u), null, "LOGOUT", uid(u));
    identity.revokeCurrent(r);
    r.getSession().invalidate();
    return Map.of("ok", true);
  }

  @GetMapping("/me")
  Map<String, Object> me(HttpServletRequest r) {
    return publicUser(user(r));
  }

  @GetMapping("/health")
  Map<String, Object> health() {
    return Map.of(
        "status", "ok", "mode", demo ? "synthetic-demo" : "configured", "clinicalUse", false);
  }

  @GetMapping("/users")
  List<Map<String, Object>> users(HttpServletRequest r) {
    var viewer=user(r);
    return db
        .queryForList(
            "select * from app_user where role in ('doctor','nurse','diagnostic','lab','pharmacy')")
        .stream().filter(v->role(viewer).equals("patient")||Objects.equals(v.get("organization_id"),viewer.get("organization_id"))).toList()
        .stream()
        .map(this::publicUser)
        .toList();
  }

  @GetMapping("/patients")
  List<Map<String, Object>> patients(HttpServletRequest r) {
    var u = user(r);
    if (role(u).equals("patient")) return List.of(publicUser(u));
    if (!Set.of("doctor", "nurse", "diagnostic", "lab", "pharmacy").contains(role(u)))
      return List.of();
    return db
        .queryForList(
            "select * from app_user where role='patient' and id in (select patient_id from consent"
                + " where grantee_id=? and status='active')",
            uid(u))
        .stream()
        .filter(p -> hasGrant(u, p.get("id").toString()))
        .map(this::publicUser)
        .toList();
  }

  boolean careAssignmentAllows(Map<String, Object> u, String p, String kind) {
    if (db.queryForObject(
            "select count(*) from care_assignment where patient_id=?", Integer.class, p)
        == 0) return !Set.of("nurse", "diagnostic").contains(role(u));
    return db
        .queryForList(
            "select * from care_assignment where patient_id=? and staff_id=? and active=true",
            p,
            uid(u))
        .stream()
        .anyMatch(
            a ->
                Objects.equals(a.get("organization"), u.get("organization"))
                    && Objects.equals(a.get("clinic"), u.get("clinic"))
                    && Instant.parse(a.get("expires_at").toString()).isAfter(Instant.now())
                    && (kind == null
                        || Arrays.asList(a.get("scopes").toString().split(",")).contains(kind)));
  }

  // Broad relationship check for navigation. A specific record read still needs allowed()/require().
  boolean hasGrant(Map<String, Object> u, String patient) {
    if (!careAssignmentAllows(u, patient, null)) return false;
    if (!Set.of("doctor", "nurse", "diagnostic", "lab", "pharmacy").contains(role(u))) return false;
    return db
        .queryForList(
            "select expires_at from consent where patient_id=? and grantee_id=? and status='active'"
                + " and purpose='treatment'",
            patient,
            uid(u))
        .stream()
        .anyMatch(c -> Instant.parse(c.get("expires_at").toString()).isAfter(Instant.now()));
  }

  // Combine role, employment privilege, care assignment and a live treatment consent for this kind.
  // A patient may read their own records; other roles do not inherit that exception.
  boolean allowed(Map<String, Object> u, String p, String kind) {
    if (Boolean.FALSE.equals(u.get("staff_active"))) return false;
    if (!tenants.privilege(u, kind, false)) return false;
    if (Set.of("nurse", "diagnostic").contains(role(u))
        && db
            .queryForList(
                "select * from care_assignment where patient_id=? and staff_id=? and active=true",
                p,
                uid(u))
            .stream()
            .noneMatch(
                a ->
                    Objects.equals(a.get("organization"), u.get("organization"))
                        && Objects.equals(a.get("clinic"), u.get("clinic"))
                        && Instant.parse(a.get("expires_at").toString()).isAfter(Instant.now())
                        && Arrays.asList(a.get("scopes").toString().split(",")).contains(kind)))
      return false;
    if (role(u).equals("patient")) return uid(u).equals(p);
    if (!careAssignmentAllows(u, p, kind)) return false;
    if (!Set.of("doctor", "nurse", "diagnostic", "lab", "pharmacy").contains(role(u))) return false;
    if (Set.of("lab", "diagnostic").contains(role(u))
        && !Set.of("lab_order", "lab_result", "imaging_order", "imaging_report").contains(kind))
      return false;
    if (role(u).equals("nurse")
        && !Set.of(
                "vital",
                "history",
                "nursing_observation",
                "prescription",
                "allergy",
                "medication",
                "condition",
                "encounter",
                "note",
                "lab_order",
                "lab_result",
                "document",
                "follow_up",
                "discharge")
            .contains(kind)) return false;
    if (role(u).equals("pharmacy")
        && !Set.of("prescription", "dispense", "allergy", "medication").contains(kind))
      return false;
    return db
        .queryForList(
            "select * from consent where patient_id=? and grantee_id=? and status='active' and"
                + " purpose='treatment'",
            p,
            uid(u))
        .stream()
        .anyMatch(
            c ->
                Instant.parse(c.get("expires_at").toString()).isAfter(Instant.now())
                    && Arrays.asList(c.get("scopes").toString().split(",")).contains(kind));
  }

  // Use at disclosure/mutation boundaries so denied access is audited as well as rejected.
  void require(Map<String, Object> u, String p, String k) {
    if (!allowed(u, p, k)) {
      audit(uid(u), p, "ACCESS_DENIED", k);
      throw error(403, "Access not authorized");
    }
  }

  @GetMapping("/patients/{patient}/timeline")
  synchronized List<Map<String, Object>> timeline(
      @PathVariable String patient, HttpServletRequest r) {
    var u = user(r);
    var rows =
        db
            .queryForList(
                "select r.*,u.display_name as author_name from clinical_record r join app_user u on"
                    + " r.author_id=u.id where patient_id=? order by created_at desc",
                patient)
            .stream()
            .filter(x -> tenants.recordVisible(u,x) && allowed(u, patient, x.get("kind").toString()))
            .map(provenance::view)
            .toList();
    if (rows.isEmpty() && !uid(u).equals(patient) && hasGrant(u, patient)) {
      audit(uid(u), patient, "TIMELINE_READ", patient);
      return rows;
    }
    if (!uid(u).equals(patient) && rows.isEmpty()) throw error(403, "Access not authorized");
    audit(uid(u), patient, "TIMELINE_READ", patient);
    return rows;
  }

  @GetMapping("/consents")
  List<Map<String, Object>> consents(HttpServletRequest r) {
    var u = user(r);
    return db.queryForList(
        "select c.*,u.display_name as grantee_name from consent c join app_user u on"
            + " c.grantee_id=u.id where patient_id=? or grantee_id=? order by created_at desc",
        uid(u),
        uid(u));
  }

  // The patient controls grant scope and expiry; a provider access request is not itself a grant.
  @PostMapping("/consents")
  synchronized Map<String, Object> grant(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    csrf(r);
    var u = user(r);
    if (!role(u).equals("patient")) throw error(403, "Patient approval required");
    String p = field(b, "patientId", 36);
    if (!p.equals(uid(u))) throw error(403, "Patient approval required");
    String g = field(b, "granteeId", 36),
        purpose = field(b, "purpose", 40),
        expires = field(b, "expiresAt", 40);
    if (!purpose.equals("treatment")) throw error(400, "Only treatment is supported");
    Instant end;
    try {
      end = Instant.parse(expires);
    } catch (Exception e) {
      throw error(400, "Invalid expiry");
    }
    if (!end.isAfter(Instant.now()) || end.isAfter(Instant.now().plusSeconds(365L * 86400)))
      throw error(400, "Expiry must be within one year");
    if (db.queryForObject(
            "select count(*) from app_user where id=? and role in"
                + " ('doctor','nurse','diagnostic','lab','pharmacy')",
            Integer.class,
            g)
        != 1) throw error(400, "Invalid recipient");
    if (!(b.get("scopes") instanceof List<?> scopes)
        || scopes.isEmpty()
        || !scopes.stream().allMatch(KINDS::contains)) throw error(400, "Invalid scopes");
    verifyPractitioner(db.queryForMap("select * from app_user where id=?", g));
    String cid = id();
    tx.executeWithoutResult(
        s -> {
          db.update(
              "insert into"
                  + " consent(id,patient_id,grantee_id,purpose,scopes,expires_at,status,created_at)"
                  + " values(?,?,?,?,?,?,?,?)",
              cid,
              p,
              g,
              purpose,
              String.join(",", scopes.stream().map(Object::toString).toList()),
              end.toString(),
              "active",
              now());
          db.update(
              "update access_request set status='approved' where patient_id=? and requester_id=?"
                  + " and status='pending'",
              p,
              g);
          audit(uid(u), p, "CONSENT_GRANTED", cid);
        });
    return db.queryForMap("select * from consent where id=?", cid);
  }

  @PostMapping("/consents/{cid}/revoke")
  synchronized Map<String, Object> revoke(@PathVariable String cid, HttpServletRequest r) {
    csrf(r);
    var u = user(r);
    int changed =
        db.update(
            "update consent set status='revoked' where id=? and patient_id=? and status='active'",
            cid,
            uid(u));
    if (changed == 0) throw error(404, "Grant not found");
    audit(uid(u), uid(u), "CONSENT_REVOKED", cid);
    return Map.of("ok", true);
  }

  @GetMapping("/access-requests")
  List<Map<String, Object>> requests(HttpServletRequest r) {
    var u = user(r);
    return db.queryForList(
        "select a.*,u.display_name as requester_name from access_request a join app_user u on"
            + " a.requester_id=u.id where patient_id=? or requester_id=? order by created_at desc",
        uid(u),
        uid(u));
  }

  @PostMapping("/access-requests/{requestId}/deny")
  synchronized Map<String, Object> denyRequest(
      @PathVariable String requestId, HttpServletRequest r) {
    csrf(r);
    var u = user(r);
    if (!role(u).equals("patient")) throw error(404, "Pending request not found");
    tx.executeWithoutResult(
        status -> {
          int count =
              db.update(
                  "update access_request set status='denied' where id=? and patient_id=? and"
                      + " status='pending'",
                  requestId,
                  uid(u));
          if (count != 1) throw error(404, "Pending request not found");
          audit(uid(u), uid(u), "ACCESS_REQUEST_DENIED", requestId);
        });
    return Map.of("ok", true);
  }

  @PostMapping("/access-requests")
  Map<String, Object> request(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    csrf(r);
    var u = user(r);
    if (!Set.of("doctor", "nurse", "diagnostic", "lab", "pharmacy").contains(role(u)))
      throw error(403, "Clinical role required");
    String health = field(b, "healthId", 64), purpose = field(b, "purpose", 40);
    if (!purpose.equals("treatment")) throw error(400, "Only treatment is supported");
    var found =
        db.queryForList(
            "select id from app_user where health_id=? union select user_id as id from"
                + " health_id_alias where alias=?",
            HealthIds.normalize(health),
            HealthIds.normalize(health));
    if (!found.isEmpty()) {
      String p = found.getFirst().get("id").toString();
      String rid = id();
      db.update(
          "insert into access_request(id,patient_id,requester_id,purpose,status,created_at)"
              + " values(?,?,?,?,?,?)",
          rid,
          p,
          uid(u),
          purpose,
          "pending",
          now());
      audit(uid(u), p, "ACCESS_REQUESTED", rid);
    }
    return Map.of("message", "If the identifier is valid, the patient will receive your request.");
  }

  // Record writes preserve provenance and relationships. Review replacement, recipient and
  // dispensing checks together before adding a new clinical record kind.
  @PostMapping("/records")
  synchronized Map<String, Object> create(
      @RequestBody Map<String, Object> b, HttpServletRequest r) {
    csrf(r);
    var u = user(r);
    String p = field(b, "patientId", 36),
        k = field(b, "kind", 40),
        title = field(b, "title", 200),
        details = field(b, "details", 10000);
    if (!KINDS.contains(k)) throw error(400, "Unknown record kind");
    require(u, p, k);
    Set<String> writable =
        switch (role(u)) {
          case "patient" -> Set.of("note", "allergy", "condition", "medication");
          case "doctor" ->
              Set.of(
                  "vital",
                  "history",
                  "imaging_order",
                  "referral",
                  "follow_up",
                  "discharge",
                  "note",
                  "allergy",
                  "condition",
                  "medication",
                  "encounter",
                  "lab_order",
                  "prescription");
          case "nurse" -> Set.of("vital", "history", "nursing_observation");
          case "diagnostic", "lab" -> Set.of("lab_result", "imaging_report");
          case "pharmacy" -> Set.of("dispense");
          default -> Set.of();
        };
    if (!writable.contains(k) || !tenants.privilege(u,k,true)) throw error(403, "Role cannot write this record");
    String submission = optional(b, "idempotencyKey");
    if (!submission.isBlank() && !k.equals("dispense")) {
      var existing =
          db.queryForList(
              "select * from clinical_record where author_id=? and idempotency_key=?",
              uid(u),
              submission);
      if (!existing.isEmpty()) {
        var old = existing.getFirst();
        if (!p.equals(old.get("patient_id"))
            || !k.equals(old.get("kind"))
            || !title.equals(old.get("title"))
            || !details.equals(old.get("details"))) throw error(409, "Submission key already used");
        return provenance.view(old);
      }
    }
    String clinicalStatus = optional(b, "clinicalStatus");
    if (b.containsKey("clinicalStatus") && !(b.get("clinicalStatus") instanceof String))
      throw error(400, "clinicalStatus must be a string");
    if (!clinicalStatus.isBlank()) {
      Set<String> accepted =
          k.equals("allergy")
              ? Set.of("active", "inactive", "resolved")
              : k.equals("condition")
                  ? Set.of("active", "recurrence", "relapse", "inactive", "remission", "resolved")
                  : Set.of();
      if (!accepted.contains(clinicalStatus))
        throw error(400, "Invalid clinical status for record kind");
    }
    String related = optional(b, "relatedId"), replaces = optional(b, "replacesId");
    String origin = optional(b, "originalRecordId");
    if (!origin.isBlank()) {
      var originals =
          db.queryForList("select * from clinical_record where id=? and patient_id=?", origin, p);
      if (originals.isEmpty() || !tenants.recordVisible(u,originals.getFirst())) throw error(404, "Original record not found");
      require(u, p, originals.getFirst().get("kind").toString());
    }
    if (!replaces.isBlank() && optional(b, "correctionReason").isBlank())
      throw error(400, "A correction reason is required");
    if (b.containsKey("noteState")
        && (!"draft".equals(b.get("noteState"))
            || !role(u).equals("doctor")
            || !Set.of("note", "encounter").contains(k)))
      throw error(400, "Only doctor notes can be saved as drafts");
    if (Set.of("lab_result", "imaging_report", "dispense").contains(k)
        && !(k.equals("imaging_report") && related.isBlank())) {
      String required =
          k.equals("dispense")
              ? "prescription"
              : k.equals("imaging_report") ? "imaging_order" : "lab_order";
      if (db.queryForObject(
              "select count(*) from clinical_record where id=? and patient_id=? and kind=? and"
                  + " status='active'",
              Integer.class,
              related,
              p,
              required)
          != 1) throw error(400, "Valid related order required");
    }
    if (!replaces.isBlank()
        && db.queryForObject(
                "select count(*) from clinical_record where id=? and patient_id=? and kind=? and"
                    + " author_id=? and status='active'",
                Integer.class,
                replaces,
                p,
                k,
                uid(u))
            != 1) throw error(403, "Only author may amend an active record");
    String recipient = optional(b, "recipientId"), idem = optional(b, "idempotencyKey");
    int quantity = number(b, "quantity", 1, 100000, 1), refills = number(b, "refills", 0, 12, 0);
    if (Set.of("lab_order", "imaging_order", "prescription").contains(k)) {
      String target =
          k.equals("prescription") ? "pharmacy" : k.equals("imaging_order") ? "diagnostic" : "lab";
      if (db.queryForObject(
              "select count(*) from app_user where id=? and role=?",
              Integer.class,
              recipient,
              target)
          != 1) throw error(400, "Valid recipientId required");
      var targetUser=db.queryForMap("select * from app_user where id=?",recipient);
      if(!Objects.equals(targetUser.get("organization_id"),u.get("organization_id")))throw error(403,"Explicit external integration is required for another organization");
      tenants.validate(targetUser);
    }
    String dosage = optional(b, "dosage"),
        route = optional(b, "route"),
        frequency = optional(b, "frequency"),
        duration = optional(b, "duration");
    if (k.equals("prescription")) {
      dosage = field(b, "dosage", 100);
      route = field(b, "route", 100);
      frequency = field(b, "frequency", 100);
      duration = field(b, "duration", 100);
      if (!b.containsKey("quantity")) throw error(400, "Prescription quantity required");
    }
    if (Set.of("lab_result", "imaging_report", "dispense").contains(k)
        && !(k.equals("imaging_report") && related.isBlank())) {
      var parent = db.queryForMap("select * from clinical_record where id=?", related);
      if(!tenants.recordVisible(u,parent))throw error(403,"Related record belongs to another organization");
      if (!uid(u).equals(parent.get("recipient_id")))
        throw error(403, "Order is assigned to another recipient");
      if (k.equals("dispense")) {
        if (idem.isBlank() || idem.length() > 100)
          throw error(400, "Dispense idempotencyKey required");
        var existing =
            db.queryForList(
                "select * from clinical_record where author_id=? and idempotency_key=?",
                uid(u),
                idem);
        if (!existing.isEmpty()) {
          var old = existing.getFirst();
          if (!related.equals(old.get("related_id"))
              || quantity != ((Number) old.get("quantity")).intValue())
            throw error(409, "Idempotency key reused with different content");
          return old;
        }
        int fills =
            db.queryForObject(
                "select count(*) from clinical_record where kind='dispense' and related_id=?",
                Integer.class,
                related);
        if (fills > ((Number) parent.get("refills")).intValue())
          throw error(409, "Prescription refill allowance exhausted");
        if (quantity > ((Number) parent.get("quantity")).intValue())
          throw error(409, "Dispense exceeds prescribed quantity");
      }
    }
    String finalDosage = dosage,
        finalRoute = route,
        finalFrequency = frequency,
        finalDuration = duration;
    String rid = id();
    tx.executeWithoutResult(
        s -> {
          if (!replaces.isBlank()) {
            var previous =
                db.queryForMap("select * from clinical_record where id=? for update", replaces);
            if (!"active".equals(previous.get("status")))
              throw error(409, "This record was already amended");
            db.update(
                "update clinical_record set"
                    + " status='amended',updated_at=?,record_version=record_version+1 where id=?",
                now(),
                replaces);
            provenance.revision(
                replaces, uid(u), "amended", optional(b, "correctionReason"), previous);
          }
          db.update(
              "insert into"
                  + " clinical_record(id,patient_id,kind,title,details,author_id,source,status,created_at,replaces_id,related_id)"
                  + " values(?,?,?,?,?,?,?,?,?,?,?)",
              rid,
              p,
              k,
              title,
              details,
              uid(u),
              role(u).equals("patient") ? "Patient entered — unverified" : u.get("organization"),
              "active",
              now(),
              replaces.isBlank() ? null : replaces,
              related.isBlank() ? null : related);
          db.update(
              "update clinical_record set"
                  + " recipient_id=?,quantity=?,refills=?,dosage=?,route=?,frequency=?,duration=?,idempotency_key=?"
                  + " where id=?",
              recipient.isBlank() ? null : recipient,
              quantity,
              refills,
              finalDosage,
              finalRoute,
              finalFrequency,
              finalDuration,
              idem.isBlank() ? null : idem,
              rid);
          db.update(
              "update clinical_record set clinical_status=? where id=?",
              clinicalStatus.isBlank() ? null : clinicalStatus,
              rid);
          var metadata = new LinkedHashMap<String, Object>(b);
          if (!replaces.isBlank()) {
            var previous = db.queryForMap("select * from clinical_record where id=?", replaces);
            for (var pair :
                Map.of(
                        "observedAt",
                        "observed_at",
                        "observedTimezone",
                        "observed_timezone",
                        "sourceType",
                        "source_type",
                        "source",
                        "source",
                        "historical",
                        "historical")
                    .entrySet())
              if (!metadata.containsKey(pair.getKey()))
                metadata.put(pair.getKey(), previous.get(pair.getValue()));
          }
          provenance.stamp(rid, metadata, u);
          audit(uid(u), p, replaces.isBlank() ? "RECORD_CREATED" : "RECORD_AMENDED", rid);
        });
    return provenance.view(db.queryForMap("select * from clinical_record where id=?", rid));
  }

  @GetMapping("/records/{rid}/history")
  Map<String, Object> recordHistory(@PathVariable String rid, HttpServletRequest r) {
    var u = user(r);
    var rows = db.queryForList("select * from clinical_record where id=?", rid);
    if (rows.isEmpty()) throw error(404, "Record not found");
    var record = rows.getFirst();
    require(u, record.get("patient_id").toString(), record.get("kind").toString());
    if (!tenants.recordVisible(u,record)) throw error(403,"Record belongs to a different organization");
    audit(uid(u), record.get("patient_id").toString(), "RECORD_HISTORY_READ", rid);
    return Map.of(
        "revisions",
        db.queryForList(
            "select v.*,u.display_name as actor_name from record_revision v left join app_user u on"
                + " u.id=v.actor_id where record_id=? order by occurred_at",
            rid));
  }

  @GetMapping("/audit")
  List<Map<String, Object>> auditTrail(HttpServletRequest r) {
    var u = user(r);
    if (role(u).equals("security")) {
      if(tenants.operator(u))return db.queryForList("select * from audit_event order by seq desc limit 500");
      return db.queryForList("select a.* from audit_event a join app_user actor on a.actor_id=actor.id where actor.organization_id=? order by a.seq desc limit 500",u.get("organization_id"));
    }
    return db.queryForList(
        "select * from audit_event where actor_id=? or patient_id=? order by seq desc limit 500",
        uid(u),
        uid(u));
  }

  // Append to the local hash-linked audit sequence. synchronized coordinates this process only;
  // this is not independently protected retention or a multi-instance locking strategy.
  synchronized void audit(String actor, String patient, String action, String resource) {
    var previous = db.queryForList("select event_hash from audit_event order by seq desc limit 1");
    String
        prev =
            previous.isEmpty() ? "0".repeat(64) : previous.getFirst().get("event_hash").toString(),
        at = now(),
        eid = id();
    try {
      String canonical =
          json.writeValueAsString(Arrays.asList(eid, actor, patient, action, resource, at, prev));
      String hash =
          HexFormat.of()
              .formatHex(
                  MessageDigest.getInstance("SHA-256")
                      .digest(canonical.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
      db.update(
          "insert into"
              + " audit_event(id,actor_id,patient_id,action,resource_id,occurred_at,previous_hash,event_hash)"
              + " values(?,?,?,?,?,?,?,?)",
          eid,
          actor,
          patient,
          action,
          resource,
          at,
          prev,
          hash);
    } catch (Exception e) {
      throw new IllegalStateException("Audit write failed", e);
    }
  }

  // Export must use the same authorized record selection as the timeline, not a raw table dump.
  @GetMapping("/patients/{patient}/export")
  Map<String, Object> export(@PathVariable String patient, HttpServletRequest r) {
    var u = user(r);
    if (!role(u).equals("patient") || !uid(u).equals(patient))
      throw error(403, "Patient export only");
    var rows = timeline(patient, r);
    audit(uid(u), patient, "EXPORT", patient);
    return Map.of(
        "format",
        "Health Passport portable JSON v1",
        "generatedAt",
        now(),
        "patient",
        publicUser(u),
        "records",
        rows,
        "notice",
        "Synthetic demonstration. Not a legal medical record export.");
  }

  @GetMapping("/fhir/metadata")
  Map<String, Object> capability() {
    return FhirMapper.capability();
  }

  @GetMapping("/patients/{patient}/fhir")
  Map<String, Object> fhir(@PathVariable String patient, HttpServletRequest r) {
    var u = user(r);
    if (!role(u).equals("patient") || !uid(u).equals(patient))
      throw error(403, "Patient export only");
    var bundle = FhirMapper.bundle(publicUser(u), timeline(patient, r));
    audit(uid(u), patient, "FHIR_EXPORT", patient);
    return bundle;
  }

  @PostMapping("/break-glass")
  void emergency(HttpServletRequest r) {
    csrf(r);
    var u = user(r);
    audit(uid(u), null, "BREAK_GLASS_BLOCKED", "disabled");
    throw error(
        403, "Emergency override is disabled pending governance and step-up authentication");
  }
}
