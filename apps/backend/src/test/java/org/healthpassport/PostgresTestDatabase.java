package org.healthpassport;

import java.util.UUID;
import org.springframework.test.context.DynamicPropertyRegistry;

/** Isolates each integration-test context without deleting an existing database. */
final class PostgresTestDatabase {
  private PostgresTestDatabase() {}

  static void configure(DynamicPropertyRegistry properties, String suite) {
    String schema = "hp_test_" + suite + "_" + UUID.randomUUID().toString().replace("-", "");
    properties.add("spring.flyway.schemas", () -> schema);
    properties.add("spring.flyway.default-schema", () -> schema);
    // Flyway creates this schema before application queries run. PostgreSQL accepts
    // a search_path naming a schema that does not exist yet.
    properties.add(
        "spring.datasource.hikari.connection-init-sql", () -> "SET search_path TO " + schema);
  }
}
