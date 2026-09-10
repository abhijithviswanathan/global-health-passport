package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class IdentityApi {
  final PassportApi api;
  final IdentityService identity;

  IdentityApi(PassportApi api, IdentityService identity) {
    this.api = api;
    this.identity = identity;
  }

  @PostMapping("/auth/register")
  Map<String, Object> register(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    if (!api.demo) throw error(403, "Registration is limited to synthetic development");
    identity.limit("register:" + r.getRemoteAddr());
    String username = api.field(b, "username", 80),
        name = api.field(b, "displayName", 120),
        password = api.field(b, "password", 200);
    if (!username.matches("[a-z][a-z0-9._-]{2,79}")
        || (password.length() < 12 || password.getBytes(StandardCharsets.UTF_8).length > 72))
      throw error(400, "Use a valid username and at least 12 password characters");
    String uid = id();
    String hash = api.passwords.encode(password);
    for (int attempt = 0; attempt < 10; attempt++) {
      String health = HealthIds.generate();
      try {
        identity.tx.executeWithoutResult(
            s -> {
              api.db.update(
                  "insert into"
                      + " app_user(id,username,display_name,role,password_hash,health_id,organization)"
                      + " values(?,?,?,?,?,?,?)",
                  uid,
                  username,
                  name + " (Synthetic)",
                  "patient",
                  hash,
                  health,
                  "Synthetic self-registration");
              api.audit(uid, uid, "PATIENT_REGISTERED", health);
            });
        return Map.of("healthId", health, "username", username, "synthetic", true);
      } catch (DuplicateKeyException e) {
        // Retry a random Health ID collision in a fresh transaction (including PostgreSQL).
        if (api.db.queryForObject(
                "select count(*) from app_user where username=?", Integer.class, username)
            > 0) throw error(409, "Registration could not be completed");
      }
    }
    throw error(503, "Unable to allocate a Health ID. Please retry.");
  }

  @GetMapping("/security/status")
  Map<String, Object> status(HttpServletRequest r) {
    var u = api.user(r);
    return Map.of(
        "totpEnabled",
        identity.enabled(api.uid(u)),
        "passkeysAvailable",
        true,
        "recoveryCodesRemaining",
        api.db.queryForObject(
            "select count(*) from recovery_code where user_id=?", Integer.class, api.uid(u)));
  }

  @PostMapping("/security/totp/setup")
  Map<String, Object> setup(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = api.user(r);
    String uid = api.uid(u);
    identity.limit("setup:" + uid);
    if (identity.enabled(uid)) throw error(409, "A second factor is already enrolled");
    if (!api.matchesPassword(api.field(b, "password", 200), u.get("password_hash").toString()))
      throw error(401, "Reauthentication failed");
    byte[] secret = new byte[20];
    new SecureRandom().nextBytes(secret);
    String encrypted = identity.encrypt(secret);
    identity.tx.executeWithoutResult(
        s -> {
          api.db.update("delete from identity_mfa where user_id=? and enabled=false", uid);
          api.db.update(
              "insert into identity_mfa(user_id,encrypted_secret,enabled,last_step,created_at)"
                  + " values(?,?,false,-1,?)",
              uid,
              encrypted,
              now());
          api.audit(uid, null, "MFA_ENROLLMENT_STARTED", uid);
        });
    String encoded = IdentityService.base32(secret),
        label = URLEncoder.encode("Health Passport:" + u.get("username"), StandardCharsets.UTF_8);
    return Map.of(
        "secret",
        encoded,
        "otpauthUri",
        "otpauth://totp/"
            + label
            + "?secret="
            + encoded
            + "&issuer=Health%20Passport&algorithm=SHA1&digits=6&period=30",
        "expiresInSeconds",
        600);
  }

  @PostMapping("/security/totp/confirm")
  Map<String, Object> confirm(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = api.user(r);
    String uid = api.uid(u);
    identity.limit("confirm:" + uid);
    var rows =
        api.db.queryForList("select * from identity_mfa where user_id=? and enabled=false", uid);
    if (rows.isEmpty()
        || Instant.parse(rows.getFirst().get("created_at").toString())
            .isBefore(Instant.now().minusSeconds(600))) throw error(400, "Start a new enrollment");
    identity.verify(uid, api.field(b, "otp", 6));
    List<String> codes = new ArrayList<>();
    identity.tx.executeWithoutResult(
        s -> {
          int changed =
              api.db.update(
                  "update identity_mfa set enabled=true where user_id=? and enabled=false", uid);
          if (changed != 1) throw error(409, "Enrollment changed");
          api.db.update("delete from recovery_code where user_id=?", uid);
          for (int i = 0; i < 8; i++) {
            String code = token();
            codes.add(code);
            api.db.update(
                "insert into recovery_code(code_hash,user_id) values(?,?)",
                IdentityService.hash(code),
                uid);
          }
          api.db.update(
              "update identity_session set revoked=true where user_id=? and session_hash<>?",
              uid,
              IdentityService.hash(r.getSession().getId()));
          api.audit(uid, null, "MFA_ENABLED", uid);
        });
    return Map.of(
        "recoveryCodes",
        codes,
        "notice",
        "Save these once. A recovery code resets your password and second factor and revokes all"
            + " sessions.");
  }

  @GetMapping("/security/sessions")
  List<Map<String, Object>> sessions(HttpServletRequest r) {
    String uid = api.uid(api.user(r));
    return api.db.queryForList(
        "select id,created_at,expires_at,revoked,device_label from identity_session where user_id=?"
            + " order by created_at desc",
        uid);
  }

  @PostMapping("/security/sessions/{sessionId}/revoke")
  Map<String, Object> revoke(@PathVariable String sessionId, HttpServletRequest r) {
    api.csrf(r);
    String uid = api.uid(api.user(r));
    int count =
        api.db.update(
            "update identity_session set revoked=true where id=? and user_id=?", sessionId, uid);
    if (count != 1) throw error(404, "Session not found");
    api.audit(uid, null, "SESSION_REVOKED", sessionId);
    return Map.of("ok", true);
  }

  @PostMapping("/auth/recover")
  Map<String, Object> recover(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    String username = api.field(b, "username", 80),
        code = api.field(b, "recoveryCode", 100),
        password = api.field(b, "newPassword", 200);
    identity.limit("recover:" + r.getRemoteAddr() + ":" + username);
    if ((password.length() < 12 || password.getBytes(StandardCharsets.UTF_8).length > 72))
      throw error(400, "Password must contain at least 12 characters");
    String hash = api.passwords.encode(password);
    var u = api.byUsername(username);
    if (u == null) throw error(401, "Recovery failed");
    String uid = api.uid(u);
    identity.tx.executeWithoutResult(
        s -> {
          int consumed =
              api.db.update(
                  "delete from recovery_code where code_hash=? and user_id=?",
                  IdentityService.hash(code),
                  uid);
          if (consumed != 1) throw error(401, "Recovery failed");
          api.db.update("update app_user set password_hash=? where id=?", hash, uid);
          api.db.update("delete from recovery_code where user_id=?", uid);
          api.db.update("delete from identity_mfa where user_id=?", uid);
          api.db.update("delete from passkey_credential where user_id=?", uid);
          api.db.update("delete from passkey_challenge where user_id=?", uid);
          api.db.update("update identity_session set revoked=true where user_id=?", uid);
          api.audit(uid, null, "ACCOUNT_RECOVERED", uid);
        });
    return Map.of(
        "ok", true, "message", "Sign in with the new password and enroll a new second factor.");
  }
}
