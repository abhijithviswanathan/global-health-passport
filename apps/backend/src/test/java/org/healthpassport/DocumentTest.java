package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.datasource.url=jdbc:h2:mem:documents;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=test-passphrase-258!",
      "DOCUMENT_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    })
@AutoConfigureMockMvc
@Import(DocumentTest.ScannerConfig.class)
class DocumentTest {
  static final Path storage;

  static {
    try {
      storage = Files.createTempDirectory("passport-documents-test-");
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry p) {
    p.add("DOCUMENT_STORAGE_PATH", storage::toString);
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired TestScanner scanner;

  static class TestScanner implements DocumentService.Scanner {
    DocumentService.Verdict verdict = DocumentService.Verdict.UNAVAILABLE;

    public DocumentService.Verdict scan(Path file) {
      return verdict;
    }
  }

  @TestConfiguration
  static class ScannerConfig {
    @Bean
    @Primary
    TestScanner testScanner() {
      return new TestScanner();
    }
  }

  record Client(MockHttpSession session, String csrf, String id) {}

  Client login(String username) throws Exception {
    var csrf = mvc.perform(get("/api/csrf")).andExpect(status().isOk()).andReturn();
    var session = (MockHttpSession) csrf.getRequest().getSession();
    String token = json.readTree(csrf.getResponse().getContentAsString()).get("token").asText();
    var response =
        mvc.perform(
                post("/api/auth/login")
                    .session(session)
                    .header("X-CSRF-TOKEN", token)
                    .contentType("application/json")
                    .content(
                        json.writeValueAsString(
                            Map.of("username", username, "password", "test-passphrase-258!"))))
            .andExpect(status().isOk())
            .andReturn();
    return new Client(
        (MockHttpSession) response.getRequest().getSession(),
        token,
        json.readTree(response.getResponse().getContentAsString()).get("id").asText());
  }

  final byte[] pdf = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);

  JsonNode upload(Client c) throws Exception {
    var response =
        mvc.perform(
                multipart("/api/patients/" + c.id() + "/documents")
                    .file(new MockMultipartFile("file", "history.pdf", "application/pdf", pdf))
                    .session(c.session())
                    .header("X-CSRF-TOKEN", c.csrf()))
            .andExpect(status().isOk())
            .andReturn();
    return json.readTree(response.getResponse().getContentAsString());
  }

  @Test
  void encryptedQuarantineCleanDownloadAndRevokedProviderAccess() throws Exception {
    Client patient = login("patient"), doctor = login("doctor");
    scanner.verdict = DocumentService.Verdict.UNAVAILABLE;
    JsonNode quarantine = upload(patient);
    assertEquals("quarantined", quarantine.get("status").asText());
    assertTrue(quarantine.get("source").asText().contains("unverified"));
    mvc.perform(
            get("/api/documents/" + quarantine.get("id").asText() + "/download")
                .session(patient.session()))
        .andExpect(status().isLocked());
    scanner.verdict = DocumentService.Verdict.CLEAN;
    JsonNode clean = upload(patient);
    String id = clean.get("id").asText();
    assertEquals("clean", clean.get("status").asText());
    byte[] encrypted = Files.readAllBytes(storage.resolve(id + ".enc"));
    assertFalse(Arrays.equals(pdf, encrypted));
    assertEquals(pdf.length + 28, encrypted.length);
    try (var files = Files.list(storage)) {
      assertFalse(files.anyMatch(p -> p.getFileName().toString().startsWith(".scan-")));
    }
    mvc.perform(get("/api/documents/" + id + "/download").session(patient.session()))
        .andExpect(status().isOk())
        .andExpect(content().bytes(pdf))
        .andExpect(header().string("X-Content-Type-Options", "nosniff"))
        .andExpect(header().string("Cache-Control", "no-store"));
    mvc.perform(get("/api/documents/" + id + "/download").session(doctor.session()))
        .andExpect(status().isForbidden());
    var grant =
        mvc.perform(
                post("/api/consents")
                    .session(patient.session())
                    .header("X-CSRF-TOKEN", patient.csrf())
                    .contentType("application/json")
                    .content(
                        json.writeValueAsString(
                            Map.of(
                                "patientId",
                                patient.id(),
                                "granteeId",
                                doctor.id(),
                                "purpose",
                                "treatment",
                                "scopes",
                                List.of("document"),
                                "expiresAt",
                                Instant.now().plusSeconds(3600).toString()))))
            .andExpect(status().isOk())
            .andReturn();
    String grantId = json.readTree(grant.getResponse().getContentAsString()).get("id").asText();
    mvc.perform(get("/api/documents/" + id + "/download").session(doctor.session()))
        .andExpect(status().isOk());
    mvc.perform(
            post("/api/consents/" + grantId + "/revoke")
                .session(patient.session())
                .header("X-CSRF-TOKEN", patient.csrf()))
        .andExpect(status().isOk());
    mvc.perform(get("/api/documents/" + id + "/download").session(doctor.session()))
        .andExpect(status().isForbidden());
    scanner.verdict = DocumentService.Verdict.INFECTED;
    JsonNode infected = upload(patient);
    assertEquals("rejected", infected.get("status").asText());
    mvc.perform(
            get("/api/documents/" + infected.get("id").asText() + "/download")
                .session(patient.session()))
        .andExpect(status().isLocked());
    encrypted[encrypted.length - 1] ^= 1;
    Files.write(storage.resolve(id + ".enc"), encrypted);
    mvc.perform(get("/api/documents/" + id + "/download").session(patient.session()))
        .andExpect(status().isServiceUnavailable());
  }

  @Test
  void rejectsPathTypeSpoofAndMissingCsrf() throws Exception {
    Client p = login("patient");
    mvc.perform(
            multipart("/api/patients/" + p.id() + "/documents")
                .file(new MockMultipartFile("file", "../record.pdf", "application/pdf", pdf))
                .session(p.session())
                .header("X-CSRF-TOKEN", p.csrf()))
        .andExpect(status().isBadRequest());
    mvc.perform(
            multipart("/api/patients/" + p.id() + "/documents")
                .file(new MockMultipartFile("file", "record.png", "image/png", pdf))
                .session(p.session())
                .header("X-CSRF-TOKEN", p.csrf()))
        .andExpect(status().isBadRequest());
    mvc.perform(
            multipart("/api/patients/" + p.id() + "/documents")
                .file(new MockMultipartFile("file", "record.pdf", "application/pdf", pdf))
                .session(p.session()))
        .andExpect(status().isForbidden());
    mvc.perform(
            multipart("/api/patients/" + p.id() + "/documents")
                .file(
                    new MockMultipartFile(
                        "file",
                        "large.pdf",
                        "application/pdf",
                        new byte[(int) DocumentService.MAX_BYTES + 1]))
                .session(p.session())
                .header("X-CSRF-TOKEN", p.csrf()))
        .andExpect(status().isBadRequest());
    var unconfigured = new DocumentService(null, scanner, "", storage.toString());
    var missingKey =
        assertThrows(
            org.springframework.web.server.ResponseStatusException.class,
            () ->
                unconfigured.upload(
                    p.id(),
                    p.id(),
                    "unverified",
                    new MockMultipartFile("file", "record.pdf", "application/pdf", pdf),
                    () -> {}));
    assertEquals(503, missingKey.getStatusCode().value());
    assertEquals(
        DocumentService.Verdict.UNAVAILABLE, new DocumentService.CommandScanner("").scan(storage));
    assertEquals(
        DocumentService.Verdict.UNAVAILABLE,
        new DocumentService.CommandScanner("relative-scanner").scan(storage));
  }
}
