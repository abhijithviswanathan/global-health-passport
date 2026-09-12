package org.healthpassport;

import static org.healthpassport.PassportApi.*;
import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=jdbc:h2:mem:clinician;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=clinician-test-password!"
    })
class ClinicianTest {
  @LocalServerPort int port;
  @Autowired ObjectMapper json;
  @Autowired PassportApi api;

  class Client {
    final HttpClient http =
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
            .method(method, HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
      return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    JsonNode ok(String method, String path, Object body) throws Exception {
      var r = call(method, path, body);
      assertEquals(200, r.statusCode(), r.body());
      return json.readTree(r.body());
    }

    Client login(String name) throws Exception {
      me =
          ok(
              "POST",
              "/auth/login",
              Map.of("username", name, "password", "clinician-test-password!"));
      return this;
    }
  }

  Client patient() throws Exception {
    var c = new Client();
    String n = "visit" + UUID.randomUUID().toString().replace("-", "");
    c.ok(
        "POST",
        "/auth/register",
        Map.of(
            "username",
            n,
            "displayName",
            "Visit test patient",
            "password",
            "clinician-test-password!"));
    return c.login(n);
  }

  JsonNode grant(Client p, Client d, List<String> scopes) throws Exception {
    return p.ok(
        "POST",
        "/consents",
        Map.of(
            "patientId",
            p.me.get("id").asText(),
            "granteeId",
            d.me.get("id").asText(),
            "purpose",
            "treatment",
            "expiresAt",
            Instant.now().plusSeconds(3600).toString(),
            "scopes",
            scopes));
  }

  Map<String, Object> booking(Client p, long start) {
    return Map.of(
        "patientId",
        p.me.get("id").asText(),
        "startsAt",
        Instant.ofEpochMilli(start).toString(),
        "duration",
        30,
        "reason",
        "Synthetic follow-up",
        "mode",
        "in_person",
        "requestKey",
        UUID.randomUUID().toString());
  }

  long start(int day) {
    return Instant.now().plusSeconds(day * 86400L).toEpochMilli();
  }

  String range(long start) {
    return "/clinician/appointments?from="
        + Instant.ofEpochMilli(start - 3600000)
        + "&to="
        + Instant.ofEpochMilli(start + 86400000);
  }

  @Test
  void bookingsAreOwnedPermissionCheckedAndConflictSafe() throws Exception {
    var d = new Client().login("doctor");
    var p = patient();
    long start = start(5);
    var b = booking(p, start);
    assertEquals(403, d.call("POST", "/clinician/appointments", b).statusCode());
    var c = grant(p, d, List.of("encounter", "allergy"));
    var a = d.ok("POST", "/clinician/appointments", b);
    String aid = a.get("id").asText();
    assertEquals(aid, d.ok("POST", "/clinician/appointments", b).get("id").asText());
    assertEquals(
        409, d.call("POST", "/clinician/appointments", booking(p, start + 5 * 60000)).statusCode());
    assertEquals(403, p.call("GET", range(start), null).statusCode());
    assertEquals(403, new Client().login("admin").call("GET", range(start), null).statusCode());
    var anon = new Client();
    anon.csrf = null;
    assertEquals(403, anon.call("POST", "/clinician/appointments", b).statusCode());
    p.ok("POST", "/consents/" + c.get("id").asText() + "/revoke", Map.of());
    var redacted = d.ok("GET", range(start), null).get(0);
    assertFalse(redacted.get("access").asBoolean());
    assertTrue(redacted.get("patient_id").isNull());
    assertEquals("", redacted.get("reason").asText());
    assertEquals(
        403, d.call("GET", "/clinician/appointments/" + aid + "/draft", null).statusCode());
    d.ok("PATCH", "/clinician/appointments/" + aid, Map.of("status", "cancelled", "version", 0));
  }

  @Test
  void reschedulingRejectsStaleVersionsAndReleasesCancelledSlots() throws Exception {
    var d = new Client().login("doctor");
    var p = patient();
    grant(p, d, List.of("encounter"));
    long at = start(10);
    var a = d.ok("POST", "/clinician/appointments", booking(p, at));
    String path = "/clinician/appointments/" + a.get("id").asText();
    d.ok(
        "PATCH",
        path,
        Map.of(
            "version",
            0,
            "status",
            "scheduled",
            "startsAt",
            Instant.ofEpochMilli(at + 3600000).toString(),
            "duration",
            45));
    assertEquals(
        409, d.call("PATCH", path, Map.of("version", 0, "status", "cancelled")).statusCode());
    assertEquals(
        409, d.call("POST", "/clinician/appointments", booking(p, at + 3900000)).statusCode());
    d.ok("PATCH", path, Map.of("version", 1, "status", "cancelled"));
    d.ok("POST", "/clinician/appointments", booking(p, at + 3900000));
    assertEquals(
        400, d.call("POST", "/clinician/appointments", booking(p, start(-1))).statusCode());
  }

