package org.healthpassport;

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
      "spring.datasource.url=jdbc:h2:mem:care;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=care-workflow-password!"
    })
class CareWorkflowTest {
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

    JsonNode ok(String m, String p, Object body) throws Exception {
      var r = call(m, p, body);
      assertEquals(200, r.statusCode(), r.body());
      return json.readTree(r.body());
    }

    Client login(String name) throws Exception {
      me =
          ok(
              "POST",
              "/auth/login",
              Map.of("username", name, "password", "care-workflow-password!"));
      return this;
    }
  }

  @BeforeEach
  void resetRateLimit() {
    api.identity.attempts.clear();
  }

  String uid(Client c) {
    return c.me.get("id").asText();
  }

  Client patient() throws Exception {
    var c = new Client();
    String n = "care" + UUID.randomUUID().toString().replace("-", "");
    c.ok(
        "POST",
        "/auth/register",
        Map.of(
            "username",
            n,
            "displayName",
            "Care workflow synthetic patient",
            "password",
            "care-workflow-password!"));
    c.login(n);
    api.db.update("update app_user set organization='Northstar Demo Network' where id=?", uid(c));
    return c;
  }

  void assign(Client p, Client staff, List<String> scopes) throws Exception {
    var a = new Client().login("admin");
    a.ok(
        "POST",
        "/care/assignments",
        Map.of(
            "healthId",
            p.me.get("healthId").asText(),
            "staffId",
            uid(staff),
            "scopes",
            scopes,
            "expiresAt",
            Instant.now().plusSeconds(86400).toString()));
    if (!Set.of("reception", "coordinator", "admin").contains(staff.me.get("role").asText()))
      p.ok(
          "POST",
          "/consents",
          Map.of(
              "patientId",
              uid(p),
              "granteeId",
              uid(staff),
              "purpose",
              "treatment",
              "expiresAt",
              Instant.now().plusSeconds(86400).toString(),
              "scopes",
              scopes.stream().filter(x -> !x.equals("registration")).toList()));
  }

  Map<String, Object> rec(Client p, String kind) {
    return new LinkedHashMap<>(
        Map.of(
            "patientId",
            uid(p),
            "kind",
            kind,
            "title",
            "Synthetic " + kind,
            "details",
            "Synthetic observation; not clinical advice",
            "idempotencyKey",
            UUID.randomUUID().toString(),
            "sourceType",
            "nurse_observation",
            "source",
            "Direct intake observation",
            "observedAt",
            Instant.now().minusSeconds(12 * 86400).toString(),
            "observedTimezone",
            "Etc/UTC"));
  }

  @Test
  void nurseMeasurementIsDatedAttributedAndCarriedWithoutNewMeasurement() throws Exception {
    var p = patient();
    var n = new Client().login("nurse");
    var d = new Client().login("doctor");
    assign(p, n, List.of("vital"));
    assign(p, d, List.of("vital"));
    var b = rec(p, "vital");
    var first = n.ok("POST", "/care/records", b);
    assertEquals(first.get("id"), n.ok("POST", "/care/records", b).get("id"));
    assertEquals("nurse", first.get("author_role").asText());
    assertEquals("Historical data", first.get("freshness_label").asText());
    var timeline = d.ok("GET", "/care/patients/" + uid(p) + "/timeline", null);
    assertEquals(first.get("observed_at"), timeline.get(0).get("observed_at"));
    assertNotEquals(first.get("observed_at"), first.get("created_at"));
    var carried = rec(p, "vital");
    carried.put("originalRecordId", first.get("id").asText());
    carried.put("observedAt", Instant.now().toString());
    var copy = d.ok("POST", "/care/records", carried);
    assertEquals(first.get("observed_at"), copy.get("observed_at"));
    assertEquals(first.get("source_type"), copy.get("source_type"));
    assertEquals("Carried forward", copy.get("freshness_label").asText());
    var confirmed =
        d.ok(
            "POST",
            "/care/records/" + copy.get("id").asText() + "/confirm",
            Map.of(
                "version",
                0,
                "comment",
                "Patient confirmed history; measurement was not repeated"));
    assertEquals(copy.get("observed_at"), confirmed.get("observed_at"));
    assertEquals(1, confirmed.get("confirmations").size());
  }

  @Test
  void assignmentAndConsentAndOrganizationAreIndependentlyRequired() throws Exception {
    var p = patient();
    var n = new Client().login("nurse");
    assertEquals(403, n.call("POST", "/care/records", rec(p, "vital")).statusCode());
    var a = new Client().login("admin");
    a.ok(
        "POST",
        "/care/assignments",
        Map.of(
            "patientId",
            uid(p),
            "staffId",
            uid(n),
            "scopes",
            List.of("vital"),
            "expiresAt",
            Instant.now().plusSeconds(86400).toString()));
    assertEquals(403, n.call("POST", "/care/records", rec(p, "vital")).statusCode());
    assertEquals(403, n.call("POST", "/records", rec(p, "vital")).statusCode());
    var foreign = patient();
    assertEquals(
        403,
        a.call(
                "POST",
                "/care/assignments",
                Map.of(
                    "patientId",
                    uid(foreign),
                    "staffId",
                    uid(foreign),
                    "scopes",
                    List.of("vital"),
                    "expiresAt",
                    Instant.now().plusSeconds(86400).toString()))
            .statusCode());
  }

  @Test
  void receptionCanScheduleButCannotReadClinicalData() throws Exception {
    var p = patient();
    var r = new Client().login("reception");
    var d = new Client().login("doctor");
    assign(p, r, List.of("registration"));
    assign(p, d, List.of("registration", "encounter", "note"));
    d.ok("POST", "/care/records", rec(p, "note"));
    var booked =
        r.ok(
            "POST",
            "/care/appointments",
            Map.of(
                "patientId",
                uid(p),
                "doctorId",
                uid(d),
                "startsAt",
                Instant.now().plusSeconds(7 * 86400).toString(),
                "duration",
                30,
                "mode",
                "in_person",
                "requestKey",
                UUID.randomUUID().toString()));
    String aid = booked.get("id").asText();
    r.ok(
        "PATCH",
        "/care/appointments/" + aid + "/stage",
        Map.of("version", 0, "stage", "checked_in"));
    assertEquals(0, r.ok("GET", "/care/patients/" + uid(p) + "/timeline", null).size());
    assertEquals(403, r.call("GET", "/patients/" + uid(p) + "/timeline", null).statusCode());
    assertEquals(403, r.call("POST", "/care/records", rec(p, "note")).statusCode());
    for (var a : r.ok("GET", "/care/appointments", null)) assertFalse(a.has("reason"));
  }

  @Test
  void taskAcknowledgmentCompletionAndMessagesStayDistinct() throws Exception {
    var p = patient();
    var n = new Client().login("nurse");
    var d = new Client().login("doctor");
    assign(p, n, List.of("nursing_observation"));
    assign(p, d, List.of("nursing_observation"));
    String tid =
        d.ok(
                "POST",
                "/care/tasks",
                Map.of(
                    "patientId",
                    uid(p),
                    "scope",
                    "nursing_observation",
                    "assigneeId",
                    uid(n),
                    "title",
                    "Repeat intake",
                    "details",
                    "Synthetic care task",
                    "priority",
                    "routine",
                    "dueAt",
                    Instant.now().minusSeconds(60).toString(),
                    "requestKey",
                    UUID.randomUUID().toString()))
            .get("id")
            .asText();
    n.ok(
        "POST",
        "/care/messages",
        Map.of(
            "taskId",
            tid,
            "body",
            "Message sent, task not yet accepted",
            "requestKey",
            UUID.randomUUID().toString()));
    assertEquals(
        "open", d.ok("GET", "/care/tasks/" + tid, null).get("task").get("status").asText());
    assertEquals(
        403,
        d.call(
                "PATCH",
                "/care/tasks/" + tid,
                Map.of("version", 0, "status", "accepted", "comment", "Wrong person"))
            .statusCode());
    for (int i = 0; i < 3; i++)
      n.ok(
          "PATCH",
          "/care/tasks/" + tid,
          Map.of(
              "version",
              i,
              "status",
              List.of("accepted", "in_progress", "completed").get(i),
              "comment",
              "Stage recorded"));
    var result = d.ok("GET", "/care/tasks/" + tid, null);
    assertEquals("completed", result.get("task").get("status").asText());
    assertEquals(4, result.get("history").size());
    assertEquals(
        409,
        n.call(
                "PATCH",
                "/care/tasks/" + tid,
                Map.of("version", 0, "status", "accepted", "comment", "Stale"))
            .statusCode());
  }

  @Test
  void labOrderResultAndReviewAreLinkedAndScoped() throws Exception {
    var p = patient();
    var d = new Client().login("doctor");
    var l = new Client().login("lab");
    assign(p, d, List.of("lab_order", "lab_result"));
    assign(p, l, List.of("lab_order", "lab_result"));
    var order = rec(p, "lab_order");
    order.put("recipientId", uid(l));
    String rid = d.ok("POST", "/care/records", order).get("id").asText();
    assertTrue(l.ok("GET", "/care/services", null).toString().contains(rid));
    for (int i = 0; i < 3; i++)
      l.ok(
          "PATCH",
          "/care/services/" + rid,
          Map.of(
              "version",
              i,
              "status",
              List.of("accepted", "specimen_collected", "processing").get(i)));
    assertEquals(
        409,
        l.call("PATCH", "/care/services/" + rid, Map.of("version", 3, "status", "result_posted"))
            .statusCode());
    var result = rec(p, "lab_result");
    result.put("relatedId", rid);
    result.put("sourceType", "laboratory");
    String resultId = l.ok("POST", "/care/records", result).get("id").asText();
    l.ok("PATCH", "/care/services/" + rid, Map.of("version", 3, "status", "result_posted"));
    d.ok(
        "POST",
        "/care/results/" + resultId + "/review",
        Map.of("comment", "Reviewed synthetic result"));
    assertTrue(d.ok("GET", "/care/services", null).toString().contains("reviewed_at"));
    assertEquals(
        403,
        l.call("POST", "/care/results/" + resultId + "/review", Map.of("comment", "Wrong role"))
            .statusCode());
  }

  @Test
  void conversationMembershipDoesNotBypassRevokedConsent() throws Exception {
    var p = patient();
    var d = new Client().login("doctor");
    var n = new Client().login("nurse");
    assign(p, d, List.of("note"));
    assign(p, n, List.of("note"));
    String cid =
        d.ok(
                "POST",
                "/care/conversations",
                Map.of(
                    "patientId",
                    uid(p),
                    "scope",
                    "note",
                    "kind",
                    "patient",
                    "title",
                    "Care discussion",
                    "members",
                    List.of(uid(n)),
                    "requestKey",
                    UUID.randomUUID().toString()))
            .get("id")
            .asText();
    String mid =
        d.ok(
                "POST",
                "/care/messages",
                Map.of(
                    "conversationId",
                    cid,
                    "body",
                    "Synthetic decision",
                    "mentions",
                    List.of(uid(n)),
                    "requestKey",
                    UUID.randomUUID().toString()))
            .get("id")
            .asText();
    assertTrue(n.ok("GET", "/care/conversations", null).toString().contains("\"unread\":1"));
    n.ok("POST", "/care/conversations/" + cid + "/read", Map.of("lastMessageId", mid));
    d.ok(
        "POST",
        "/care/messages/" + mid + "/record",
        Map.of(
            "title",
            "Reviewed decision",
            "details",
            "Decision approved after review",
            "reviewed",
            true));
    api.db.update(
        "update consent set status='revoked' where patient_id=? and grantee_id=?", uid(p), uid(n));
    assertEquals(403, n.call("GET", "/care/conversations/" + cid, null).statusCode());
    assertEquals(
        403,
        n.call(
                "POST",
                "/care/messages",
                Map.of(
                    "conversationId",
                    cid,
                    "body",
                    "Should not send",
                    "requestKey",
                    UUID.randomUUID().toString()))
            .statusCode());
  }

  @Test
  void concurrentDraftEditsAndAmendmentsPreserveVersions() throws Exception {
    var p = patient();
    var d = new Client().login("doctor");
    assign(p, d, List.of("note"));
    var b = rec(p, "note");
    b.put("noteState", "draft");
    String rid = d.ok("POST", "/care/records", b).get("id").asText();
    var pool = Executors.newFixedThreadPool(2);
    try {
      var one =
          pool.submit(
              () ->
                  d.call(
                          "PATCH",
                          "/care/records/" + rid + "/draft",
                          Map.of("version", 0, "details", "First competing edit"))
                      .statusCode());
      var two =
          pool.submit(
              () ->
                  d.call(
                          "PATCH",
                          "/care/records/" + rid + "/draft",
                          Map.of("version", 0, "details", "Second competing edit"))
                      .statusCode());
      assertEquals(Set.of(200, 409), Set.of(one.get(), two.get()));
    } finally {
      pool.shutdown();
    }
    d.ok(
        "PATCH",
        "/care/records/" + rid + "/draft",
        Map.of(
            "version", 1, "details", "Reviewed signed note", "finalize", true, "reviewed", true));
    assertEquals(
        403,
        d.call(
                "PATCH",
                "/care/records/" + rid + "/draft",
                Map.of("version", 2, "details", "Silent overwrite"))
            .statusCode());
    var correction = rec(p, "note");
    correction.put("replacesId", rid);
    assertEquals(400, d.call("POST", "/care/records", correction).statusCode());
    correction.put("correctionReason", "Correcting transcription after source review");
    d.ok("POST", "/care/records", correction);
    var history = d.ok("GET", "/care/records/" + rid + "/history", null);
    assertEquals(4, history.get("revisions").size());
    assertTrue(history.toString().contains("Reviewed signed note"));
    assertEquals(405, d.call("DELETE", "/care/records/" + rid + "/history", Map.of()).statusCode());
  }

  @Test
  void completeEncounterFlowsFromReceptionThroughDischarge() throws Exception {
    var p = patient();
    var d = new Client().login("doctor");
    var n = new Client().login("nurse");
    var r = new Client().login("reception");
    assign(p, d, List.of("registration", "vital", "encounter", "follow_up", "discharge"));
    assign(p, n, List.of("registration", "vital"));
    assign(p, r, List.of("registration"));
    String aid =
        r.ok(
                "POST",
                "/care/appointments",
                Map.of(
                    "patientId",
                    uid(p),
                    "doctorId",
                    uid(d),
                    "startsAt",
                    Instant.now().plusSeconds(30 * 86400).toString(),
                    "duration",
                    30,
                    "mode",
                    "in_person",
                    "requestKey",
                    UUID.randomUUID().toString()))
            .get("id")
            .asText();
    r.ok(
        "PATCH",
        "/care/appointments/" + aid + "/stage",
        Map.of("version", 0, "stage", "checked_in"));
    n.ok("PATCH", "/care/appointments/" + aid + "/stage", Map.of("version", 1, "stage", "triage"));
    var vital = rec(p, "vital");
    vital.put("encounterId", aid);
    vital.put("measurements", Map.of("pulse_bpm", 72, "systolic_mmhg", 120, "diastolic_mmhg", 80));
    n.ok("POST", "/care/records", vital);
    d.ok(
        "PATCH",
        "/care/appointments/" + aid + "/stage",
        Map.of("version", 2, "stage", "consultation"));
    var note = rec(p, "encounter");
    note.put("encounterId", aid);
    note.put("noteState", "draft");
    String rid = d.ok("POST", "/care/records", note).get("id").asText();
    d.ok(
        "PATCH",
        "/care/records/" + rid + "/draft",
        Map.of(
            "version",
            0,
            "details",
            "Reviewed synthetic assessment and plan",
            "reviewed",
            true,
            "finalize",
            true));
    d.ok(
        "PATCH",
        "/care/appointments/" + aid + "/stage",
        Map.of("version", 4, "stage", "follow_up"));
    var follow = rec(p, "follow_up");
    follow.put("encounterId", aid);
    d.ok("POST", "/care/records", follow);
    d.ok(
        "PATCH",
        "/care/appointments/" + aid + "/stage",
        Map.of("version", 5, "stage", "discharged"));
    assertEquals(
        "completed", d.ok("GET", "/clinician/appointments/" + aid, null).get("status").asText());
  }

  @Test
  void unknownDatesAndInvalidMeasurementsAreHandledWithoutInvention() throws Exception {
    var p = patient();
    var n = new Client().login("nurse");
    assign(p, n, List.of("vital"));
    var b = rec(p, "vital");
    b.remove("observedAt");
    b.remove("observedTimezone");
    b.remove("sourceType");
    b.remove("source");
    var v = n.ok("POST", "/care/records", b);
    assertTrue(v.get("observed_at").isNull());
    assertTrue(v.get("source_type").isNull());
    assertEquals("Unknown", v.get("source").asText());
    var invalid = rec(p, "vital");
    invalid.put("observedAt", "2026-09-11T09:00:00");
    assertEquals(400, n.call("POST", "/care/records", invalid).statusCode());
    invalid.put("observedAt", Instant.now().toString());
    invalid.put("measurements", Map.of("spo2_percent", 101));
    assertEquals(400, n.call("POST", "/care/records", invalid).statusCode());
  }

  @Test
  void clinicFreshnessOverridesAreVersionedAndNotificationsHidePatientContent() throws Exception {
    var admin = new Client().login("admin");
    var rule = admin.ok("GET", "/care/workspace", null).get("freshnessRules");
    int version = 0;
    for (var r : rule)
      if (r.get("kind").asText().equals("vital")) version = r.get("version").asInt();
    admin.ok("PUT", "/care/freshness/vital", Map.of("version", version, "minutes", 90));
    assertEquals(
        409,
        admin
            .call("PUT", "/care/freshness/vital", Map.of("version", version, "minutes", 60))
            .statusCode());
    assertEquals(
        1440,
        api.db.queryForObject(
            "select minutes from freshness_rule where kind='vital'", Integer.class));
    for (var n : admin.ok("GET", "/care/notifications", null)) {
      assertFalse(n.has("patient_id"));
      assertFalse(n.has("details"));
      assertFalse(n.has("title"));
    }
  }
}
