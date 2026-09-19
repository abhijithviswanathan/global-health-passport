/**
 * Thin HTTP adapter for passkey enrollment, sign-in and revocation.
 * PasskeyService owns the challenge lifecycle and WebAuthn verification; the browser
 * only transports credential data and does not decide whether authentication passed.
 */
package org.healthpassport;

import jakarta.servlet.http.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class PasskeyApi {
  final PassportApi api;
  final PasskeyService passkeys;

  PasskeyApi(PassportApi api, PasskeyService passkeys) {
    this.api = api;
    this.passkeys = passkeys;
  }

  @GetMapping("/passkeys")
  List<Map<String, Object>> list(HttpServletRequest r) {
    var u = api.user(r);
    return api.db.queryForList(
        "select id,created_at from passkey_credential where user_id=?", api.uid(u));
  }

  @PostMapping("/passkeys/register/options")
  Map<String, Object> start(@RequestBody Map<String, Object> b, HttpServletRequest r)
      throws Exception {
    api.csrf(r);
    return passkeys.registrationOptions(b, r);
  }

  @PostMapping("/passkeys/register/finish")
  Map<String, Object> finish(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    return passkeys.finishRegistration(b, r);
  }

  @PostMapping("/auth/passkey/options")
  Map<String, Object> options(@RequestBody Map<String, Object> b, HttpServletRequest r)
      throws Exception {
    api.csrf(r);
    return passkeys.authenticationOptions(b, r);
  }

  @PostMapping("/auth/passkey/finish")
  Map<String, Object> login(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    return passkeys.finishAuthentication(b, r);
  }

  @PostMapping("/passkeys/{id}/revoke")
  Map<String, Object> revoke(
      @PathVariable String id, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = api.user(r);
    if (!api.matchesPassword(api.field(b, "password", 200), u.get("password_hash").toString()))
      throw PassportApi.error(401, "Step-up authentication required");
    passkeys.identity.verifySecondFactor(api.uid(u), b);
    if (api.db.update("delete from passkey_credential where id=? and user_id=?", id, api.uid(u))
        != 1) throw PassportApi.error(404, "Credential not found");
    api.audit(api.uid(u), null, "PASSKEY_REVOKED", id);
    return Map.of("ok", true);
  }
}