  @Test
  void draftPersistsAndCompletionIsAtomicAndIdempotent() throws Exception {
    var d = new Client().login("doctor");
    var p = patient();
    grant(p, d, List.of("encounter"));
    var a = d.ok("POST", "/clinician/appointments", booking(p, start(15)));
    String path = "/clinician/appointments/" + a.get("id").asText();
    var note =
        Map.of(
            "version",
            0,
            "subjective",
            "Synthetic concern",
            "objective",
            "",
            "assessment",
            "Synthetic assessment",
            "plan",
            "Synthetic follow-up plan");
    var saved = d.ok("PUT", path + "/draft", note);
    assertEquals(1, saved.get("version").asInt());
    assertEquals(
        "Synthetic assessment",
        new Client().login("doctor").ok("GET", path + "/draft", null).get("assessment").asText());
    assertEquals(409, d.call("PUT", path + "/draft", note).statusCode());
    d.ok("PATCH", path, Map.of("version", 0, "status", "in_progress"));
    assertEquals(
        400,
        d.call(
                "POST",
                path + "/complete",
                Map.of("version", 1, "draftVersion", 1, "reviewed", false))
            .statusCode());
    var complete = Map.of("version", 1, "draftVersion", 1, "reviewed", true);
    var result = d.ok("POST", path + "/complete", complete);
    assertEquals("completed", result.get("status").asText());
    assertEquals(
        result.get("completed_record_id"),
        d.ok("POST", path + "/complete", complete).get("completed_record_id"));
    assertEquals(
        1,
        api.db.queryForObject(
            "select count(*) from clinical_record where patient_id=? and kind='encounter'",
            Integer.class,
            p.me.get("id").asText()));
    assertEquals(
        409,
        d.call(
                "PUT",
                path + "/draft",
                Map.of(
                    "version",
                    1,
                    "subjective",
                    "change",
                    "objective",
                    "",
                    "assessment",
                    "change",
                    "plan",
                    "change"))
            .statusCode());
  }

  @Test
  void draftRequiresEncounterPermissionAndCannotCrossDoctorBoundary() throws Exception {
    var d = new Client().login("doctor");
    var p = patient();
    grant(p, d, List.of("allergy"));
    var a = d.ok("POST", "/clinician/appointments", booking(p, start(20)));
    assertFalse(a.get("can_document").asBoolean());
    String path = "/clinician/appointments/" + a.get("id").asText();
    assertEquals(403, d.call("GET", path + "/draft", null).statusCode());
    String other = id();
    api.db.update(
        "insert into app_user(id,username,display_name,role,password_hash,organization)"
            + " values(?,?,?,?,?,?)",
        other,
        "second-doctor",
        "Second doctor",
        "doctor",
        api.passwords.encode("clinician-test-password!"),
        "Northstar Demo Network");
    api.db.update(
        "insert into"
            + " practitioner_verification(user_id,status,reviewer_id,evidence_reference,verified_at)"
            + " values(?,?,?,?,?)",
        other,
        "synthetic_verified",
        other,
        "synthetic-test",
        now());
    api.tenants.bootstrap(true);
    var second = new Client().login("second-doctor");
    grant(p, second, List.of("encounter"));
    assertEquals(404, second.call("GET", path + "/draft", null).statusCode());
    assertEquals(
        404, second.call("PATCH", path, Map.of("version", 0, "status", "cancelled")).statusCode());
  }

  @Test
  void simultaneousBookingsCannotDoubleBook() throws Exception {
    var d = new Client().login("doctor");
    var d2 = new Client().login("doctor");
    var p = patient();
    grant(p, d, List.of("encounter"));
    long at = start(25);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var gate = new CountDownLatch(1);
      var one =
          pool.submit(
              () -> {
                gate.await();
                return d.call("POST", "/clinician/appointments", booking(p, at)).statusCode();
              });
      var two =
          pool.submit(
              () -> {
                gate.await();
                return d2.call("POST", "/clinician/appointments", booking(p, at)).statusCode();
              });
      gate.countDown();
      assertEquals(Set.of(200, 409), Set.of(one.get(), two.get()));
    }
  }
}
