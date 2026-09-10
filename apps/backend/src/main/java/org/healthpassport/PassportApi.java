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

  static final Set<String> KINDS =
      Set.of(
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
        byte[] bits = new byte[16];
        new SecureRandom().nextBytes(bits);
        String raw = HexFormat.of().formatHex(bits).toUpperCase();
        health = "HP-" + String.join("-", raw.split("(?<=\\G.{4})"));
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

  Map<String, Object> user(HttpServletRequest r) {
    HttpSession s = r.getSession(false);
    if (s == null || s.getAttribute("uid") == null) throw error(401, "Authentication required");
    identity.validateSession(r);
    var u = db.queryForMap("select * from app_user where id=?", s.getAttribute("uid"));
    verifyPractitioner(u);
    return u;
  }

  void verifyPractitioner(Map<String, Object> u) {
    if (!Set.of("doctor", "lab", "pharmacy").contains(role(u))) return;
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
    user(r);
    return db
        .queryForList("select * from app_user where role in ('doctor','lab','pharmacy')")
        .stream()
        .map(this::publicUser)
        .toList();
  }

  @GetMapping("/patients")
  List<Map<String, Object>> patients(HttpServletRequest r) {
    var u = user(r);
    if (role(u).equals("patient")) return List.of(publicUser(u));
    if (!Set.of("doctor", "lab", "pharmacy").contains(role(u))) return List.of();
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

  boolean hasGrant(Map<String, Object> u, String patient) {
    if (!Set.of("doctor", "lab", "pharmacy").contains(role(u))) return false;
    return db
        .queryForList(
            "select expires_at from consent where patient_id=? and grantee_id=? and status='active'"
                + " and purpose='treatment'",
            patient,
            uid(u))
        .stream()
        .anyMatch(c -> Instant.parse(c.get("expires_at").toString()).isAfter(Instant.now()));
  }

  boolean allowed(Map<String, Object> u, String p, String kind) {
    if (role(u).equals("patient")) return uid(u).equals(p);
    if (!Set.of("doctor", "lab", "pharmacy").contains(role(u))) return false;
    if (role(u).equals("lab")
        && !Set.of("lab_order", "lab_result", "imaging_report").contains(kind)) return false;
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
            .filter(x -> allowed(u, patient, x.get("kind").toString()))
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
            "select count(*) from app_user where id=? and role in ('doctor','lab','pharmacy')",
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
    if (!Set.of("doctor", "lab", "pharmacy").contains(role(u)))
      throw error(403, "Clinical role required");
    String health = field(b, "healthId", 64), purpose = field(b, "purpose", 40);
    if (!purpose.equals("treatment")) throw error(400, "Only treatment is supported");
    var found = db.queryForList("select id from app_user where health_id=?", health);
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
                  "note",
                  "allergy",
                  "condition",
                  "medication",
                  "encounter",
                  "lab_order",
                  "prescription");
          case "lab" -> Set.of("lab_result", "imaging_report");
          case "pharmacy" -> Set.of("dispense");
          default -> Set.of();
        };
    if (!writable.contains(k)) throw error(403, "Role cannot write this record");
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
    if (Set.of("lab_result", "dispense").contains(k)) {
      String required = k.equals("dispense") ? "prescription" : "lab_order";
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
    if (Set.of("lab_order", "prescription").contains(k)) {
      String target = k.equals("prescription") ? "pharmacy" : "lab";
      if (db.queryForObject(
              "select count(*) from app_user where id=? and role=?",
              Integer.class,
              recipient,
              target)
          != 1) throw error(400, "Valid recipientId required");
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
    if (Set.of("lab_result", "dispense").contains(k)) {
      var parent = db.queryForMap("select * from clinical_record where id=?", related);
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
          if (!replaces.isBlank())
            db.update("update clinical_record set status='amended' where id=?", replaces);
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
          audit(uid(u), p, replaces.isBlank() ? "RECORD_CREATED" : "RECORD_AMENDED", rid);
        });
    return db.queryForMap("select * from clinical_record where id=?", rid);
  }

  @GetMapping("/audit")
  List<Map<String, Object>> auditTrail(HttpServletRequest r) {
    var u = user(r);
    if (role(u).equals("security"))
      return db.queryForList("select * from audit_event order by seq desc limit 500");
    return db.queryForList(
        "select * from audit_event where actor_id=? or patient_id=? order by seq desc limit 500",
        uid(u),
        uid(u));
  }

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
