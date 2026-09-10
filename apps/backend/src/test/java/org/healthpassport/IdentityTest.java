package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=jdbc:h2:mem:identity;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=test-passphrase-258!",
      "IDENTITY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    })
class IdentityTest {
  @LocalServerPort int port;
  @Autowired ObjectMapper mapper;
  @Autowired JdbcTemplate db;
  @Autowired IdentityService identity;
  @Autowired IdentityApi identityApi;

  class Client {
    HttpClient http =
        HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
    String csrf;

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
      var res = call(method, path, body);
      assertEquals(200, res.statusCode(), res.body());
      return mapper.readTree(res.body());
    }

    Client init() throws Exception {
      csrf = ok("GET", "/csrf", null).get("token").asText();
      return this;
    }

    JsonNode login(String name, String password, String otp) throws Exception {
      return ok("POST", "/auth/login", Map.of("username", name, "password", password, "otp", otp));
    }
  }

  String code(String uid, long offset) throws Exception {
    var row = db.queryForMap("select * from identity_mfa where user_id=?", uid);
    return identity.otp.generateOneTimePasswordString(
        new SecretKeySpec(identity.decrypt(row.get("encrypted_secret").toString()), "HmacSHA1"),
        Instant.now().plusSeconds(offset),
        Locale.ROOT);
  }

  @Test
  void enrollmentLoginRecoveryAndReplayProtection() throws Exception {
    Client client = new Client().init();
    client.ok(
        "POST",
        "/auth/register",
        Map.of(
            "username",
            "identitypatient",
            "displayName",
            "Identity Patient",
            "password",
            "strong-test-password"));
    String uid = client.login("identitypatient", "strong-test-password", "").get("id").asText();
    Client old = new Client().init();
    old.login("identitypatient", "strong-test-password", "");
    assertEquals(
        401,
        client
            .call("POST", "/security/totp/setup", Map.of("password", "wrong-password"))
            .statusCode());
    var setup =
        client.ok("POST", "/security/totp/setup", Map.of("password", "strong-test-password"));
    assertTrue(setup.get("otpauthUri").asText().startsWith("otpauth://totp/"));
    assertFalse(
        db.queryForObject(
                "select encrypted_secret from identity_mfa where user_id=?", String.class, uid)
            .contains(setup.get("secret").asText()));
    var confirmation = client.ok("POST", "/security/totp/confirm", Map.of("otp", code(uid, -30)));
    assertEquals(8, confirmation.get("recoveryCodes").size());
    assertEquals(401, old.call("GET", "/me", null).statusCode());
    assertTrue(client.ok("GET", "/security/status", null).get("totpEnabled").asBoolean());
    Client login = new Client().init();
    assertEquals(
        401,
        login
            .call(
                "POST",
                "/auth/login",
                Map.of("username", "identitypatient", "password", "strong-test-password"))
            .statusCode());
    String current = code(uid, 0);
    login.login("identitypatient", "strong-test-password", current);
    Client replay = new Client().init();
    assertEquals(
        401,
        replay
            .call(
                "POST",
                "/auth/login",
                Map.of(
                    "username",
                    "identitypatient",
                    "password",
                    "strong-test-password",
                    "otp",
                    current))
            .statusCode());
    assertEquals(401, replay.call("GET", "/me", null).statusCode());
    String recovery = confirmation.get("recoveryCodes").get(0).asText();
    assertEquals(
        0,
        db.queryForObject(
            "select count(*) from recovery_code where code_hash=?", Integer.class, recovery));
    Client recover = new Client().init();
    assertEquals(
        401,
        recover
            .call(
                "POST",
                "/auth/recover",
                Map.of(
                    "username",
                    "identitypatient",
                    "recoveryCode",
                    "invalid",
                    "newPassword",
                    "replacement-password"))
            .statusCode());
    recover.ok(
        "POST",
        "/auth/recover",
        Map.of(
            "username",
            "identitypatient",
            "recoveryCode",
            recovery,
            "newPassword",
            "replacement-password"));
    assertEquals(401, client.call("GET", "/me", null).statusCode());
    assertEquals(401, login.call("GET", "/me", null).statusCode());
    assertEquals(
        401,
        recover
            .call(
                "POST",
                "/auth/recover",
                Map.of(
                    "username",
                    "identitypatient",
                    "recoveryCode",
                    recovery,
                    "newPassword",
                    "another-new-password"))
            .statusCode());
    recover.login("identitypatient", "replacement-password", "");
    assertFalse(recover.ok("GET", "/security/status", null).get("totpEnabled").asBoolean());
  }

  @Test
  void sessionsAreOwnerScopedAndRevokedOnNextRequest() throws Exception {
    Client first = new Client().init();
    first.login("doctor", "test-passphrase-258!", "");
    Client second = new Client().init();
    second.login("doctor", "test-passphrase-258!", "");
    Client patient = new Client().init();
    patient.login("patient", "test-passphrase-258!", "");
    var sessions = first.ok("GET", "/security/sessions", null);
    assertTrue(sessions.size() >= 2);
    String sessionId = sessions.get(0).get("id").asText();
    assertEquals(
        404,
        patient.call("POST", "/security/sessions/" + sessionId + "/revoke", Map.of()).statusCode());
    first.ok("POST", "/security/sessions/" + sessionId + "/revoke", Map.of());
    assertEquals(401, second.call("GET", "/me", null).statusCode());
    assertEquals(200, first.call("GET", "/me", null).statusCode());
  }

  @Test
  void enrollmentFailsClosedWithoutEncryptionKey() throws Exception {
    String original = identity.encryptionKey;
    try {
      identity.encryptionKey = "";
      assertThrows(
          org.springframework.web.server.ResponseStatusException.class,
          () -> identity.encrypt(new byte[20]));
    } finally {
      identity.encryptionKey = original;
    }
  }

  @Test
  void standardTotpVectorAndPublicIdentityGeneration() throws Exception {
    var generator =
        new com.eatthepath.otp.TimeBasedOneTimePasswordGenerator(
            Duration.ofSeconds(30), 8, "HmacSHA1");
    assertEquals(
        "94287082",
        generator.generateOneTimePasswordString(
            new SecretKeySpec(
                "12345678901234567890".getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                "HmacSHA1"),
            Instant.ofEpochSecond(59),
            Locale.ROOT));
    Client c = new Client().init();
    var registration =
        c.ok(
            "POST",
            "/auth/register",
            Map.of(
                "username",
                "newpatient",
                "displayName",
                "New Patient",
                "password",
                "strong-test-password"));
    assertTrue(registration.get("healthId").asText().matches("[A-HJ-NP-Z2-9]{9}"));
    assertFalse(registration.has("id"));
    assertEquals(
        409,
        c.call(
                "POST",
                "/auth/register",
                Map.of(
                    "username",
                    "newpatient",
                    "displayName",
                    "New Patient",
                    "password",
                    "strong-test-password"))
            .statusCode());
    assertEquals(
        400,
        c.call(
                "POST",
                "/auth/register",
                Map.of("username", "invalid user", "displayName", "New", "password", "short"))
            .statusCode());
  }

  @Test
  void bcryptByteLimitIsValidatedWithoutServerErrors() throws Exception {
    Client c = new Client().init();
    String tooLong = "界".repeat(30);
    assertEquals(
        400,
        c.call(
                "POST",
                "/auth/register",
                Map.of("username", "longpassword", "displayName", "Synthetic", "password", tooLong))
            .statusCode());
    assertEquals(
        401,
        c.call("POST", "/auth/login", Map.of("username", "patient", "password", tooLong))
            .statusCode());
    assertEquals(
        401,
        c.call("POST", "/auth/login", Map.of("username", "missingaccount", "password", tooLong))
            .statusCode());
    assertEquals(
        400,
        c.call(
                "POST",
                "/auth/recover",
                Map.of("username", "patient", "recoveryCode", "invalid", "newPassword", tooLong))
            .statusCode());
  }

  @Test
  void registrationRetriesAnIdCollisionWithoutLosingUniqueness() throws Exception {
    String existing =
        db.queryForObject("select health_id from app_user where username='patient'", String.class);
    String fresh = HealthIds.generate();
    try (var generator =
        org.mockito.Mockito.mockStatic(HealthIds.class, org.mockito.Mockito.CALLS_REAL_METHODS)) {
      generator.when(HealthIds::generate).thenReturn(existing, fresh);
      var request = new org.springframework.mock.web.MockHttpServletRequest();
      request.setRemoteAddr("192.0.2.5");
      request.getSession().setAttribute("csrf", "synthetic-test-csrf");
      request.addHeader("X-CSRF-TOKEN", "synthetic-test-csrf");
      var result =
          identityApi.register(
              Map.of(
                  "username",
                  "collisionpatient",
                  "displayName",
                  "Collision Patient",
                  "password",
                  "strong-test-password"),
              request);
      assertEquals(fresh, result.get("healthId"));
      generator.verify(HealthIds::generate, org.mockito.Mockito.times(2));
      assertEquals(
          1,
          db.queryForObject(
              "select count(*) from app_user where health_id=?", Integer.class, existing));
      assertEquals(
          1,
          db.queryForObject(
              "select count(*) from app_user where health_id=?", Integer.class, fresh));
    }
  }
}
