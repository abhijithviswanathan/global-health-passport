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
      "spring.datasource.url=jdbc:h2:mem:test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=test-passphrase-258!"
    })
class WorkflowTest {
  @LocalServerPort int port;
  @Autowired ObjectMapper mapper;
  @Autowired org.springframework.jdbc.core.JdbcTemplate db;

  class Client {
    HttpClient http =
        HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
    String csrf;
    JsonNode identity;

    HttpResponse<String> call(String method, String path, Object body) throws Exception {
      var b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api" + path));
      if (csrf != null) b.header("X-CSRF-TOKEN", csrf);
      if (method.equals("GET")) b.GET();
      else
        b.header("Content-Type", "application/json")
            .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
      return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    JsonNode get(String path) throws Exception {
      var res = call("GET", path, null);
      assertEquals(200, res.statusCode(), res.body());
      return mapper.readTree(res.body());
    }

    JsonNode post(String path, Object b) throws Exception {
      var res = call("POST", path, b);
      assertEquals(200, res.statusCode(), res.body());
      return mapper.readTree(res.body());
    }

    Client login(String name) throws Exception {
      csrf = get("/csrf").get("token").asText();
      identity = post("/auth/login", Map.of("username", name, "password", "test-passphrase-258!"));
      return this;
    }
  }

