package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=jdbc:h2:mem:fhirapi;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=test-passphrase-258!"
    })
class FhirApiTest {
  @LocalServerPort int port;
  @Autowired ObjectMapper json;
  final HttpClient client =
      HttpClient.newBuilder()
          .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
          .build();
  String csrf;

  HttpResponse<String> call(String path, Object body) throws Exception {
    var b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api" + path));
    if (body != null)
      b.header("X-CSRF-TOKEN", csrf)
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
    return client.send(b.build(), HttpResponse.BodyHandlers.ofString());
  }

  @Test
  void capturesExplicitStatusAndPreservesUnknownAllergyWithoutInventingStatus() throws Exception {
    csrf = json.readTree(call("/csrf", null).body()).get("token").asText();
    var login =
        call("/auth/login", Map.of("username", "patient", "password", "test-passphrase-258!"));
    assertEquals(200, login.statusCode());
    String patient = json.readTree(login.body()).get("id").asText();
    Map<String, Object> record =
        new LinkedHashMap<>(
            Map.of(
                "patientId",
                patient,
                "kind",
                "allergy",
                "title",
                "Synthetic food allergy",
                "details",
                "Synthetic report; status unspecified"));
    var unknown = call("/records", record);
    assertEquals(200, unknown.statusCode(), unknown.body());
    String unknownId = json.readTree(unknown.body()).get("id").asText();
    record.put("clinicalStatus", "bogus");
    assertEquals(400, call("/records", record).statusCode());
    record.put("clinicalStatus", "resolved");
    var resolved = call("/records", record);
    assertEquals(200, resolved.statusCode(), resolved.body());
    String resolvedId = json.readTree(resolved.body()).get("id").asText();
    assertEquals("resolved", json.readTree(resolved.body()).get("clinical_status").asText());
    var exported = call("/patients/" + patient + "/fhir", null);
    assertEquals(200, exported.statusCode(), exported.body());
    JsonNode bundle = json.readTree(exported.body());
    Map<String, JsonNode> resources = new HashMap<>();
    bundle
        .get("entry")
        .forEach(e -> resources.put(e.get("resource").get("id").asText(), e.get("resource")));
    assertEquals("DocumentReference", resources.get(unknownId).get("resourceType").asText());
    assertEquals("AllergyIntolerance", resources.get(resolvedId).get("resourceType").asText());
    assertEquals(
        "resolved", resources.get(resolvedId).at("/clinicalStatus/coding/0/code").asText());
    assertTrue(
        resources.values().stream()
            .anyMatch(r -> r.get("resourceType").asText().equals("OperationOutcome")));
  }
}
