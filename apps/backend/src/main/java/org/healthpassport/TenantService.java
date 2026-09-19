/**
 * Shared organization, employment, role and privilege checks across API modules.
 * Stable organization IDs and employment records drive access, including legacy paths.
 * Database constraints complement these checks; neither a display label nor a client
 * role selector establishes organization membership.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Tenant identity and employment checks shared by all API paths, including legacy paths. */
@Service
class TenantService {
  final JdbcTemplate db;

  TenantService(JdbcTemplate db) {
    this.db = db;
  }

  static final Map<String, String> ROLES =
      Map.ofEntries(
          Map.entry("physician", "doctor"),
          Map.entry("surgeon", "doctor"),
          Map.entry("resident", "doctor"),
          Map.entry("fellow", "doctor"),
          Map.entry("nurse", "nurse"),
          Map.entry("nurse_practitioner", "nurse"),
          Map.entry("physician_assistant", "nurse"),
          Map.entry("medical_assistant", "nurse"),
          Map.entry("laboratory_technician", "lab"),
          Map.entry("radiology_technician", "diagnostic"),
          Map.entry("radiologist", "doctor"),
          Map.entry("pharmacist", "pharmacy"),
          Map.entry("therapist", "nurse"),
          Map.entry("receptionist", "reception"),
          Map.entry("scheduler", "reception"),
          Map.entry("billing_staff", "billing"),
          Map.entry("department_manager", "coordinator"),
          Map.entry("hospital_administrator", "admin"),
          Map.entry("security_administrator", "security"),
          Map.entry("insurer_manager", "insurer"));
  static final Set<String> CLINICAL = Set.of("doctor", "nurse", "lab", "diagnostic", "pharmacy");

  static String professional(String role) {
    return switch (role) {
      case "doctor" -> "physician";
      case "nurse" -> "nurse";
      case "lab" -> "laboratory_technician";
      case "diagnostic" -> "radiology_technician";
      case "pharmacy" -> "pharmacist";
      case "admin" -> "hospital_administrator";
      case "coordinator" -> "department_manager";
      case "reception" -> "receptionist";
      case "security" -> "security_administrator";
      case "billing" -> "billing_staff";
      case "insurer" -> "insurer_manager";
      default -> role;
    };
  }

  String org(Map<String, Object> u) {
    if (u.get("organization_id") == null) throw error(403, "Organization membership required");
    return u.get("organization_id").toString();
  }

  Map<String, Object> employment(Map<String, Object> u) {
    var rows =
        db.queryForList(
            "select * from employment where user_id=? and organization_id=?", u.get("id"), org(u));
    if (rows.isEmpty()) throw error(403, "Employment membership required");
    return rows.getFirst();
  }

  boolean operator(Map<String, Object> u) {
    return db.queryForObject(
            "select count(*) from platform_operator where user_id=?", Integer.class, u.get("id"))
        == 1;
  }

  void validate(Map<String, Object> u) {
    if ("patient".equals(u.get("role"))) return;
    var e = employment(u);
    boolean expired =
        expired(e.get("end_at"))
            || (CLINICAL.contains(u.get("role")) && expired(e.get("credential_until")));
    if (!"active".equals(e.get("status"))
        || expired
        || Instant.parse(e.get("start_at").toString()).isAfter(Instant.now())) {
      db.update("update identity_session set revoked=true where user_id=?", u.get("id"));
      if (expired) {
        expire(e);
      }
      throw error(403, "Employment or credentials are inactive or expired");
    }
    var o = db.queryForMap("select * from healthcare_organization where id=?", org(u));
    if ("suspended".equals(o.get("status"))) throw error(403, "Organization access suspended");
  }

  synchronized void expire(Map<String, Object> e) {
    int changed =
        db.update(
            "update employment set status='expired',version=version+1 where id=? and"
                + " status='active'",
            e.get("id"));
    if (changed == 0) return;
    db.update("update identity_session set revoked=true where user_id=?", e.get("user_id"));
    db.update(
        "update care_assignment set active=false,version=version+1 where staff_id=? and"
            + " active=true",
        e.get("user_id"));
    db.update(
        "update workforce_shift set status='cancelled',version=version+1 where employee_id=? and"
            + " ends_at>?",
        e.get("id"),
        now());
    db.update(
        "insert into"
            + " organization_event(id,organization_id,actor_id,resource_type,resource_id,action,severity,created_at)"
            + " values(?,?,?,'employment',?,'employment_expired','urgent',?)",
        id(),
        e.get("organization_id"),
        e.get("user_id"),
        e.get("id"),
        now());
  }

