package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=jdbc:h2:mem:passporttest;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=passport-test-password!",
      "PASSPORT_KEY_FILE=target/test-signing-keys.properties"
    })
class MedicationPassportTest {
  @LocalServerPort int port;
  @Autowired ObjectMapper json;

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
  }

  @Test
  void signedPassportTamperingAndReferenceAuthorization() throws Exception {
    Client patient = new Client();
    String pid =
        patient
            .post(
                "/auth/login", Map.of("username", "patient", "password", "passport-test-password!"))
            .get("id")
            .asText();
    var issued = patient.post("/medication-passports", Map.of("patientId", pid));
    String signed = issued.get("credential").asText();
    assertTrue(
        patient
            .post("/medication-passports/verify", Map.of("credential", signed))
            .get("valid")
            .asBoolean());
    String[] parts = signed.split("\\.");
    String changed =
        parts[0]
            + "."
            + Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString("{\"exp\":9999999999}".getBytes())
            + "."
            + parts[2];
    assertFalse(
        patient
            .post("/medication-passports/verify", Map.of("credential", changed))
            .get("valid")
            .asBoolean());
    assertFalse(issued.get("qrPayload").asText().contains(pid));
    Client anon = new Client();
    assertEquals(
        401,
        anon.call("GET", "/medication-passports/ref/" + issued.get("reference").asText(), null)
            .statusCode());
    Client doctor = new Client();
    doctor.post("/auth/login", Map.of("username", "doctor", "password", "passport-test-password!"));
    assertEquals(
        403,
        doctor
            .call("GET", "/medication-passports/ref/" + issued.get("reference").asText(), null)
            .statusCode());
    assertEquals(
        200,
        patient
            .call("GET", "/medication-passports/ref/" + issued.get("reference").asText(), null)
            .statusCode());
    var key = json.readTree(anon.call("GET", "/medication-passports/public-key", null).body());
    assertEquals("Ed25519", key.get("crv").asText());
    assertFalse(key.has("private"));
    assertFalse(key.has("d"));
  }
}
