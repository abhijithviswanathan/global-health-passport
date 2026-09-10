import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.security.*;
import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;

class LogicalPostgresRestore {
  static final ObjectMapper JSON = new ObjectMapper();
  static final List<String> TABLES =
      List.of(
          "app_user",
          "consent",
          "clinical_record",
          "access_request",
          "audit_event",
          "identity_mfa",
          "recovery_code",
          "identity_session",
          "medical_document",
          "passkey_credential",
          "passkey_challenge",
          "medication_passport",
          "practitioner_verification");

  static String q(String n) {
    return "\"" + n.replace("\"", "\"\"") + "\"";
  }

  static String hash(Object o) throws Exception {
    return HexFormat.of()
        .formatHex(MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(o)));
  }

  static List<Map<String, Object>> rows(Connection c, String table) throws Exception {
    String pk;
    try (var r = c.getMetaData().getPrimaryKeys(null, "public", table)) {
      if (!r.next()) throw new Exception("No primary key " + table);
      pk = r.getString("COLUMN_NAME");
    }
    var out = new ArrayList<Map<String, Object>>();
    try (var s = c.createStatement();
        var r = s.executeQuery("select * from " + q(table) + " order by " + q(pk))) {
      var meta = r.getMetaData();
      while (r.next()) {
        Map<String, Object> row = new TreeMap<>();
        for (int i = 1; i <= meta.getColumnCount(); i++)
          row.put(meta.getColumnName(i), r.getObject(i));
        out.add(row);
      }
    }
    return out;
  }

  static Map<String, List<Object>> sequences(Connection c) throws Exception {
    Map<String, List<Object>> out = new TreeMap<>();
    try (var s = c.createStatement();
        var r =
            s.executeQuery(
                "select sequencename from pg_sequences where schemaname='public' order by"
                    + " sequencename")) {
      while (r.next()) {
        String name = r.getString(1);
        try (var inner = c.createStatement();
            var state = inner.executeQuery("select last_value,is_called from " + q(name))) {
          state.next();
          out.put(name, List.of(state.getLong(1), state.getBoolean(2)));
        }
      }
    }
    return out;
  }

  static int audit(Connection c) throws Exception {
    String previous = "0".repeat(64);
    int count = 0;
    try (var s = c.createStatement();
        var r = s.executeQuery("select * from audit_event order by seq")) {
      while (r.next()) {
        if (!previous.equals(r.getString("previous_hash")))
          throw new Exception("Audit linkage mismatch");
        previous =
            hash(
                Arrays.asList(
                    r.getString("id"),
                    r.getString("actor_id"),
                    r.getString("patient_id"),
                    r.getString("action"),
                    r.getString("resource_id"),
                    r.getString("occurred_at"),
                    r.getString("previous_hash")));
        if (!previous.equals(r.getString("event_hash")))
          throw new Exception("Audit digest mismatch");
        count++;
      }
    }
    return count;
  }

  public static void main(String[] args) throws Exception {
    String pass = System.getenv("TEST_DATABASE_PASSWORD"),
        user = System.getenv().getOrDefault("TEST_DATABASE_USER", "postgres"),
        sourceUrl = System.getenv("SOURCE_DATABASE_URL"),
        targetUrl = System.getenv("TARGET_DATABASE_URL");
    if (pass == null || sourceUrl == null || targetUrl == null || sourceUrl.equals(targetUrl))
      throw new IllegalArgumentException(
          "Distinct source/target JDBC URLs and test password are required");
    Path evidenceDir =
        Path.of(
            System.getenv().getOrDefault("RESTORE_EVIDENCE_DIR", "target/postgres-verification"));
    Files.createDirectories(evidenceDir);
    Flyway.configure()
        .dataSource(targetUrl, user, pass)
        .locations("filesystem:src/main/resources/db/migration")
        .load()
        .migrate();
    try (var source = DriverManager.getConnection(sourceUrl, user, pass);
        var target = DriverManager.getConnection(targetUrl, user, pass)) {
      source.setAutoCommit(false);
      source.setReadOnly(true);
      source.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
      Map<String, List<Map<String, Object>>> snapshot = new LinkedHashMap<>();
      for (String table : TABLES) snapshot.put(table, rows(source, table));
      var sequenceState = sequences(source);
      int originalAudit = audit(source);
      source.commit();
      Path path = evidenceDir.resolve("application-snapshot.json");
      Files.writeString(
          path, JSON.writeValueAsString(Map.of("tables", snapshot, "sequences", sequenceState)));
      Files.setPosixFilePermissions(
          path, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
      target.setAutoCommit(false);
      for (String table : TABLES) {
        var data = snapshot.get(table);
        if (data.isEmpty()) continue;
        var columns = new ArrayList<>(data.getFirst().keySet());
        String query =
            "insert into "
                + q(table)
                + " ("
                + String.join(",", columns.stream().map(LogicalPostgresRestore::q).toList())
                + ") values ("
                + String.join(",", Collections.nCopies(columns.size(), "?"))
                + ")";
        try (var insert = target.prepareStatement(query)) {
          for (var row : data) {
            for (int i = 0; i < columns.size(); i++)
              insert.setObject(i + 1, row.get(columns.get(i)));
            insert.addBatch();
          }
          insert.executeBatch();
        }
      }
      for (var entry : sequenceState.entrySet())
        try (var reset = target.prepareStatement("select setval(?::regclass,?,?)")) {
          reset.setString(1, entry.getKey());
          reset.setLong(2, ((Number) entry.getValue().get(0)).longValue());
          reset.setBoolean(3, (Boolean) entry.getValue().get(1));
          reset.execute();
        }
      target.commit();
      Map<String, Object> evidence = new LinkedHashMap<>();
      Map<String, Integer> counts = new LinkedHashMap<>();
      for (String table : TABLES) {
        var restored = rows(target, table);
        if (!hash(snapshot.get(table)).equals(hash(restored)))
          throw new Exception("Table mismatch: " + table);
        counts.put(table, restored.size());
      }
      if (!sequenceState.equals(sequences(target))) throw new Exception("Sequence state mismatch");
      if (audit(target) != originalAudit) throw new Exception("Audit count mismatch");
      evidence.put("engine", "PostgreSQL");
      evidence.put("sourceDatabase", sourceUrl);
      evidence.put("restoredDatabase", targetUrl);
      evidence.put("migrationCount", 8);
      evidence.put(
          "method",
          "Logical application-table snapshot via JDBC, freshly Flyway-migrated target,"
              + " parameterized inserts");
      evidence.put("counts", counts);
      evidence.put("applicationDataSha256", hash(snapshot));
      evidence.put("sequenceCount", sequenceState.size());
      evidence.put("sequenceStateEqual", true);
      evidence.put("auditEventsVerified", originalAudit);
      evidence.put("allCanonicalRowsEqual", true);
      evidence.put(
          "limitation",
          "Not pg_dump, physical backup, point-in-time recovery, external document blob"
              + " restoration, key recovery, or a production disaster-recovery drill; empty feature"
              + " tables do not establish populated-row restore coverage");
      String report = JSON.writerWithDefaultPrettyPrinter().writeValueAsString(evidence);
      Files.writeString(evidenceDir.resolve("evidence.json"), report + "\n");
      System.out.println(report);
    }
  }
}