  @Test
  void completeConsentWorkflowAndSecurity() throws Exception {
    Client anon = new Client();
    assertEquals(401, anon.call("GET", "/me", null).statusCode());
    assertEquals(
        403,
        anon.call(
                "POST",
                "/auth/login",
                Map.of("username", "patient", "password", "test-passphrase-258!"))
            .statusCode());
    Client p = new Client().login("patient"),
        d = new Client().login("doctor"),
        l = new Client().login("lab"),
        f = new Client().login("pharmacy"),
        a = new Client().login("admin");
    String pid = p.identity.get("id").asText();
    assertEquals(403, d.call("GET", "/patients/" + pid + "/timeline", null).statusCode());
    assertEquals(403, a.call("GET", "/patients/" + pid + "/timeline", null).statusCode());
    d.post(
        "/access-requests",
        Map.of("healthId", p.identity.get("healthId").asText(), "purpose", "treatment"));
    long pendingRequests = 0;
    for (var request : p.get("/access-requests"))
      if (request.get("status").asText().equals("pending")) pendingRequests++;
    assertEquals(1, pendingRequests);
    var cg =
        p.post(
            "/consents",
            Map.of(
                "patientId",
                pid,
                "granteeId",
                d.identity.get("id").asText(),
                "purpose",
                "treatment",
                "expiresAt",
                Instant.now().plusSeconds(3600).toString(),
                "scopes",
                List.of(
                    "allergy",
                    "condition",
                    "medication",
                    "encounter",
                    "lab_order",
                    "lab_result",
                    "prescription",
                    "dispense",
                    "note")));
    assertTrue(d.get("/patients/" + pid + "/timeline").size() >= 5);
    var order =
        d.post(
            "/records",
            Map.of(
                "patientId",
                pid,
                "kind",
                "lab_order",
                "title",
                "CBC",
                "details",
                "Synthetic order",
                "recipientId",
                l.identity.get("id").asText()));
    var rx =
        d.post(
            "/records",
            Map.ofEntries(
                Map.entry("patientId", pid),
                Map.entry("kind", "prescription"),
                Map.entry("title", "Synthetic prescription"),
                Map.entry("details", "Demo only"),
                Map.entry("recipientId", f.identity.get("id").asText()),
                Map.entry("quantity", 30),
                Map.entry("dosage", "5 mg"),
                Map.entry("route", "oral"),
                Map.entry("frequency", "daily"),
                Map.entry("duration", "30 days")));
    p.post(
        "/consents",
        Map.of(
            "patientId",
            pid,
            "granteeId",
            l.identity.get("id").asText(),
            "purpose",
            "treatment",
            "expiresAt",
            Instant.now().plusSeconds(3600).toString(),
            "scopes",
            List.of("lab_order", "lab_result", "condition")));
    for (var record : l.get("/patients/" + pid + "/timeline"))
      assertTrue(Set.of("lab_order", "lab_result").contains(record.get("kind").asText()));
    assertEquals(
        403,
        l.call(
                "POST",
                "/records",
                Map.of(
                    "patientId", pid, "kind", "condition", "title", "Denied", "details", "Denied"))
            .statusCode());
    l.post(
        "/records",
        Map.of(
            "patientId",
            pid,
            "kind",
            "lab_result",
            "title",
            "CBC result",
            "details",
            "Synthetic values",
            "relatedId",
            order.get("id").asText()));
    p.post(
        "/consents",
        Map.of(
            "patientId",
            pid,
            "granteeId",
            f.identity.get("id").asText(),
            "purpose",
            "treatment",
            "expiresAt",
            Instant.now().plusSeconds(3600).toString(),
            "scopes",
            List.of("prescription", "dispense", "allergy")));
    f.post(
        "/records",
        Map.of(
            "patientId",
            pid,
            "kind",
            "dispense",
            "title",
            "Demo dispense",
            "details",
            "Synthetic event",
            "relatedId",
            rx.get("id").asText(),
            "quantity",
            30,
            "idempotencyKey",
            "workflow-fill-1"));
    var repeat =
        f.post(
            "/records",
            Map.of(
                "patientId",
                pid,
                "kind",
                "dispense",
                "title",
                "Demo dispense",
                "details",
                "Synthetic event",
                "relatedId",
                rx.get("id").asText(),
                "quantity",
                30,
                "idempotencyKey",
                "workflow-fill-1"));
    assertEquals(
        409,
        f.call(
                "POST",
                "/records",
                Map.of(
                    "patientId",
                    pid,
                    "kind",
                    "dispense",
                    "title",
                    "Duplicate denied",
                    "details",
                    "Synthetic event",
                    "relatedId",
                    rx.get("id").asText(),
                    "quantity",
                    30,
                    "idempotencyKey",
                    "workflow-fill-2"))
            .statusCode());
    assertEquals(
        409,
        f.call(
                "POST",
                "/records",
                Map.of(
                    "patientId",
                    pid,
                    "kind",
                    "dispense",
                    "title",
                    "Changed denied",
                    "details",
                    "Synthetic event",
                    "relatedId",
                    rx.get("id").asText(),
                    "quantity",
                    31,
                    "idempotencyKey",
                    "workflow-fill-1"))
            .statusCode());
    var concurrentRx =
        d.post(
            "/records",
            Map.ofEntries(
                Map.entry("patientId", pid),
                Map.entry("kind", "prescription"),
                Map.entry("title", "Concurrency test prescription"),
                Map.entry("details", "Synthetic only"),
                Map.entry("recipientId", f.identity.get("id").asText()),
                Map.entry("quantity", 10),
                Map.entry("dosage", "1 mg"),
                Map.entry("route", "oral"),
                Map.entry("frequency", "daily"),
                Map.entry("duration", "10 days")));
    try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
      var futures = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
      for (int i = 0; i < 2; i++) {
        String key = "parallel-" + i;
        futures.add(
            pool.submit(
                () ->
                    f.call(
                            "POST",
                            "/records",
                            Map.of(
                                "patientId",
                                pid,
                                "kind",
                                "dispense",
                                "title",
                                "Parallel fill",
                                "details",
                                "Synthetic only",
                                "relatedId",
                                concurrentRx.get("id").asText(),
                                "quantity",
                                10,
                                "idempotencyKey",
                                key))
                        .statusCode()));
      }
      var statuses = List.of(futures.get(0).get(), futures.get(1).get());
      assertEquals(1, statuses.stream().filter(x -> x == 200).count());
      assertEquals(1, statuses.stream().filter(x -> x == 409).count());
    }
    assertEquals(403, d.call("GET", "/patients/" + pid + "/export", null).statusCode());
    assertEquals("Bundle", p.get("/patients/" + pid + "/fhir").get("resourceType").asText());
    p.post("/consents/" + cg.get("id").asText() + "/revoke", Map.of());
    assertEquals(403, d.call("GET", "/patients/" + pid + "/timeline", null).statusCode());
    assertEquals(
        403,
        d.call(
                "POST",
                "/records",
                Map.of("patientId", pid, "kind", "note", "title", "Denied", "details", "Denied"))
            .statusCode());
    assertEquals(403, d.call("POST", "/break-glass", Map.of()).statusCode());
    assertTrue(p.get("/audit").size() > 5);
    p.post("/auth/logout", Map.of());
    assertEquals(401, p.call("GET", "/me", null).statusCode());
  }

