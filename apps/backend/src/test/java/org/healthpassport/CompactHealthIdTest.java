package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class CompactHealthIdTest {
  @Test
  void migrationPreservesPatientReferencesAndHistoricalLookupAndDoesNotReissueIds()
      throws Exception {
    String url =
        "jdbc:h2:mem:compact-"
            + UUID.randomUUID()
            + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
    Flyway.configure().dataSource(url, "sa", "").target("8").load().migrate();
    String patient = UUID.randomUUID().toString();
    String legacy = "HP-1234-5678-90AB-CDEF-1234-5678-90AB-CDEF";
    try (var db = DriverManager.getConnection(url, "sa", "")) {
      try (var insert =
          db.prepareStatement(
              "insert into"
                  + " app_user(id,username,display_name,role,password_hash,health_id,organization)"
                  + " values(?,'legacy','Synthetic','patient','unused',?,'Synthetic')")) {
        insert.setString(1, patient);
        insert.setString(2, legacy);
        insert.executeUpdate();
      }
      try (var insert =
          db.prepareStatement(
              "insert into"
                  + " clinical_record(id,patient_id,kind,title,details,author_id,source,status,created_at)"
                  + " values(?,?,'note','Retained','Original',?,'Patient"
                  + " entered','active','2026-09-10T00:00:00Z')")) {
        insert.setString(1, UUID.randomUUID().toString());
        insert.setString(2, patient);
        insert.setString(3, patient);
        insert.executeUpdate();
      }
      Flyway.configure().dataSource(url, "sa", "").load().migrate();
      String compact;
      try (var query = db.createStatement();
          var rows = query.executeQuery("select id,health_id,internal_pk from app_user")) {
        assertTrue(rows.next());
        assertEquals(patient, rows.getString(1));
        compact = rows.getString(2);
        assertTrue(HealthIds.isCompact(compact));
        assertEquals(9, compact.length());
        assertEquals(1, rows.getLong(3));
      }
      try (var query = db.createStatement();
          var rows = query.executeQuery("select alias,user_id from health_id_alias")) {
        assertTrue(rows.next());
        assertEquals(HealthIds.normalize(legacy), rows.getString(1));
        assertEquals(patient, rows.getString(2));
      }
      try (var query = db.createStatement();
          var rows = query.executeQuery("select patient_id,details from clinical_record")) {
        assertTrue(rows.next());
        assertEquals(patient, rows.getString(1));
        assertEquals("Original", rows.getString(2));
      }
      Flyway.configure().dataSource(url, "sa", "").load().migrate();
      try (var query = db.createStatement();
          var rows = query.executeQuery("select health_id from app_user")) {
        assertTrue(rows.next());
        assertEquals(compact, rows.getString(1));
      }
    }
  }
}
