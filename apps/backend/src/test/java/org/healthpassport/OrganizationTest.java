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

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=jdbc:h2:mem:orgtest;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=organization-test-password!"
    })
class OrganizationTest {
  @LocalServerPort int port;
  @Autowired ObjectMapper json;
  @Autowired PassportApi api;

  class Client {
    HttpClient http =
        HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
    String csrf;
    JsonNode me;

    Client() throws Exception {
      csrf = json.readTree(call("GET", "/csrf", null).body()).get("token").asText();
    }

    HttpResponse<String> call(String method, String path, Object body) throws Exception {
      var b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api" + path));
      if (csrf != null) b.header("X-CSRF-TOKEN", csrf);
      if (method.equals("GET")) b.GET();
      else
        b.header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
      return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    JsonNode post(String path, Object b) throws Exception {
      var res = call("POST", path, b);
      assertEquals(200, res.statusCode(), res.body());
      return json.readTree(res.body());
    }

    Client login(String name) throws Exception {
      me = post("/auth/login", Map.of("username", name, "password", "organization-test-password!"));
      return this;
    }
  }

  @Test
  void suspensionRevokesSessionsAndGrantsAndCannotRestoreThem() throws Exception {
    Client p = new Client().login("patient"),
        d = new Client().login("doctor"),
        a = new Client().login("admin");
    String patient = p.me.get("id").asText(), doctor = d.me.get("id").asText();
    p.post(
        "/consents",
        Map.of(
            "patientId",
            patient,
            "granteeId",
            doctor,
            "purpose",
            "treatment",
            "scopes",
            List.of("condition"),
            "expiresAt",
            Instant.now().plusSeconds(3600).toString()));
    assertEquals(200, d.call("GET", "/patients/" + patient + "/timeline", null).statusCode());
    var members = json.readTree(a.call("GET", "/organization/members", null).body());
    assertEquals(5, members.size());
    for (var member : members) {
      assertFalse(member.has("password_hash"));
      assertFalse(member.has("healthId"));
      assertFalse(member.has("patient_id"));
    }
    a.post(
        "/organization/members/" + doctor + "/verification",
        Map.of("status", "suspended", "evidenceReference", "ADMIN-REVIEW-TEST-1"));
    assertEquals(401, d.call("GET", "/patients/" + patient + "/timeline", null).statusCode());
    Client denied = new Client();
    assertEquals(
        403,
        denied
            .call(
                "POST",
                "/auth/login",
                Map.of("username", "doctor", "password", "organization-test-password!"))
            .statusCode());
    assertEquals(
        0,
        api.db.queryForObject(
            "select count(*) from consent where grantee_id=? and status='active'",
            Integer.class,
            doctor));
    a.post(
        "/organization/members/" + doctor + "/verification",
        Map.of("status", "verified", "evidenceReference", "EXTERNAL-ONBOARDING-TEST-2"));
    assertEquals(401, d.call("GET", "/me", null).statusCode());
    Client resumed = new Client().login("doctor");
    assertEquals(403, resumed.call("GET", "/patients/" + patient + "/timeline", null).statusCode());
    assertEquals(
        1,
        api.db.queryForObject(
            "select count(*) from audit_event where actor_id=? and action='PRACTITIONER_SUSPENDED'"
                + " and patient_id is null",
            Integer.class,
            a.me.get("id").asText()));
  }

  @Test
  void administratorCannotCrossOrganizationOrElevateSelf() throws Exception {
    Client a = new Client().login("admin"), p = new Client().login("patient");
    String target = UUID.randomUUID().toString();
    api.db.update(
        "insert into app_user(id,username,display_name,role,password_hash,organization)"
            + " values(?,?,?,?,?,?)",
        target,
        "external-org-practitioner",
        "External Synthetic Practitioner",
        "doctor",
        api.passwords.encode("organization-test-password!"),
        "Other Organization");
    assertEquals(
        404,
        a.call(
                "POST",
                "/organization/members/" + target + "/verification",
                Map.of("status", "verified", "evidenceReference", "TEST-CROSS-ORG"))
            .statusCode());
    assertEquals(
        404,
        a.call(
                "POST",
                "/organization/members/" + a.me.get("id").asText() + "/verification",
                Map.of("status", "verified", "evidenceReference", "TEST-SELF"))
            .statusCode());
    assertEquals(403, p.call("GET", "/organization/members", null).statusCode());
    Client unknown = new Client();
    assertEquals(
        403,
        unknown
            .call(
                "POST",
                "/auth/login",
                Map.of(
                    "username",
                    "external-org-practitioner",
                    "password",
                    "organization-test-password!"))
            .statusCode());
    assertEquals(
        0,
        api.db.queryForObject(
            "select count(*) from practitioner_verification where user_id=?",
            Integer.class,
            target));
    assertEquals(
        403,
        a.call("GET", "/patients/" + p.me.get("id").asText() + "/timeline", null).statusCode());
  }
}