  @Test
  void csrfExpiryAndOpaqueIdentifiers() throws Exception {
    Client p = new Client().login("patient"), d = new Client().login("doctor");
    String pid = p.identity.get("id").asText();
    assertFalse(p.identity.has("internal_pk"));
    assertFalse(p.identity.has("password_hash"));
    assertNotEquals(pid, p.identity.get("healthId").asText());
    assertEquals(
        400,
        p.call(
                "POST",
                "/consents",
                Map.of(
                    "patientId",
                    pid,
                    "granteeId",
                    d.identity.get("id").asText(),
                    "purpose",
                    "treatment",
                    "expiresAt",
                    Instant.now().minusSeconds(1).toString(),
                    "scopes",
                    List.of("note")))
            .statusCode());
    assertEquals(
        403,
        p.call(
                "POST",
                "/consents",
                Map.of(
                    "patientId",
                    d.identity.get("id").asText(),
                    "granteeId",
                    d.identity.get("id").asText(),
                    "purpose",
                    "treatment",
                    "expiresAt",
                    Instant.now().plusSeconds(3600).toString(),
                    "scopes",
                    List.of("note")))
            .statusCode());
    String old = p.csrf;
    p.csrf = "forged";
    assertEquals(
        403,
        p.call(
                "POST",
                "/records",
                Map.of("patientId", pid, "kind", "note", "title", "Denied", "details", "Denied"))
            .statusCode());
    p.csrf = old;
    assertEquals(
        "no-store", p.call("GET", "/me", null).headers().firstValue("cache-control").orElse(""));
  }

  @Test
  void amendmentPreservesOriginalAndEnforcesAuthor() throws Exception {
    Client p = new Client().login("patient");
    String pid = p.identity.get("id").asText();
    var first =
        p.post(
            "/records",
            Map.of(
                "patientId",
                pid,
                "kind",
                "note",
                "title",
                "Initial note",
                "details",
                "Original text"));
    var next =
        p.post(
            "/records",
            Map.of(
                "patientId",
                pid,
                "kind",
                "note",
                "title",
                "Corrected note",
                "details",
                "Correction",
                "correctionReason",
                "Correcting the original patient report",
                "replacesId",
                first.get("id").asText()));
    assertEquals(first.get("id"), next.get("replaces_id"));
    boolean original = false;
    for (var record : p.get("/patients/" + pid + "/timeline")) {
      assertFalse(record.has("internal_pk"));
      if (record.get("id").equals(first.get("id"))) {
        assertEquals("amended", record.get("status").asText());
        assertEquals("Original text", record.get("details").asText());
        original = true;
      }
    }
    assertTrue(original);
    assertEquals(
        403,
        p.call(
                "POST",
                "/records",
                Map.of(
                    "patientId",
                    pid,
                    "kind",
                    "note",
                    "title",
                    "Stale correction",
                    "details",
                    "No",
                    "correctionReason",
                    "Correcting the original patient report",
                    "replacesId",
                    first.get("id").asText()))
            .statusCode());
  }

  @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

