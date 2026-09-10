package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.servlet.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.spec.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/medication-passports")
public class MedicationPassportApi {
  final PassportApi api;

  @Value("${PASSPORT_SIGNING_PRIVATE_KEY:}")
  String privateConfig;

  @Value("${PASSPORT_SIGNING_PUBLIC_KEY:}")
  String publicConfig;

  @Value("${PASSPORT_KEY_FILE:data/medication-signing-keys.properties}")
  String keyFile;

  KeyPair cached;

  MedicationPassportApi(PassportApi api) {
    this.api = api;
  }

  String enc(byte[] b) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
  }

  byte[] dec(String s) {
    return Base64.getUrlDecoder().decode(s);
  }

  byte[] utf(String s) {
    return s.getBytes(StandardCharsets.UTF_8);
  }

  synchronized KeyPair key() {
    if (cached != null) return cached;
    try {
      var factory = KeyFactory.getInstance("Ed25519");
      String privateKey = privateConfig, publicKey = publicConfig;
      if (privateKey.isBlank() || publicKey.isBlank()) {
        if (!api.demo) throw error(503, "Passport signing keys are not configured");
        Path path = Path.of(keyFile);
        if (Files.exists(path)) {
          Properties p = new Properties();
          try (var stream = Files.newInputStream(path)) {
            p.load(stream);
          }
          privateKey = p.getProperty("private");
          publicKey = p.getProperty("public");
        } else {
          var pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
          privateKey = Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded());
          publicKey = Base64.getEncoder().encodeToString(pair.getPublic().getEncoded());
          Files.createDirectories(path.toAbsolutePath().getParent());
          Files.createFile(
              path,
              java.nio.file.attribute.PosixFilePermissions.asFileAttribute(
                  java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")));
          Files.writeString(path, "private=" + privateKey + "\npublic=" + publicKey + "\n");
        }
      }
      cached =
          new KeyPair(
              factory.generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(publicKey))),
              factory.generatePrivate(
                  new PKCS8EncodedKeySpec(Base64.getDecoder().decode(privateKey))));
      return cached;
    } catch (org.springframework.web.server.ResponseStatusException e) {
      throw e;
    } catch (Exception e) {
      throw error(503, "Passport signing key unavailable");
    }
  }

  @GetMapping("/public-key")
  Map<String, Object> publicKey() {
    byte[] encoded = key().getPublic().getEncoded();
    return Map.of(
        "kty",
        "OKP",
        "crv",
        "Ed25519",
        "alg",
        "EdDSA",
        "use",
        "sig",
        "kid",
        IdentityService.hash(Base64.getEncoder().encodeToString(encoded)),
        "x",
        enc(Arrays.copyOfRange(encoded, encoded.length - 32, encoded.length)),
        "issuer",
        "urn:health-passport:synthetic-local",
        "trustNotice",
        "This verifies local signature integrity, not clinical truth or authority.");
  }

  @PostMapping
  Map<String, Object> issue(@RequestBody Map<String, Object> b, HttpServletRequest r)
      throws Exception {
    api.csrf(r);
    var u = api.user(r);
    String patient = api.field(b, "patientId", 36);
    if (!api.role(u).equals("patient") || !api.uid(u).equals(patient))
      throw error(403, "Only the patient may issue their passport");
    var records =
        api.timeline(patient, r).stream()
            .filter(
                x ->
                    Set.of("medication", "prescription", "allergy").contains(x.get("kind"))
                        && "active".equals(x.get("status")))
            .map(
                x -> {
                  Map<String, Object> clean = new LinkedHashMap<>();
                  for (String name :
                      List.of(
                          "id",
                          "kind",
                          "title",
                          "details",
                          "source",
                          "author_name",
                          "created_at",
                          "dosage",
                          "route",
                          "frequency",
                          "duration",
                          "quantity",
                          "refills")) if (x.get(name) != null) clean.put(name, x.get(name));
                  return clean;
                })
            .toList();
    String pid = id(), reference = token();
    Instant expires = Instant.now().plusSeconds(300);
    var payload =
        Map.of(
            "iss",
            "urn:health-passport:synthetic-local",
            "jti",
            pid,
            "sub",
            patient,
            "iat",
            Instant.now().getEpochSecond(),
            "exp",
            expires.getEpochSecond(),
            "records",
            records,
            "notice",
            "Synthetic local credential. Does not authorize dispensing or prove clinical"
                + " accuracy.");
    String header =
        enc(
            utf(
                api.json.writeValueAsString(
                    Map.of("alg", "EdDSA", "typ", "JWT", "kid", publicKey().get("kid")))));
    String encoded = header + "." + enc(utf(api.json.writeValueAsString(payload)));
    Signature signer = Signature.getInstance("Ed25519");
    signer.initSign(key().getPrivate());
    signer.update(utf(encoded));
    String signed = encoded + "." + enc(signer.sign());
    api.tx.executeWithoutResult(
        s -> {
          api.db.update(
              "insert into"
                  + " medication_passport(id,patient_id,reference_hash,credential,expires_at,created_at)"
                  + " values(?,?,?,?,?,?)",
              pid,
              patient,
              IdentityService.hash(reference),
              signed,
              expires.toString(),
              now());
          api.audit(patient, patient, "MEDICATION_PASSPORT_ISSUED", pid);
        });
    return Map.of(
        "id",
        pid,
        "credential",
        signed,
        "reference",
        reference,
        "qrPayload",
        "/api/medication-passports/ref/" + reference,
        "expiresAt",
        expires.toString(),
        "records",
        records,
        "notice",
        payload.get("notice"));
  }

  @GetMapping("/ref/{reference}")
  Map<String, Object> resolve(@PathVariable String reference, HttpServletRequest r)
      throws Exception {
    var u = api.user(r);
    var rows =
        api.db.queryForList(
            "select * from medication_passport where reference_hash=?",
            IdentityService.hash(reference));
    if (rows.isEmpty()) throw error(404, "Passport reference unavailable");
    var row = rows.getFirst();
    if (!Instant.parse(row.get("expires_at").toString()).isAfter(Instant.now()))
      throw error(410, "Passport expired");
    String patient = row.get("patient_id").toString(), signed = row.get("credential").toString();
    var payload = api.json.readTree(dec(signed.split("\\.")[1]));
    for (var rec : payload.get("records")) api.require(u, patient, rec.get("kind").asText());
    if (payload.get("records").isEmpty() && !api.uid(u).equals(patient))
      throw error(403, "Access not authorized");
    api.audit(api.uid(u), patient, "MEDICATION_PASSPORT_READ", row.get("id").toString());
    return Map.of(
        "credential",
        signed,
        "expiresAt",
        row.get("expires_at"),
        "records",
        payload.get("records"));
  }

  @PostMapping("/verify")
  Map<String, Object> verify(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    String signed = api.field(b, "credential", 200000);
    try {
      String[] parts = signed.split("\\.");
      if (parts.length != 3) return Map.of("valid", false);
      var header = api.json.readTree(dec(parts[0]));
      if (!"EdDSA".equals(header.path("alg").asText())
          || !publicKey().get("kid").equals(header.path("kid").asText()))
        return Map.of("valid", false);
      Signature verifier = Signature.getInstance("Ed25519");
      verifier.initVerify(key().getPublic());
      verifier.update(utf(parts[0] + "." + parts[1]));
      boolean valid = verifier.verify(dec(parts[2]));
      var payload = api.json.readTree(dec(parts[1]));
      valid =
          valid
              && payload.path("exp").asLong() > Instant.now().getEpochSecond()
              && "urn:health-passport:synthetic-local".equals(payload.path("iss").asText());
      return Map.of(
          "valid",
          valid,
          "meaning",
          "Local signature integrity and expiry only; not clinical validation.");
    } catch (Exception e) {
      return Map.of("valid", false);
    }
  }
}
