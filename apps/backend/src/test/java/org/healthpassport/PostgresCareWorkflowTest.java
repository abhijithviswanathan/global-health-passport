package org.healthpassport;

import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;

@EnabledIfEnvironmentVariable(named = "TEST_DATABASE_URL", matches = "jdbc:postgresql:.*")
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=${TEST_DATABASE_URL}",
      "spring.datasource.username=${TEST_DATABASE_USER:postgres}",
      "spring.datasource.password=${TEST_DATABASE_PASSWORD}",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=care-workflow-password!"
    })
class PostgresCareWorkflowTest extends CareWorkflowTest {
  @org.springframework.test.context.DynamicPropertySource
  static void database(org.springframework.test.context.DynamicPropertyRegistry properties) {
    PostgresTestDatabase.configure(properties, "care");
  }
}