  boolean trusted(Map<String, Object> u) {
    if ("patient".equals(u.get("role"))) return true;
    if (u.get("organization_id") == null) return false;
    var o = db.queryForMap("select status from healthcare_organization where id=?", org(u));
    return Set.of("verified", "synthetic_verified").contains(o.get("status"));
  }

  static boolean expired(Object v) {
    return v != null && !Instant.parse(v.toString()).isAfter(Instant.now());
  }

  boolean privilege(Map<String, Object> u, String kind, boolean write) {
    if ("patient".equals(u.get("role"))) return true;
    if (!trusted(u)) return false;
    try {
      var e = employment(u);
      if (!"active".equals(e.get("status"))
          || expired(e.get("end_at"))
          || expired(e.get("credential_until"))) return false;
      if (CLINICAL.contains(u.get("role"))
          && !Set.of("verified", "synthetic_verified").contains(e.get("credential_status")))
        return false;
      return Arrays.asList(e.get("privileges").toString().split(","))
          .contains((write ? "write:" : "read:") + kind);
    } catch (org.springframework.web.server.ResponseStatusException ex) {
      return false;
    }
  }

  static String defaults(String role) {
    var read = new LinkedHashSet<String>();
    var write = new LinkedHashSet<String>();
    switch (role) {
      case "doctor" -> {
        read.addAll(PassportApi.KINDS);
        write.addAll(PassportApi.KINDS);
        write.removeAll(Set.of("lab_result", "imaging_report", "dispense"));
      }
      case "nurse" -> {
        read.addAll(
            Set.of(
                "vital",
                "history",
                "nursing_observation",
                "allergy",
                "medication",
                "condition",
                "encounter",
                "note",
                "lab_order",
                "lab_result",
                "document",
                "follow_up",
                "discharge",
                "prescription"));
        write.addAll(Set.of("vital", "history", "nursing_observation"));
      }
      case "lab" -> {
        read.addAll(Set.of("lab_order", "lab_result"));
        write.add("lab_result");
      }
      case "diagnostic" -> {
        read.addAll(Set.of("imaging_order", "imaging_report"));
        write.add("imaging_report");
      }
      case "pharmacy" -> {
        read.addAll(Set.of("prescription", "dispense", "allergy", "medication"));
        write.add("dispense");
      }
      default -> {}
    }
    var p = new ArrayList<String>();
    read.forEach(k -> p.add("read:" + k));
    write.forEach(k -> p.add("write:" + k));
    return String.join(",", p);
  }

  // Apply organization visibility in addition to the patient/category checks performed by callers.
  boolean recordVisible(Map<String, Object> u, Map<String, Object> record) {
    if ("patient".equals(u.get("role")))
      return Objects.equals(u.get("id"), record.get("patient_id"));
    if ("document".equals(record.get("kind"))
        && db.queryForObject(
                "select count(*) from medical_document where id=? and document_purpose='insurance'",
                Integer.class,
                record.get("id"))
            > 0) return false;
    Object tenant = record.get("tenant_id");
    if (tenant == null && record.get("author_id") != null) {
      var author =
          db.queryForList(
              "select organization_id,role from app_user where id=?", record.get("author_id"));
      if (!author.isEmpty() && !"patient".equals(author.getFirst().get("role")))
        tenant = author.getFirst().get("organization_id");
    }
    return tenant == null || Objects.equals(tenant, u.get("organization_id"));
  }