  @Test
  void auditHashesMatchCanonicalEvents() throws Exception {
    new Client().login("security");
    String previous = "0".repeat(64);
    for (var row : jdbc.queryForList("select * from audit_event order by seq")) {
      assertEquals(previous, row.get("previous_hash"));
      String encoded =
          mapper.writeValueAsString(
              Arrays.asList(
                  row.get("id"),
                  row.get("actor_id"),
                  row.get("patient_id"),
                  row.get("action"),
                  row.get("resource_id"),
                  row.get("occurred_at"),
                  row.get("previous_hash")));
      previous =
          java.util.HexFormat.of()
              .formatHex(
                  java.security.MessageDigest.getInstance("SHA-256")
                      .digest(encoded.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
      assertEquals(previous, row.get("event_hash"));
    }
  }

  @Autowired PassportApi api;

  @Test
  void liveStaffPasswordAuthenticationFailsClosedWithoutMfa() throws Exception {
    boolean oldDemo = api.demo;
    String oldProfiles = api.activeProfiles;
    try {
      api.demo = false;
      Client c = new Client();
      c.csrf = c.get("/csrf").get("token").asText();
      assertEquals(
          403,
          c.call(
                  "POST",
                  "/auth/login",
                  Map.of("username", "doctor", "password", "test-passphrase-258!"))
              .statusCode());
      api.demo = true;
      api.activeProfiles = "production";
      assertThrows(IllegalStateException.class, api::verifyLaunchMode);
    } finally {
      api.demo = oldDemo;
      api.activeProfiles = oldProfiles;
    }
  }

  @Test
  void patientCanDenyPendingRequestOnlyOnce() throws Exception {
    Client p = new Client().login("patient"), d = new Client().login("doctor");
    d.post(
        "/access-requests",
        Map.of("healthId", p.identity.get("healthId").asText(), "purpose", "treatment"));
    String request = null;
    for (var row : p.get("/access-requests")) {
      if (row.get("status").asText().equals("pending")
          && row.get("requester_id").asText().equals(d.identity.get("id").asText())) {
        request = row.get("id").asText();
        break;
      }
    }
    assertNotNull(request);
    assertEquals(
        404, d.call("POST", "/access-requests/" + request + "/deny", Map.of()).statusCode());
    p.post("/access-requests/" + request + "/deny", Map.of());
    assertEquals(
        404, p.call("POST", "/access-requests/" + request + "/deny", Map.of()).statusCode());
  }

  @Test
  void compactAndHistoricalIdsResolveWithoutGrantingClinicalAccess() throws Exception {
    Client p = new Client().login("patient"), doctor = new Client().login("doctor");
    String pid = p.identity.get("id").asText();
    String compact = p.identity.get("healthId").asText();
    assertTrue(HealthIds.isCompact(compact));
    String legacy = "HP-" + UUID.randomUUID().toString().replace("-", "").toUpperCase();
    db.update(
        "insert into health_id_alias(alias,user_id) values(?,?)", HealthIds.normalize(legacy), pid);
    String grantsBefore = p.get("/consents").toString();
    int before = p.get("/access-requests").size();
    doctor.post(
        "/access-requests",
        Map.of(
            "healthId",
            " "
                + compact.substring(0, 3).toLowerCase()
                + "-"
                + compact.substring(3).toLowerCase()
                + " ",
            "purpose",
            "treatment"));
    doctor.post(
        "/access-requests", Map.of("healthId", legacy.toLowerCase(), "purpose", "treatment"));
    assertEquals(before + 2, p.get("/access-requests").size());
    assertEquals(grantsBefore, p.get("/consents").toString());
    assertEquals(compact, p.get("/me").get("healthId").asText());
    var unknown =
        doctor.post("/access-requests", Map.of("healthId", "NOTANID", "purpose", "treatment"));
    assertTrue(unknown.has("message"));
    assertEquals(before + 2, p.get("/access-requests").size());
  }
}
