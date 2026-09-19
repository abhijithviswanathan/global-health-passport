/**
 * WebAuthn ceremony handling and credential repository for the Yubico library.
 * Challenges are bound to a session and ceremony. The configured relying-party ID
 * and exact origins must match the frontend; weakening them is not a deployment fix.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import com.yubico.webauthn.*;
import com.yubico.webauthn.data.*;
import jakarta.servlet.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class PasskeyService implements CredentialRepository {
  final PassportApi api;
  final IdentityService identity;
  final RelyingParty rp;

  PasskeyService(
      PassportApi api,
      IdentityService identity,
      @Value("${WEBAUTHN_RP_ID:localhost}") String rpId,
      @Value("${WEBAUTHN_ORIGINS:http://localhost:5173}") String origins) {
    this.api = api;
    this.identity = identity;
    rp =
        RelyingParty.builder()
            .identity(RelyingPartyIdentity.builder().id(rpId).name("Health Passport").build())
            .credentialRepository(this)
            .origins(Set.of(origins.split(",")))
            .allowOriginPort(false)
            .allowOriginSubdomain(false)
            .build();
  }

  ByteArray bytes(String s) {
    return new ByteArray(s.getBytes(StandardCharsets.UTF_8));
  }

  ByteArray decode(String s) {
    try {
      return ByteArray.fromBase64Url(s);
    } catch (Exception e) {
      throw error(400, "Invalid passkey encoding");
    }
  }

  public Set<PublicKeyCredentialDescriptor> getCredentialIdsForUsername(String username) {
    Set<PublicKeyCredentialDescriptor> out = new HashSet<>();
    for (var r :
        api.db.queryForList(
            "select p.credential_id from passkey_credential p join app_user u on p.user_id=u.id"
                + " where u.username=?",
            username))
      out.add(
          PublicKeyCredentialDescriptor.builder()
              .id(decode(r.get("credential_id").toString()))
              .build());
    return out;
  }

  public Optional<ByteArray> getUserHandleForUsername(String username) {
    var u = api.byUsername(username);
    return u == null ? Optional.empty() : Optional.of(bytes(api.uid(u)));
  }

  public Optional<String> getUsernameForUserHandle(ByteArray handle) {
    var rows =
        api.db.queryForList(
            "select username from app_user where id=?",
            new String(handle.getBytes(), StandardCharsets.UTF_8));
    return rows.isEmpty()
        ? Optional.empty()
        : Optional.of(rows.getFirst().get("username").toString());
  }

  RegisteredCredential registered(Map<String, Object> r) {
    return RegisteredCredential.builder()
        .credentialId(decode(r.get("credential_id").toString()))
        .userHandle(bytes(r.get("user_id").toString()))
        .publicKeyCose(decode(r.get("public_key").toString()))
        .signatureCount(((Number) r.get("signature_count")).longValue())
        .build();
  }

  public Optional<RegisteredCredential> lookup(ByteArray credentialId, ByteArray userHandle) {
    var rows =
        api.db.queryForList(
            "select * from passkey_credential where credential_id=? and user_id=?",
            credentialId.getBase64Url(),
            new String(userHandle.getBytes(), StandardCharsets.UTF_8));
    return rows.isEmpty() ? Optional.empty() : Optional.of(registered(rows.getFirst()));
  }

  public Set<RegisteredCredential> lookupAll(ByteArray credentialId) {
    Set<RegisteredCredential> out = new HashSet<>();
    api.db
        .queryForList(
            "select * from passkey_credential where credential_id=?", credentialId.getBase64Url())
        .forEach(r -> out.add(registered(r)));
    return out;
  }

  Map<String, Object> save(
      String user, String purpose, String serialized, String browserJson, HttpServletRequest r)
      throws Exception {
    String request = id();
    api.db.update(
        "insert into passkey_challenge values(?,?,?,?,?,?,false)",
        request,
        user,
        purpose,
        IdentityService.hash(r.getSession().getId()),
        serialized,
        Instant.now().plusSeconds(180).toString());
    return Map.of(
        "requestId", request, "publicKey", api.json.readTree(browserJson).get("publicKey"));
  }

  // Consume a challenge only for its expected ceremony/session. Preserve expiry and replay checks.
  Map<String, Object> consume(String request, String purpose, HttpServletRequest r) {
    return api.tx.execute(
        s -> {
          var rows =
              api.db.queryForList("select * from passkey_challenge where id=? for update", request);
          if (rows.isEmpty()) throw error(401, "Passkey request expired or invalid");
          var row = rows.getFirst();
          if (Boolean.TRUE.equals(row.get("used"))
              || !purpose.equals(row.get("purpose"))
              || !IdentityService.hash(r.getSession().getId()).equals(row.get("session_hash"))
              || !Instant.parse(row.get("expires_at").toString()).isAfter(Instant.now()))
            throw error(401, "Passkey request expired or invalid");
          api.db.update("update passkey_challenge set used=true where id=?", request);
          return row;
        });
  }

  Map<String, Object> registrationOptions(Map<String, Object> b, HttpServletRequest r)
      throws Exception {
    var u = api.user(r);
    identity.limit("passkey-enroll:" + api.uid(u));
    if (!api.matchesPassword(api.field(b, "password", 200), u.get("password_hash").toString()))
      throw error(401, "Step-up authentication required");
    identity.verifySecondFactor(api.uid(u), b);
    var request =
        rp.startRegistration(
            StartRegistrationOptions.builder()
                .user(
                    UserIdentity.builder()
                        .name(u.get("username").toString())
                        .displayName(u.get("display_name").toString())
                        .id(bytes(api.uid(u)))
                        .build())
                .authenticatorSelection(
                    AuthenticatorSelectionCriteria.builder()
                        .residentKey(ResidentKeyRequirement.PREFERRED)
                        .userVerification(UserVerificationRequirement.REQUIRED)
                        .build())
                .timeout(180000)
                .build());
    return save(api.uid(u), "registration", request.toJson(), request.toCredentialsCreateJson(), r);
  }

  synchronized Map<String, Object> finishRegistration(Map<String, Object> b, HttpServletRequest r) {
    var u = api.user(r);
    var saved = consume(api.field(b, "requestId", 36), "registration", r);
    if (!api.uid(u).equals(saved.get("user_id"))) throw error(403, "Credential owner mismatch");
    try {
      var request =
          PublicKeyCredentialCreationOptions.fromJson(saved.get("request_json").toString());
      var credential =
          PublicKeyCredential.parseRegistrationResponseJson(
              api.json.writeValueAsString(b.get("credential")));
      var result =
          rp.finishRegistration(
              FinishRegistrationOptions.builder().request(request).response(credential).build());
      String key = id();
      api.tx.executeWithoutResult(
          s -> {
            api.db.update(
                "insert into"
                    + " passkey_credential(id,user_id,credential_id,public_key,signature_count,created_at)"
                    + " values(?,?,?,?,?,?)",
                key,
                api.uid(u),
                result.getKeyId().getId().getBase64Url(),
                result.getPublicKeyCose().getBase64Url(),
                result.getSignatureCount(),
                now());
            api.audit(api.uid(u), null, "PASSKEY_ENROLLED", key);
          });
      return Map.of("id", key, "registered", true);
    } catch (Exception e) {
      api.audit(api.uid(u), null, "PASSKEY_ENROLLMENT_FAILED", "verification");
      throw error(401, "Passkey verification failed");
    }
  }

  Map<String, Object> authenticationOptions(Map<String, Object> b, HttpServletRequest r)
      throws Exception {
    String username = api.field(b, "username", 80);
    identity.limit("passkey-login:" + r.getRemoteAddr() + ":" + username);
    var u = api.byUsername(username);
    var request =
        rp.startAssertion(
            StartAssertionOptions.builder()
                .username(username)
                .userVerification(UserVerificationRequirement.REQUIRED)
                .timeout(180000)
                .build());
    return save(
        u == null ? null : api.uid(u),
        "authentication",
        request.toJson(),
        request.toCredentialsGetJson(),
        r);
  }

  synchronized Map<String, Object> finishAuthentication(
      Map<String, Object> b, HttpServletRequest r) {
    var saved = consume(api.field(b, "requestId", 36), "authentication", r);
    try {
      var request = AssertionRequest.fromJson(saved.get("request_json").toString());
      var credential =
          PublicKeyCredential.parseAssertionResponseJson(
              api.json.writeValueAsString(b.get("credential")));
      var result =
          rp.finishAssertion(
              FinishAssertionOptions.builder().request(request).response(credential).build());
      if (!result.isSuccess()) throw error(401, "Passkey verification failed");
      String userId = new String(result.getUserHandle().getBytes(), StandardCharsets.UTF_8);
      if (!userId.equals(saved.get("user_id"))) throw error(401, "Passkey owner mismatch");
      return api.tx.execute(
          status -> {
            var u = api.db.queryForMap("select * from app_user where id=? for update", userId);
            api.verifyPractitioner(u);
            var current =
                api.db.queryForList(
                    "select signature_count from passkey_credential where credential_id=? and"
                        + " user_id=? for update",
                    result.getCredentialId().getBase64Url(),
                    userId);
            if (current.isEmpty()) throw error(401, "Credential was revoked");
            long previous = ((Number) current.getFirst().get("signature_count")).longValue();
            if ((previous != 0 || result.getSignatureCount() != 0)
                && result.getSignatureCount() <= previous)
              throw error(401, "Credential counter did not advance");
            api.db.update(
                "update passkey_credential set signature_count=? where credential_id=? and"
                    + " user_id=?",
                result.getSignatureCount(),
                result.getCredentialId().getBase64Url(),
                userId);
            r.changeSessionId();
            r.getSession().setAttribute("uid", userId);
            identity.registerSession(userId, r);
            api.audit(userId, null, "PASSKEY_LOGIN", userId);
            return api.publicUser(u);
          });
    } catch (Exception e) {
      api.audit(null, null, "PASSKEY_LOGIN_FAILED", "verification");
      throw error(401, "Passkey verification failed");
    }
  }
}
