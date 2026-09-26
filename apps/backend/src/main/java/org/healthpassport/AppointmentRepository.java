package org.healthpassport;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Appointment and draft persistence. Callers own authorization and transaction boundaries. */
@Repository
class AppointmentRepository {
  private final JdbcTemplate database;

  AppointmentRepository(JdbcTemplate database) {
    this.database = database;
  }

  Optional<Map<String, Object>> findOwned(String appointmentId, String doctorId) {
    return database
        .queryForList(
            "select * from appointment where id=? and doctor_id=?", appointmentId, doctorId)
        .stream()
        .findFirst();
  }

  List<Map<String, Object>> forDoctor(String doctorId, long start, long end) {
    return database.queryForList(
        "select * from appointment where doctor_id=? and starts_at>=? "
            + "and starts_at<? order by starts_at,id",
        doctorId,
        start,
        end);
  }

  List<Map<String, Object>> findByRequest(String doctorId, String requestKey) {
    return database.queryForList(
        "select * from appointment where doctor_id=? and request_key=?", doctorId, requestKey);
  }

  Map<String, Object> patientIdentity(String patientId) {
    return database.queryForMap(
        "select display_name,health_id from app_user where id=?", patientId);
  }

  void lockDoctor(String doctorId) {
    database.queryForMap("select id from app_user where id=? for update", doctorId);
  }

  boolean overlaps(String doctorId, long start, long end, String exceptId) {
    return database.queryForObject(
            "select count(*) from appointment where doctor_id=? and id<>? "
                + "and status not in ('cancelled','no_show') and starts_at < ? "
                + "and starts_at + duration_minutes * 60000 > ?",
            Integer.class,
            doctorId,
            exceptId,
            end,
            start)
        > 0;
  }

  void insert(
      String id,
      String doctorId,
      String patientId,
      long start,
      int duration,
      String reason,
      String mode,
      String requestKey,
      Object tenantId,
      String timestamp) {
    database.update(
        "insert into appointment(id,doctor_id,patient_id,starts_at,duration_minutes,"
            + "reason,visit_mode,status,request_key,created_at,updated_at,tenant_id) "
            + "values(?,?,?,?,?,?,?,'scheduled',?,?,?,?)",
        id,
        doctorId,
        patientId,
        start,
        duration,
        reason,
        mode,
        requestKey,
        timestamp,
        timestamp,
        tenantId);
  }

  void update(String id, long start, int duration, String status, String timestamp) {
    database.update(
        "update appointment set starts_at=?,duration_minutes=?,status=?,"
            + "version=version+1,updated_at=? where id=?",
        start,
        duration,
        status,
        timestamp,
        id);
  }

  void complete(String id, Object recordId, String timestamp) {
    database.update(
        "update appointment set status='completed',completed_record_id=?,"
            + "version=version+1,updated_at=? where id=?",
        recordId,
        timestamp,
        id);
  }

  Map<String, Object> draft(String appointmentId) {
    var drafts =
        database.queryForList(
            "select subjective,objective,assessment,plan,version,updated_at "
                + "from visit_draft where appointment_id=?",
            appointmentId);
    return drafts.isEmpty()
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
        : drafts.getFirst();
  }

  void saveDraft(String appointmentId, VisitNote note, String timestamp) {
    // The service holds the doctor's row lock; do not split this check/write out of its
    // transaction.
    boolean exists =
        database.queryForObject(
                "select count(*) from visit_draft where appointment_id=?",
                Integer.class,
                appointmentId)
            > 0;
    if (exists)
      database.update(
          "update visit_draft set subjective=?,objective=?,assessment=?,plan=?,"
              + "version=version+1,updated_at=? where appointment_id=?",
          note.subjective(),
          note.objective(),
          note.assessment(),
          note.plan(),
          timestamp,
          appointmentId);
    else
      database.update(
          "insert into visit_draft(appointment_id,subjective,objective,assessment,plan,"
              + "version,updated_at) values(?,?,?,?,?,1,?)",
          appointmentId,
          note.subjective(),
          note.objective(),
          note.assessment(),
          note.plan(),
          timestamp);
  }

  void recordDraftRevision(
      String id,
      String appointmentId,
      String actorId,
      String timestamp,
      String before,
      String after) {
    database.update(
        "insert into care_event values(?,?,?,?,?,?,?,?)",
        id,
        "visit_draft",
        appointmentId,
        actorId,
        timestamp,
        "draft_saved",
        before,
        after);
  }
}
