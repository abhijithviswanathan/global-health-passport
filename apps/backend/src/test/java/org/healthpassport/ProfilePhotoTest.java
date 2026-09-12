package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.mock.web.*;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;

@SpringBootTest(
    properties = {
      "spring.datasource.url=${PHOTO_TEST_DATABASE_URL:jdbc:h2:mem:photos;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE}",
      "spring.datasource.username=${PHOTO_TEST_DATABASE_USER:sa}",
      "spring.datasource.password=${PHOTO_TEST_DATABASE_PASSWORD:}",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=photo-test-password!",
      "DOCUMENT_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    })
@AutoConfigureMockMvc
@Import(ProfilePhotoTest.Config.class)
class ProfilePhotoTest {
  static Path storage;

  static {
    try {
      storage = Files.createTempDirectory("photo-test-");
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  @DynamicPropertySource
  static void settings(DynamicPropertyRegistry p) {
    p.add("PHOTO_STORAGE_PATH", () -> storage.toString());
  }

  static class Check implements PhotoService.FaceCheck {
    int verdict = 0;

    public int check(Path f) {
      return verdict;
    }
  }

  @TestConfiguration
  static class Config {
    @Bean
    @Primary
    Check faceCheck() {
      return new Check();
    }
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired PassportApi api;
  @Autowired Check detector;

  record Client(MockHttpSession session, String csrf, String id) {}

  Client anonymous() throws Exception {
    var r = mvc.perform(get("/api/csrf")).andReturn();
    return new Client(
        (MockHttpSession) r.getRequest().getSession(),
        json.readTree(r.getResponse().getContentAsString()).get("token").asText(),
        "");
  }

  Client login(String username) throws Exception {
    var c = anonymous();
    var r =
        mvc.perform(
                post("/api/auth/login")
                    .session(c.session)
                    .header("X-CSRF-TOKEN", c.csrf)
                    .contentType("application/json")
                    .content(
                        json.writeValueAsString(
                            Map.of("username", username, "password", "photo-test-password!"))))
            .andExpect(status().isOk())
            .andReturn();
    return new Client(
        (MockHttpSession) r.getRequest().getSession(),
        c.csrf,
        json.readTree(r.getResponse().getContentAsString()).get("id").asText());
  }

  Client actor(String role, String org) throws Exception {
    String name = "p" + UUID.randomUUID().toString().replace("-", "");
    String id = PassportApi.id();
    api.db.update(
        "insert into app_user(id,username,display_name,role,password_hash,health_id,organization)"
            + " values(?,?,?,?,?,?,?)",
        id,
        name,
        "Synthetic photo test",
        role,
        api.passwords.encode("photo-test-password!"),
        HealthIds.generate(),
        org);
    if (role.equals("doctor"))
      api.db.update(
          "insert into"
              + " practitioner_verification(user_id,status,evidence_reference,verified_at,reviewer_id)"
              + " values(?,?,?,?,?)",
          id,
          "synthetic_verified",
          "test",
          PassportApi.now(),
          id);
    api.tenants.bootstrap(true);
    return login(name);
  }

  byte[] image() throws Exception {
    var b = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
    var out = new ByteArrayOutputStream();
    ImageIO.write(b, "png", out);
    return out.toByteArray();
  }

  JsonNode upload(Client c, String endpoint) throws Exception {
    return json.readTree(
        mvc.perform(
                multipart("/api" + endpoint)
                    .file(new MockMultipartFile("file", "portrait.png", "image/png", image()))
                    .session(c.session)
                    .header("X-CSRF-TOKEN", c.csrf))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  void privacy(Client c, String visibility, List<String> names) throws Exception {
    mvc.perform(
            put("/api/profile/visibility")
                .session(c.session)
                .header("X-CSRF-TOKEN", c.csrf)
                .contentType("application/json")
                .content(
                    json.writeValueAsString(Map.of("visibility", visibility, "usernames", names))))
        .andExpect(status().isOk());
  }

  void grant(Client patient, Client doctor) throws Exception {
    mvc.perform(
            post("/api/consents")
                .session(patient.session)
                .header("X-CSRF-TOKEN", patient.csrf)
                .contentType("application/json")
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "patientId",
                            patient.id,
                            "granteeId",
                            doctor.id,
                            "scopes",
                            List.of("document"),
                            "purpose",
                            "treatment",
                            "expiresAt",
                            Instant.now().plusSeconds(3600).toString()))))
        .andExpect(status().isOk());
  }

  @BeforeEach
  void reset() {
    detector.verdict = 0;
  }

  @Test
  void profileVisibilityAndEncryptedLocalStorage() throws Exception {
    var p = actor("patient", "self");
    var doctor = login("doctor");
    var admin = login("admin");
    var photo = upload(p, "/profile/photo");
    String id = photo.get("id").asText();
    var bytes =
        mvc.perform(get("/api/photos/" + id).session(p.session))
            .andExpect(status().isOk())
            .andExpect(
                header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    assertNotNull(ImageIO.read(new ByteArrayInputStream(bytes)));
    assertFalse(Arrays.equals(bytes, Files.readAllBytes(storage.resolve(id + ".enc"))));
    mvc.perform(get("/api/photos/" + id).session(doctor.session)).andExpect(status().isNotFound());
    mvc.perform(get("/api/photos/" + id)).andExpect(status().isUnauthorized());
    privacy(p, "signed_in", List.of());
    mvc.perform(get("/api/photos/" + id).session(admin.session)).andExpect(status().isOk());
    mvc.perform(get("/api/photos/" + id)).andExpect(status().isUnauthorized());
    privacy(p, "selected", List.of("doctor"));
    mvc.perform(get("/api/photos/" + id).session(doctor.session)).andExpect(status().isOk());
    mvc.perform(get("/api/photos/" + id).session(admin.session)).andExpect(status().isNotFound());
    privacy(p, "care_team", List.of());
    mvc.perform(get("/api/photos/" + id).session(doctor.session)).andExpect(status().isNotFound());
    grant(p, doctor);
    mvc.perform(get("/api/photos/" + id).session(doctor.session)).andExpect(status().isOk());
    mvc.perform(delete("/api/profile/photo").session(p.session).header("X-CSRF-TOKEN", p.csrf))
        .andExpect(status().isOk());
    assertFalse(Files.exists(storage.resolve(id + ".enc")));
  }

  @Test
  void clinicalPhotosStayWithAuthorizedHolderAndPatientSeesPurpose() throws Exception {
    var p = actor("patient", "self");
    var doctor = login("doctor");
    var admin = login("admin");
    grant(p, doctor);
    var result =
        mvc.perform(
                multipart("/api/patients/" + p.id + "/identification-photos")
                    .file(new MockMultipartFile("file", "photo.png", "image/png", image()))
                    .param("purpose", "Identification at check-in")
                    .param("scope", "organization")
                    .param("authorized", "true")
                    .session(doctor.session)
                    .header("X-CSRF-TOKEN", doctor.csrf))
            .andExpect(status().isOk())
            .andReturn();
    String id = json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    mvc.perform(get("/api/photos/" + id).session(doctor.session)).andExpect(status().isOk());
    mvc.perform(get("/api/photos/" + id).session(p.session)).andExpect(status().isNotFound());
    mvc.perform(get("/api/photos/" + id).session(admin.session)).andExpect(status().isNotFound());
    mvc.perform(get("/api/patients/" + p.id + "/identification-photos").session(p.session))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].purpose").value("Identification at check-in"))
        .andExpect(jsonPath("$[0].canView").value(false))
        .andExpect(jsonPath("$[0].imageUrl").isEmpty());
    var colleague =
        actor(
            "doctor",
            api.db.queryForObject(
                "select organization from app_user where id=?", String.class, doctor.id));
    mvc.perform(get("/api/photos/" + id).session(colleague.session))
        .andExpect(status().isNotFound());
    grant(p, colleague);
    mvc.perform(get("/api/photos/" + id).session(colleague.session)).andExpect(status().isOk());
    var privateResult =
        mvc.perform(
                multipart("/api/patients/" + p.id + "/identification-photos")
                    .file(new MockMultipartFile("file", "photo.png", "image/png", image()))
                    .param("purpose", "Private treating doctor reference")
                    .param("scope", "doctor")
                    .param("authorized", "true")
                    .session(doctor.session)
                    .header("X-CSRF-TOKEN", doctor.csrf))
            .andExpect(status().isOk())
            .andReturn();
    String privateId =
        json.readTree(privateResult.getResponse().getContentAsString()).get("id").asText();
    mvc.perform(get("/api/photos/" + privateId + "/data").session(colleague.session))
        .andExpect(status().isNotFound());
    mvc.perform(get("/api/photos/" + privateId + "/data").session(doctor.session))
        .andExpect(status().isOk());
    var other = actor("doctor", "Another hospital");
    grant(p, other);
    mvc.perform(get("/api/photos/" + id).session(other.session)).andExpect(status().isNotFound());
    api.db.update(
        "update consent set status='revoked' where patient_id=? and grantee_id=?", p.id, doctor.id);
    mvc.perform(get("/api/photos/" + id).session(doctor.session)).andExpect(status().isNotFound());
  }

  @Test
  void faceFailuresAndCsrfFailClosed() throws Exception {
    var p = actor("patient", "self");
    mvc.perform(
            multipart("/api/profile/photo")
                .file(new MockMultipartFile("file", "photo.png", "image/png", image()))
                .session(p.session))
        .andExpect(status().isForbidden());
    for (int verdict : new int[] {23, 24, 25}) {
      detector.verdict = verdict;
      mvc.perform(
              multipart("/api/profile/photo")
                  .file(new MockMultipartFile("file", "photo.png", "image/png", image()))
                  .session(p.session)
                  .header("X-CSRF-TOKEN", p.csrf))
          .andExpect(status().is(verdict == 25 ? 503 : 422));
    }
    detector.verdict = 0;
    mvc.perform(
            multipart("/api/profile/photo")
                .file(
                    new MockMultipartFile(
                        "file", "fake.png", "image/png", "not an image".getBytes()))
                .session(p.session)
                .header("X-CSRF-TOKEN", p.csrf))
        .andExpect(status().isBadRequest());
    try (var files = Files.list(storage)) {
      assertFalse(files.anyMatch(f -> f.getFileName().toString().startsWith("check-")));
    }
  }

  @Test
  void onboardingPhotoIsScopedExpiringAndSingleUse() throws Exception {
    var c = anonymous();
    String username = "reg" + UUID.randomUUID().toString().replace("-", "");
    mvc.perform(
            post("/api/auth/register")
                .session(c.session)
                .header("X-CSRF-TOKEN", c.csrf)
                .contentType("application/json")
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "username",
                            username,
                            "displayName",
                            "Synthetic profile",
                            "password",
                            "photo-test-password!"))))
        .andExpect(status().isOk());
    var until = c.session.getAttribute("photoRegistrationUntil");
    c.session.setAttribute("photoRegistrationUntil", Instant.now().minusSeconds(1));
    mvc.perform(
            multipart("/api/auth/registration-photo")
                .file(new MockMultipartFile("file", "photo.png", "image/png", image()))
                .session(c.session)
                .header("X-CSRF-TOKEN", c.csrf))
        .andExpect(status().isUnauthorized());
    c.session.setAttribute("photoRegistrationUntil", until);
    upload(c, "/auth/registration-photo");
    mvc.perform(
            multipart("/api/auth/registration-photo")
                .file(new MockMultipartFile("file", "photo.png", "image/png", image()))
                .session(c.session)
                .header("X-CSRF-TOKEN", c.csrf))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/profile").session(c.session)).andExpect(status().isUnauthorized());
  }
}