  void enroll(Map<String, Object> u, String professional, String node, String status) {
    if ("patient".equals(u.get("role"))) return;
    String oid = org(u);
    if (db.queryForObject(
            "select count(*) from employment where user_id=?", Integer.class, u.get("id"))
        > 0) return;
    String code =
        db.queryForObject("select code from healthcare_organization where id=?", String.class, oid);
    db.update(
        "insert into"
            + " employment(id,organization_id,user_id,work_id,professional_role,node_id,start_at,credential_status,privileges,status,created_at)"
            + " values(?,?,?,?,?,?,?,?,?,?,?)",
        id(),
        oid,
        u.get("id"),
        code + "-" + HealthIds.generate(),
        professional,
        node,
        now(),
        status,
        defaults(u.get("role").toString()),
        "active",
        now());
  }

  /**
   * One-time adoption of pre-existing staff; only the original named synthetic tenant is trusted.
   */
  void bootstrap(boolean demo) {
    for (var row :
        db.queryForList(
            "select distinct organization from app_user where role<>'patient' and organization_id"
                + " is null")) {
      String key = row.get("organization").toString();
      var organizations =
          db.queryForList("select * from healthcare_organization where legacy_key=?", key);
      String oid;
      if (organizations.isEmpty()) {
        oid = id();
        String trust =
            demo && key.equals("Northstar Demo Network") ? "synthetic_verified" : "pending";
        db.update(
            "insert into healthcare_organization(id,code,legacy_key,name,type,status,created_at)"
                + " values(?,?,?,?,?,?,?)",
            oid,
            "ORG-" + HealthIds.generate(),
            key,
            key,
            "hospital",
            trust,
            now());
        db.update("insert into workforce_policy values(?,false,0)", oid);
      } else oid = organizations.getFirst().get("id").toString();
      db.update(
          "update app_user set organization_id=? where organization=? and role<>'patient' and"
              + " organization_id is null",
          oid,
          key);
    }
    for (var u :
        db.queryForList(
            "select * from app_user where role<>'patient' and not exists(select 1 from employment e"
                + " where e.user_id=app_user.id)")) {
      enroll(
          u,
          professional(u.get("role").toString()),
          null,
          demo && "Northstar Demo Network".equals(u.get("organization"))
              ? "synthetic_verified"
              : "unverified");
      if (demo
          && "security".equals(u.get("username"))
          && "Northstar Demo Network".equals(u.get("organization")))
        db.update("insert into platform_operator(user_id) values(?)", u.get("id"));
    }
    db.update(
        "update clinical_record set tenant_id=(select organization_id from app_user where"
            + " id=clinical_record.author_id) where tenant_id is null");
    db.update(
        "update medical_document set tenant_id=(select organization_id from app_user where"
            + " id=medical_document.author_id) where tenant_id is null");
    db.update(
        "update appointment set tenant_id=(select organization_id from app_user where"
            + " id=appointment.doctor_id) where tenant_id is null");
    db.update(
        "update care_task set tenant_id=(select organization_id from app_user where"
            + " id=care_task.creator_id) where tenant_id is null");
  }

  // When availability enforcement is enabled, require a covering work shift and no blocked interval.
  // The legacy except argument is currently unused here; appointment overlap checks live in callers.
  void available(Map<String, Object> doctor, Instant start, int duration, String except) {
    String oid = org(doctor);
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "select enforce_availability from workforce_policy where organization_id=?",
            Boolean.class,
            oid))) return;
    var e = employment(doctor);
    Instant end = start.plusSeconds(duration * 60L);
    var shifts =
        db.queryForList(
            "select * from workforce_shift where employee_id=? and organization_id=? and"
                + " status='active'",
            e.get("id"),
            oid);
    boolean covered =
        shifts.stream()
            .anyMatch(
                s ->
                    Set.of("shift", "rotation", "coverage", "substitution").contains(s.get("kind"))
                        && !Instant.parse(s.get("starts_at").toString()).isAfter(start)
                        && !Instant.parse(s.get("ends_at").toString()).isBefore(end));
    boolean blocked =
        shifts.stream()
            .anyMatch(
                s ->
                    Set.of("leave", "break", "procedure", "on_call").contains(s.get("kind"))
                        && Instant.parse(s.get("starts_at").toString()).isBefore(end)
                        && Instant.parse(s.get("ends_at").toString()).isAfter(start));
    if (!covered || blocked)
      throw error(409, "This time is outside the doctor's available work schedule");
  }
}
