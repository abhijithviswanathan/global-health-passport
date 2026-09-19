/**
 * Clinical observation times, author snapshots, revision history and freshness labels.
 * Observed time is when care happened; created/updated time is when data was entered.
 * Carry-forward or confirmation must not silently become a new clinical measurement.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class RecordProvenance {
  final JdbcTemplate db;
  final ObjectMapper json;

  RecordProvenance(JdbcTemplate db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  String encode(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (Exception e) {
      throw error(400, "Invalid record content");
    }
  }

  String optional(Map<String, Object> b, String key, int length) {
    Object v = b.get(key);
    if (v == null || "".equals(v)) return null;
    if (!(v instanceof String s) || s.length() > length) throw error(400, "Invalid " + key);
    return (String) v;
  }

  String time(Map<String, Object> b, String key) {
    String value = optional(b, key, 40);
    if (value == null) return null;
    try {
      return OffsetDateTime.parse(value).toString();
    } catch (Exception e) {
      throw error(400, key + " requires an ISO date, time and UTC offset");
    }
  }

  // Capture an auditable snapshot of the record after a change, with the prior value when supplied.
  void revision(String rid, String actor, String action, String reason, Map<String, Object> old) {
    db.update(
        "insert into record_revision values(?,?,?,?,?,?,?,?)",
        id(),
        rid,
        actor,
        now(),
        action,
        reason,
        old == null ? null : encode(old),
        encode(db.queryForMap("select * from clinical_record where id=?", rid)));
  }

  // Keep observed time/zone and source/author metadata separate from database insertion timestamps.
  void stamp(String rid, Map<String, Object> b, Map<String, Object> u) {
    String observed = time(b, "observedAt"),
        zone = optional(b, "observedTimezone", 80),
        source = optional(b, "sourceType", 40),
        origin = optional(b, "originalRecordId", 36);
    if (zone != null)
      try {
        ZoneId.of(zone);
      } catch (Exception e) {
        throw error(400, "Unknown timezone");
      }
    if (source != null
        && !Set.of(
                "patient_report",
                "nurse_observation",
                "clinician_observation",
                "device",
                "laboratory",
                "uploaded_document",
                "imported_record",
                "unknown")
            .contains(source)) throw error(400, "Invalid source type");
    String sourceText = optional(b, "source", 100);
    if ("patient".equals(u.get("role")) && source == null) {
      source = "patient_report";
      if (sourceText == null) sourceText = "Patient entered — unverified";
    }
    boolean historical = Boolean.TRUE.equals(b.get("historical"));
    if (origin != null) {
      var origins =
          db.queryForList(
              "select * from clinical_record where id=? and patient_id=(select patient_id from"
                  + " clinical_record where id=?)",
              origin,
              rid);
      if (origins.isEmpty()) throw error(400, "Original record must belong to this patient");
      var o = origins.getFirst();
      if (!o.get("kind")
          .equals(
              db.queryForObject("select kind from clinical_record where id=?", String.class, rid)))
        throw error(400, "Carried information must retain its record type");
      if (!Objects.equals(
          o.get("details"),
          db.queryForObject("select details from clinical_record where id=?", String.class, rid)))
        throw error(
            400,
            "Carried records must retain the original content. Use an amendment for corrections.");
      observed = (String) o.get("observed_at");
      zone = (String) o.get("observed_timezone");
      source = (String) o.get("source_type");
      sourceText = (String) o.get("source");
      historical = true;
    }
    String encounter = optional(b, "encounterId", 36);
    if (encounter != null
        && db.queryForObject(
                "select count(*) from appointment where id=? and patient_id=(select patient_id from"
                    + " clinical_record where id=?)",
                Integer.class,
                encounter,
                rid)
            != 1) throw error(400, "Encounter does not belong to this patient");
    String reason = optional(b, "correctionReason", 1000);
    String state =
        "draft".equals(b.get("noteState"))
            ? "draft"
            : ("doctor".equals(u.get("role")) ? "signed" : "recorded");
    db.update("update clinical_record set tenant_id=? where id=?", u.get("organization_id"), rid);
    if (u.get("organization_id") != null)
      db.update(
          "insert into"
              + " organization_event(id,organization_id,actor_id,resource_type,resource_id,action,severity,created_at)"
              + " values(?,?,?,'clinical_record',?,'clinical_entry_recorded','routine',?)",
          id(),
          u.get("organization_id"),
          u.get("id"),
          rid,
          now());
    db.update(
        "update clinical_record set"
            + " observed_at=?,observed_timezone=?,updated_at=?,author_role=?,author_organization=?,author_clinic=?,author_department=?,source_type=?,source=?,original_record_id=?,historical=?,note_state=?,signed_at=?,encounter_id=?,correction_reason=?"
            + " where id=?",
        observed,
        zone,
        now(),
        u.get("role"),
        u.get("organization"),
        u.get("clinic"),
        u.get("department"),
        source,
        sourceText == null ? "Unknown" : sourceText,
        origin,
        historical,
        state,
        state.equals("signed") ? now() : null,
        encounter,
        reason,
        rid);
    if (b.get("measurements") instanceof Map<?, ?> values && !values.isEmpty()) {
      Map<String, Double> limits =
          Map.of(
              "temperature_c",
              100.0,
              "spo2_percent",
              100.0,
              "systolic_mmhg",
              400.0,
              "diastolic_mmhg",
              300.0,
              "pulse_bpm",
              400.0,
              "height_cm",
              300.0,
              "weight_kg",
              1000.0);
      for (var e : values.entrySet())
        if (!limits.containsKey(e.getKey())
            || !(e.getValue() instanceof Number n)
            || !Double.isFinite(n.doubleValue())
            || n.doubleValue() <= 0
            || n.doubleValue() > limits.get(e.getKey()))
          throw error(400, "Invalid vital value or unit");
      if (values.containsKey("systolic_mmhg") != values.containsKey("diastolic_mmhg"))
        throw error(400, "Enter both blood pressure values");
      db.update("update clinical_record set measurements=? where id=?", encode(values), rid);
    }
    if (origin != null)
      db.update(
          "update clinical_record set measurements=(select measurements from clinical_record where"
              + " id=?) where id=?",
          origin,
          rid);
    revision(
        rid, u.get("id").toString(), origin == null ? "created" : "carried_forward", reason, null);
  }

  // Add read-time freshness/provenance labels; unknown observation time must stay unknown.
  Map<String, Object> view(Map<String, Object> row) {
    var out = new LinkedHashMap<>(row);
    if (!out.containsKey("author_name"))
      out.put(
          "author_name",
          db.queryForObject(
              "select display_name from app_user where id=?", String.class, row.get("author_id")));
    var rules =
        db.queryForList(
            "select minutes from clinic_freshness where kind=? and organization=? and clinic=?",
            row.get("kind"),
            row.get("author_organization"),
            row.get("author_clinic"));
    if (rules.isEmpty())
      rules = db.queryForList("select minutes from freshness_rule where kind=?", row.get("kind"));
    Object observed = row.get("observed_at");
    Long age = null;
    if (observed != null)
      try {
        age =
            Math.max(
                0,
                Duration.between(
                        OffsetDateTime.parse(observed.toString()).toInstant(), Instant.now())
                    .toMinutes());
      } catch (Exception ignored) {
      }
    boolean future =
        observed != null
            && OffsetDateTime.parse(observed.toString())
                .toInstant()
                .isAfter(Instant.now().plusSeconds(300));
    if (future) age = null;
    out.put("age_minutes", age);
    out.put("freshness_minutes", rules.isEmpty() ? null : rules.getFirst().get("minutes"));
    boolean stale =
        age != null
            && !rules.isEmpty()
            && age > ((Number) rules.getFirst().get("minutes")).longValue();
    out.put(
        "freshness_label",
        future
            ? "Future observation date — verify timestamp"
            : row.get("original_record_id") != null
                ? "Carried forward"
                : Boolean.TRUE.equals(row.get("historical")) || stale
                    ? "Historical data"
                    : age == null ? "Observation date unknown" : "Observation date recorded");
    out.put(
        "confirmations",
        db.queryForList(
            "select c.*,u.display_name as actor_name,u.role as actor_role from record_confirmation"
                + " c join app_user u on u.id=c.actor_id where record_id=? order by confirmed_at"
                + " desc",
            row.get("id")));
    return out;
  }
}
