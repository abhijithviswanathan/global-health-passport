package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=jdbc:h2:mem:learning;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=test-passphrase-258!"
    })
class LearningTest {
  @LocalServerPort int port;
  @Autowired ObjectMapper mapper;
  @Autowired JdbcTemplate db;

  class Client {
    HttpClient http =
        HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
    String csrf;
    JsonNode user;

    HttpResponse<String> call(String method, String path, Object data) throws Exception {
      var b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api" + path));
      if (csrf != null) b.header("X-CSRF-TOKEN", csrf);
      if (method.equals("GET")) b.GET();
      else
        b.header("Content-Type", "application/json")
            .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(data)));
      return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    JsonNode ok(String method, String path, Object body) throws Exception {
      var response = call(method, path, body);
      assertEquals(200, response.statusCode(), response.body());
      return mapper.readTree(response.body());
    }

    Client login(String name) throws Exception {
      csrf = ok("GET", "/csrf", null).get("token").asText();
      user =
          ok("POST", "/auth/login", Map.of("username", name, "password", "test-passphrase-258!"));
      return this;
    }
  }

  Map<String, Object> query(String value) {
    return Map.of("query", value, "purpose", "clinical-learning", "acknowledgeLimitations", true);
  }

  @Test
  void governedSearchUsesSyntheticCorpusAndStructuredFilters() throws Exception {
    Client doctor = new Client().login("doctor");
    var response =
        doctor.ok(
            "POST",
            "/learning/cases/search",
            Map.of(
                "query",
                "pyrexia rash CRP",
                "ageMin",
                40,
                "ageMax",
                49,
                "sex",
                "male",
                "labPattern",
                "elevated-crp",
                "purpose",
                "clinical-learning",
                "acknowledgeLimitations",
                true));
    assertEquals(1, response.get("results").size());
    assertEquals("SYN-CASE-001", response.get("results").get(0).get("id").asText());
    assertTrue(response.get("results").get(0).get("score").asInt() > 0);
    assertTrue(response.get("synthetic").asBoolean());
    assertEquals(
        400, doctor.call("POST", "/learning/cases/search", Map.of("query", "fever")).statusCode());
    assertEquals(
        400,
        doctor
            .call(
                "POST",
                "/learning/cases/search",
                Map.of(
                    "purpose",
                    "clinical-learning",
                    "acknowledgeLimitations",
                    true,
                    "ageMin",
                    80,
                    "ageMax",
                    20))
            .statusCode());
    for (String role : List.of("patient", "lab", "pharmacy", "admin", "security")) {
      Client other = new Client().login(role);
      assertEquals(403, other.call("POST", "/learning/cases/search", query("fever")).statusCode());
    }
    Client anonymous = new Client();
    assertEquals(
        403, anonymous.call("POST", "/learning/cases/search", query("fever")).statusCode());
  }

  @Test
  void sourceSummariesHonorConsentAndNeverModifyOrPopulateCorpus() throws Exception {
    Client patient = new Client().login("patient"), doctor = new Client().login("doctor");
    String pid = patient.user.get("id").asText();
    var record =
        patient.ok(
            "POST",
            "/records",
            Map.of(
                "patientId",
                pid,
                "kind",
                "note",
                "title",
                "Private synthetic marker",
                "details",
                "notincorpusuniquemarker"));
    long count = db.queryForObject("select count(*) from clinical_record", Long.class);
    var own = patient.ok("GET", "/patients/" + pid + "/summary", null);
    assertFalse(own.get("aiGenerated").asBoolean());
    assertFalse(own.get("remoteModelEnabled").asBoolean());
    boolean cited = false;
    for (var s : own.get("statements")) {
      assertTrue(s.has("sourceRecordId"));
      if (s.get("sourceRecordId").asText().equals(record.get("id").asText())) cited = true;
    }
    assertTrue(cited);
    assertEquals(count, db.queryForObject("select count(*) from clinical_record", Long.class));
    assertEquals(403, doctor.call("GET", "/patients/" + pid + "/summary", null).statusCode());
    var grant =
        patient.ok(
            "POST",
            "/consents",
            Map.of(
                "patientId",
                pid,
                "granteeId",
                doctor.user.get("id").asText(),
                "purpose",
                "treatment",
                "scopes",
                List.of("note"),
                "expiresAt",
                Instant.now().plusSeconds(1200).toString()));
    var summary = doctor.ok("GET", "/patients/" + pid + "/summary", null);
    for (var s : summary.get("statements")) assertEquals("note", s.get("kind").asText());
    var cases = doctor.ok("POST", "/learning/cases/search", query("notincorpusuniquemarker"));
    assertEquals(0, cases.get("results").size());
    assertEquals(count, db.queryForObject("select count(*) from clinical_record", Long.class));
    patient.ok("POST", "/consents/" + grant.get("id").asText() + "/revoke", Map.of());
    assertEquals(403, doctor.call("GET", "/patients/" + pid + "/summary", null).statusCode());
    Client admin = new Client().login("admin");
    assertEquals(403, admin.call("GET", "/patients/" + pid + "/summary", null).statusCode());
    assertEquals(
        "notincorpusuniquemarker",
        db.queryForObject(
            "select details from clinical_record where id=?",
            String.class,
            record.get("id").asText()));
  }
}
