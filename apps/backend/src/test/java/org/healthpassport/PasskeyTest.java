package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.upokecenter.cbor.CBORObject;
import java.net.*;
import java.net.http.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=jdbc:h2:mem:passkeytest;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=passkey-test-password!",
      "WEBAUTHN_ORIGINS=http://localhost:5173",
      "WEBAUTHN_RP_ID=localhost"
    })
class PasskeyTest {
  @LocalServerPort int port;
  @Autowired ObjectMapper json;
  @Autowired org.springframework.jdbc.core.JdbcTemplate db;

  class Client {
    HttpClient http =
        HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
    String csrf;

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

    void login() throws Exception {
      post("/auth/login", Map.of("username", "patient", "password", "passkey-test-password!"));
    }
  }

  String b64(byte[] b) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
  }

  byte[] utf(String s) {
    return s.getBytes(StandardCharsets.UTF_8);
  }

  byte[] sha(byte[] b) throws Exception {
    return MessageDigest.getInstance("SHA-256").digest(b);
  }

  byte[] coordinate(java.math.BigInteger n) {
    byte[] a = n.toByteArray();
    return Arrays.copyOfRange(a, Math.max(0, a.length - 32), a.length).length == 32
        ? Arrays.copyOfRange(a, Math.max(0, a.length - 32), a.length)
        : ByteBuffer.allocate(32).position(32 - a.length).put(a).array();
  }

  Map<String, Object> registration(
      JsonNode options, byte[] credentialId, KeyPair key, String origin) throws Exception {
    byte[] client =
        utf(
            json.writeValueAsString(
                Map.of(
                    "type",
                    "webauthn.create",
                    "challenge",
                    options.get("publicKey").get("challenge").asText(),
                    "origin",
                    origin)));
    var pub = (ECPublicKey) key.getPublic();
    var cose =
        CBORObject.NewMap()
            .Add(1, 2)
            .Add(3, -7)
            .Add(-1, 1)
            .Add(-2, coordinate(pub.getW().getAffineX()))
            .Add(-3, coordinate(pub.getW().getAffineY()))
            .EncodeToBytes();
    byte[] auth =
        ByteBuffer.allocate(32 + 1 + 4 + 16 + 2 + credentialId.length + cose.length)
            .put(sha(utf("localhost")))
            .put((byte) 0x45)
            .putInt(0)
            .put(new byte[16])
            .putShort((short) credentialId.length)
            .put(credentialId)
            .put(cose)
            .array();
    byte[] attestation =
        CBORObject.NewMap()
            .Add("fmt", "none")
            .Add("attStmt", CBORObject.NewMap())
            .Add("authData", auth)
            .EncodeToBytes();
    return Map.of(
        "id",
        b64(credentialId),
        "rawId",
        b64(credentialId),
        "type",
        "public-key",
        "response",
        Map.of("clientDataJSON", b64(client), "attestationObject", b64(attestation)),
        "clientExtensionResults",
        Map.of());
  }

  Map<String, Object> assertion(
      JsonNode options, byte[] credentialId, KeyPair key, String origin, int flags, int count)
      throws Exception {
    byte[] client =
        utf(
            json.writeValueAsString(
                Map.of(
                    "type",
                    "webauthn.get",
                    "challenge",
                    options.get("publicKey").get("challenge").asText(),
                    "origin",
                    origin)));
    byte[] auth =
        ByteBuffer.allocate(37).put(sha(utf("localhost"))).put((byte) flags).putInt(count).array();
    Signature sig = Signature.getInstance("SHA256withECDSA");
    sig.initSign(key.getPrivate());
    sig.update(auth);
    sig.update(sha(client));
    return Map.of(
        "id",
        b64(credentialId),
        "rawId",
        b64(credentialId),
        "type",
        "public-key",
        "response",
        Map.of(
            "clientDataJSON",
            b64(client),
            "authenticatorData",
            b64(auth),
            "signature",
            b64(sig.sign())),
        "clientExtensionResults",
        Map.of());
  }

  KeyPair key() throws Exception {
    var g = KeyPairGenerator.getInstance("EC");
    g.initialize(new ECGenParameterSpec("secp256r1"));
    return g.generateKeyPair();
  }

  @Test
  void validCryptographicRegistrationLoginAndOneTimeChallenge() throws Exception {
    Client c = new Client();
    c.login();
    var options =
        c.post("/passkeys/register/options", Map.of("password", "passkey-test-password!"));
    assertEquals(
        "required",
        options.get("publicKey").get("authenticatorSelection").get("userVerification").asText());
    KeyPair key = key();
    byte[] id = new byte[32];
    new SecureRandom().nextBytes(id);
    var response =
        Map.of(
            "requestId",
            options.get("requestId").asText(),
            "credential",
            registration(options, id, key, "http://localhost:5173"));
    c.post("/passkeys/register/finish", response);
    assertEquals(401, c.call("POST", "/passkeys/register/finish", response).statusCode());
    c.post("/auth/logout", Map.of());
    Client login = new Client();
    var request = login.post("/auth/passkey/options", Map.of("username", "patient"));
    var signed =
        Map.of(
            "requestId",
            request.get("requestId").asText(),
            "credential",
            assertion(request, id, key, "http://localhost:5173", 5, 1));
    assertEquals("patient", login.post("/auth/passkey/finish", signed).get("username").asText());
    assertEquals(401, login.call("POST", "/auth/passkey/finish", signed).statusCode());
    Client attacker = new Client();
    var badOrigin = attacker.post("/auth/passkey/options", Map.of("username", "patient"));
    assertEquals(
        401,
        attacker
            .call(
                "POST",
                "/auth/passkey/finish",
                Map.of(
                    "requestId",
                    badOrigin.get("requestId").asText(),
                    "credential",
                    assertion(badOrigin, id, key, "https://evil.example", 5, 2)))
            .statusCode());
    var noUv = attacker.post("/auth/passkey/options", Map.of("username", "patient"));
    assertEquals(
        401,
        attacker
            .call(
                "POST",
                "/auth/passkey/finish",
                Map.of(
                    "requestId",
                    noUv.get("requestId").asText(),
                    "credential",
                    assertion(noUv, id, key, "http://localhost:5173", 1, 2)))
            .statusCode());
    assertEquals(401, attacker.call("GET", "/me", null).statusCode());
  }

  @Test
  void challengeExpiresAndCannotCrossSessions() throws Exception {
    Client c = new Client();
    c.login();
    var options =
        c.post("/passkeys/register/options", Map.of("password", "passkey-test-password!"));
    Client other = new Client();
    other.login();
    assertEquals(
        401,
        other
            .call(
                "POST",
                "/passkeys/register/finish",
                Map.of("requestId", options.get("requestId").asText(), "credential", Map.of()))
            .statusCode());
    db.update(
        "update passkey_challenge set expires_at=? where id=?",
        java.time.Instant.now().minusSeconds(1).toString(),
        options.get("requestId").asText());
    assertEquals(
        401,
        c.call(
                "POST",
                "/passkeys/register/finish",
                Map.of("requestId", options.get("requestId").asText(), "credential", Map.of()))
            .statusCode());
    assertEquals(
        401,
        c.call("POST", "/passkeys/register/options", Map.of("password", "wrong-password"))
            .statusCode());
  }
}
