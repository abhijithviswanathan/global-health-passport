package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/organization")
public class OrganizationApi {
  final PassportApi api;

  OrganizationApi(PassportApi api) {
    this.api = api;
  }

  @PostConstruct
  void syntheticVerification() {
    if (!api.demo) return;
    for (var u :
        api.db.queryForList(
            "select id from app_user where role in ('doctor','lab','pharmacy') and"
                + " organization='Northstar Demo Network' and display_name like '%(Synthetic)%'")) {
      String uid = u.get("id").toString();
      if (api.db.queryForObject(
              "select count(*) from practitioner_verification where user_id=?", Integer.class, uid)
          == 0)
        api.db.update(
            "insert into practitioner_verification values(?,?,?,?,?)",
            uid,
            "synthetic_verified",
            "Synthetic fixture only; no professional credential attested",
            now(),
            null);
    }
  }

  Map<String, Object> administrator(HttpServletRequest r) {
    var u = api.user(r);
    if (!api.role(u).equals("admin")) throw error(403, "Organization administrator required");
    return u;
  }

  @GetMapping("/members")
  List<Map<String, Object>> members(HttpServletRequest r) {
    var admin = administrator(r);
    return api
        .db
        .queryForList(
            "select u.id,u.display_name as"
                + " name,u.username,u.role,u.organization,coalesce(v.status,'unverified') as"
                + " verification_status,v.evidence_reference,v.verified_at from app_user u left"
                + " join practitioner_verification v on v.user_id=u.id where u.organization=? and"
                + " u.role in ('doctor','lab','pharmacy') order by u.display_name",
            admin.get("organization"))
        .stream()
        .map(this::view)
        .toList();
  }

  Map<String, Object> view(Map<String, Object> row) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (String k : List.of("id", "name", "username", "role", "organization"))
      out.put(k, row.get(k));
    out.put("verificationStatus", row.get("verification_status"));
    out.put("evidenceReference", row.get("evidence_reference"));
    out.put("verifiedAt", row.get("verified_at"));
    return out;
  }

  @PostMapping("/members/{memberId}/verification")
  Map<String, Object> verify(
      @PathVariable String memberId, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var admin = administrator(r);
    String status = api.field(b, "status", 30), evidence = api.field(b, "evidenceReference", 300);
    if (!Set.of("verified", "suspended").contains(status))
      throw error(400, "Invalid verification status");
    api.tx.executeWithoutResult(
        tx -> {
          var found =
              api.db.queryForList(
                  "select id from app_user where id=? and organization=? and role in"
                      + " ('doctor','lab','pharmacy') for update",
                  memberId,
                  admin.get("organization"));
          if (found.isEmpty()) throw error(404, "Organization member not found");
          api.db.update("delete from practitioner_verification where user_id=?", memberId);
          api.db.update(
              "insert into practitioner_verification values(?,?,?,?,?)",
              memberId,
              status,
              evidence,
              now(),
              api.uid(admin));
          if (status.equals("suspended")) {
            api.db.update("update identity_session set revoked=true where user_id=?", memberId);
            api.db.update(
                "update consent set status='revoked' where grantee_id=? and status='active'",
                memberId);
            api.db.update("delete from passkey_challenge where user_id=?", memberId);
          }
          api.audit(
              api.uid(admin),
              null,
              status.equals("verified") ? "PRACTITIONER_VERIFIED" : "PRACTITIONER_SUSPENDED",
              memberId);
        });
    return members(r).stream().filter(x -> memberId.equals(x.get("id"))).findFirst().orElseThrow();
  }
}
