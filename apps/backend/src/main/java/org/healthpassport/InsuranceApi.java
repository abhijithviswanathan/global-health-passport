/**
 * Private insurance profiles, scoped sharing, eligibility and public plan browsing.
 * Keep encrypted identifiers and card documents separate from marketplace results.
 * canRead() evaluates insurance-specific permission; clinical consent alone is not
 * a substitute. Synthetic mode must not call a real eligibility gateway.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/insurance")
class InsuranceApi {
  final EcosystemApi eco;
  final PassportApi api;
  final EligibilityProvider provider;
  final DocumentService documents;

  InsuranceApi(
      EcosystemApi eco,
      DocumentService documents,
      org.springframework.core.env.Environment environment) {
    this.documents = documents;
    this.eco = eco;
    this.api = eco.api;
    String endpoint = environment.getProperty("ELIGIBILITY_GATEWAY_URL", "");
    if (api.demo && !endpoint.isBlank())
      throw new IllegalArgumentException(
          "Synthetic mode cannot contact a real eligibility gateway");
    this.provider =
        api.demo
            ? new EligibilityProvider.Synthetic()
            : endpoint.isBlank()
                ? new EligibilityProvider.Unconfigured()
                : new HttpEligibilityProvider(
                    endpoint, environment.getProperty("ELIGIBILITY_GATEWAY_TOKEN"), api.json);
  }

  Map<String, Object> patient(HttpServletRequest r) {
    var u = api.user(r);
    eco.roles(u, "patient");
    return u;
  }

  Map<String, Object> profile(String id) {
    var rows =
        api.db.queryForList("select * from insurance_profile where id=? and status='active'", id);
    if (rows.isEmpty()) throw error(404, "Insurance profile not found");
    return rows.getFirst();
  }

  // Insurance disclosure uses its own live share and allowed purpose/organization/recipient.
  boolean canRead(Map<String, Object> u, Map<String, Object> p) {
    if (api.role(u).equals("patient")) return api.uid(u).equals(p.get("patient_id"));
    if (!Set.of("admin", "billing", "doctor", "reception", "pharmacy").contains(api.role(u))
        || !eco.tenants.trusted(u)) return false;
    return api
        .db
        .queryForList(
            "select * from insurance_share where profile_id=? and organization_id=? and"
                + " status='active'",
            p.get("id"),
            eco.tenants.org(u))
        .stream()
        .anyMatch(
            s ->
                !TenantService.expired(s.get("expires_at"))
                    && (s.get("grantee_id") == null
                        || Objects.equals(s.get("grantee_id"), api.uid(u)))
                    && (s.get("department") == null
                        || Objects.equals(s.get("department"), u.get("department")))
                    && Set.of("eligibility", "billing", "treatment", "dispensing")
                        .contains(s.get("purpose")));
  }

  // List views redact private identifiers; the explicit reveal path performs additional work.
  Map<String, Object> visible(Map<String, Object> p) {
    var v = new LinkedHashMap<>(p);
    v.remove("encrypted_identifiers");
    v.put("identifiers", "Protected — reveal only when needed");
    return v;
  }

  @GetMapping("/profiles")
  List<Map<String, Object>> profiles(HttpServletRequest r) {
    var u = api.user(r);
    List<Map<String, Object>> rows;
    if (api.role(u).equals("patient"))
      rows =
          api.db.queryForList(
              "select * from insurance_profile where patient_id=? and status='active' order by"
                  + " coverage_order",
              api.uid(u));
    else {
      eco.roles(u, "admin", "billing", "doctor", "reception", "pharmacy");
      rows =
          api.db.queryForList(
              "select distinct p.* from insurance_profile p join insurance_share s on"
                  + " s.profile_id=p.id where s.organization_id=? and s.status='active' and"
                  + " p.status='active'",
              eco.tenants.org(u));
    }
    var out = rows.stream().filter(p -> canRead(u, p)).map(this::visible).toList();
    for (var p : out)
      api.audit(
          api.uid(u),
          p.get("patient_id").toString(),
          "INSURANCE_PROFILE_READ",
          p.get("id").toString());
    return out;
  }

  String date(Map<String, Object> b, String key) {
    String s = eco.opt(b, key, 10);
    if (s == null) return null;
    try {
      return LocalDate.parse(s).toString();
    } catch (Exception ex) {
      throw error(400, "Use YYYY-MM-DD for " + key);
    }
  }

  @PostMapping("/profiles")
  Map<String, Object> save(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = patient(r);
    return eco.atomic(
        () -> {
          String pid = eco.opt(b, "id", 36);
          Map<String, Object> old = null;
          if (pid != null) {
            old = profile(pid);
            if (!api.uid(u).equals(old.get("patient_id")))
              throw error(403, "Insurance owner required");
            eco.version(b, old);
          } else pid = id();
          String effective = date(b, "effectiveDate"),
              expiration = date(b, "expirationDate"),
              order = eco.field(b, "coverageOrder", 20);
          if (effective != null
              && expiration != null
              && LocalDate.parse(expiration).isBefore(LocalDate.parse(effective)))
            throw error(400, "Expiration must follow the effective date");
          if (!Set.of("primary", "secondary", "other").contains(order))
            throw error(400, "Invalid insurance order");
          String card = eco.opt(b, "cardDocumentId", 36);
          if (card != null
              && api.db.queryForObject(
                      "select count(*) from medical_document where id=? and patient_id=? and"
                          + " document_purpose='insurance'",
                      Integer.class,
                      card,
                      api.uid(u))
                  != 1) throw error(403, "Choose your own uploaded insurance card document");
          if (card != null)
            api.db.update(
                "update medical_document set document_purpose='insurance' where id=?", card);
          var ids = new LinkedHashMap<String, Object>();
          ids.put("memberId", eco.field(b, "memberId", 200));
          ids.put("groupId", Objects.toString(eco.opt(b, "groupId", 200), ""));
          ids.put("policyholder", eco.field(b, "policyholder", 200));
          String encrypted =
              api.identity.encrypt(api.provenance.encode(ids).getBytes(StandardCharsets.UTF_8));
          if (old == null)
            api.db.update(
                "insert into"
                    + " insurance_profile(id,patient_id,company,plan_name,encrypted_identifiers,relationship,effective_date,expiration_date,coverage_order,card_document_id,coverage_summary,created_at,updated_at)"
                    + " values(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                pid,
                api.uid(u),
                eco.field(b, "company", 160),
                eco.field(b, "plan", 160),
                encrypted,
                eco.field(b, "relationship", 40),
                effective,
                expiration,
                order,
                card,
                eco.opt(b, "coverageSummary", 4000),
                now(),
                now());
          else
            api.db.update(
                "update insurance_profile set"
                    + " company=?,plan_name=?,encrypted_identifiers=?,relationship=?,effective_date=?,expiration_date=?,coverage_order=?,card_document_id=?,coverage_summary=?,updated_at=?,version=version+1"
                    + " where id=?",
                eco.field(b, "company", 160),
                eco.field(b, "plan", 160),
                encrypted,
                eco.field(b, "relationship", 40),
                effective,
                expiration,
                order,
                card,
                eco.opt(b, "coverageSummary", 4000),
                now(),
                pid);
          api.audit(
              api.uid(u), api.uid(u), old == null ? "INSURANCE_ADDED" : "INSURANCE_CHANGED", pid);
          return visible(profile(pid));
        });
  }

  @GetMapping("/profiles/{pid}/identifiers")
  Map<String, Object> identifiers(@PathVariable String pid, HttpServletRequest r) {
    var u = api.user(r);
    var p = profile(pid);
    if (!canRead(u, p)) throw error(403, "Insurance sharing permission required");
    api.audit(api.uid(u), p.get("patient_id").toString(), "INSURANCE_IDENTIFIERS_REVEALED", pid);
    try {
      return api.json.readValue(
          api.identity.decrypt(p.get("encrypted_identifiers").toString()),
          new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
    } catch (Exception ex) {
      throw error(503, "Unable to decrypt insurance identifiers");
    }
  }

  @GetMapping("/shares")
  List<Map<String, Object>> shares(HttpServletRequest r) {
    var u = patient(r);
    return api.db.queryForList(
        "select s.*,o.name as organization_name,u.display_name as grantee_name from insurance_share"
            + " s join healthcare_organization o on s.organization_id=o.id left join app_user u on"
            + " s.grantee_id=u.id where s.patient_id=? order by s.created_at desc",
        api.uid(u));
  }

  @PostMapping("/shares")
  Map<String, Object> share(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = patient(r);
    var p = profile(eco.field(b, "profileId", 36));
    if (!api.uid(u).equals(p.get("patient_id"))) throw error(403, "Insurance owner required");
    String oid = eco.field(b, "organizationId", 36),
        grantee = eco.opt(b, "granteeId", 36),
        department = eco.opt(b, "department", 100),
        purpose = eco.field(b, "purpose", 40),
        expires = eco.instant(b, "expiresAt", true);
    if (!Set.of("eligibility", "billing", "treatment", "dispensing").contains(purpose)
        || TenantService.expired(expires))
      throw error(400, "Use a valid purpose and future expiry");
    if (api.db.queryForObject(
            "select count(*) from healthcare_organization where id=? and type<>'insurer' and status"
                + " in ('verified','synthetic_verified')",
            Integer.class,
            oid)
        != 1) throw error(403, "Choose a verified care organization");
    if (grantee != null
        && api.db.queryForObject(
                "select count(*) from app_user where id=? and organization_id=? and"
                    + " staff_active=true and role in"
                    + " ('doctor','billing','pharmacy','reception','admin')",
                Integer.class,
                grantee,
                oid)
            != 1) throw error(403, "Selected staff member is not eligible in this organization");
    return eco.atomic(
        () -> {
          String sid = id();
          api.db.update(
              "insert into insurance_share values(?,?,?,?,?,?,?,?,'active',?)",
              sid,
              p.get("id"),
              api.uid(u),
              oid,
              grantee,
              department,
              purpose,
              expires,
              now());
          api.audit(api.uid(u), api.uid(u), "INSURANCE_SHARED", sid);
          return Map.of("id", sid, "status", "active");
        });
  }

  @PostMapping("/shares/{sid}/revoke")
  Map<String, Object> revoke(@PathVariable String sid, HttpServletRequest r) {
    api.csrf(r);
    var u = patient(r);
    int n =
        api.db.update(
            "update insurance_share set status='revoked' where id=? and patient_id=? and"
                + " status='active'",
            sid,
            api.uid(u));
    if (n != 1) throw error(404, "Active insurance share not found");
    api.audit(api.uid(u), api.uid(u), "INSURANCE_SHARE_REVOKED", sid);
    return Map.of("status", "revoked");
  }

  @PostMapping("/profiles/{pid}/eligibility")
  Map<String, Object> eligibility(
      @PathVariable String pid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = eco.staff(r);
    eco.roles(u, "billing", "admin", "reception");
    var p = profile(pid);
    if (!canRead(u, p)) throw error(403, "Insurance sharing permission required");
    boolean eligibilityGrant =
        api
            .db
            .queryForList(
                "select * from insurance_share where profile_id=? and organization_id=? and"
                    + " purpose='eligibility' and status='active'",
                pid,
                eco.tenants.org(u))
            .stream()
            .anyMatch(
                s ->
                    !TenantService.expired(s.get("expires_at"))
                        && (s.get("grantee_id") == null || api.uid(u).equals(s.get("grantee_id")))
                        && (s.get("department") == null
                            || Objects.equals(s.get("department"), u.get("department"))));
    if (!eligibilityGrant)
      throw error(403, "An eligibility-specific patient permission is required");
    return eco.atomic(
        () -> {
          String key = eco.field(b, "requestKey", 100);
          var previous =
              api.db.queryForList(
                  "select * from eligibility_check where requester_id=? and request_key=?",
                  api.uid(u),
                  key);
          if (!previous.isEmpty()) {
            if (!pid.equals(previous.getFirst().get("profile_id")))
              throw error(409, "Submission key already used");
            return previous.getFirst();
          }
          Map<String, Object> ids = identifiers(pid, r);
          var result =
              provider.verify(
                  new EligibilityProvider.Request(
                      p.get("company").toString(),
                      p.get("plan_name").toString(),
                      ids,
                      (String) p.get("effective_date"),
                      (String) p.get("expiration_date")));
          if (!canRead(u, p)) throw error(403, "Insurance permission expired");
          String cid = id();
          api.db.update(
              "insert into eligibility_check values(?,?,?,?,?,?,?,?,?,?)",
              cid,
              pid,
              eco.tenants.org(u),
              api.uid(u),
              provider.name(),
              result.status(),
              result.synthetic(),
              result.summary(),
              now(),
              key);
          eco.event(
              u,
              "eligibility",
              cid,
              "eligibility_checked",
              null,
              Map.of("status", result.status(), "synthetic", result.synthetic()),
              "routine",
              p.get("patient_id").toString());
          return api.db.queryForMap("select * from eligibility_check where id=?", cid);
        });
  }

  @GetMapping("/eligibility")
  List<Map<String, Object>> checks(HttpServletRequest r) {
    var u = api.user(r);
    var rows =
        api.role(u).equals("patient")
            ? api.db.queryForList(
                "select c.* from eligibility_check c join insurance_profile p on c.profile_id=p.id"
                    + " where p.patient_id=? order by checked_at desc",
                api.uid(u))
            : api.db.queryForList(
                "select * from eligibility_check where organization_id=? order by checked_at desc",
                eco.tenants.org(u));
    return rows.stream()
        .filter(
            c -> {
              try {
                return canRead(u, profile(c.get("profile_id").toString()));
              } catch (Exception ex) {
                return false;
              }
            })
        .toList();
  }

  @GetMapping("/marketplace")
  Map<String, Object> marketplace(
      @RequestParam(defaultValue = "premium") String sort,
      @RequestParam(defaultValue = "") String region,
      HttpServletRequest r) {
    api.user(r);
    String column =
        switch (sort) {
          case "deductible" -> "deductible";
          case "out_of_pocket" -> "out_of_pocket";
          case "name" -> "name";
          default -> "monthly_premium";
        };
    var plans =
        api
            .db
            .queryForList(
                "select p.*,o.name as company from insurance_plan p join healthcare_organization o"
                    + " on p.organization_id=o.id where p.status='approved' and o.status in"
                    + " ('verified','synthetic_verified') order by p."
                    + column
                    + ",p.id")
            .stream()
            .filter(
                p ->
                    region.isBlank()
                        || p.get("region")
                            .toString()
                            .toLowerCase(Locale.ROOT)
                            .contains(region.toLowerCase(Locale.ROOT)))
            .toList();
    return Map.of(
        "organic",
        plans.stream().filter(p -> !Boolean.TRUE.equals(p.get("sponsored"))).toList(),
        "sponsored",
        plans.stream()
            .filter(
                p ->
                    Boolean.TRUE.equals(p.get("sponsored"))
                        && Boolean.TRUE.equals(p.get("sponsorship_enabled")))
            .toList(),
        "ranking",
        "Sorted only by your selected objective field. Clinical data is not used.",
        "sponsorship",
        "Paid placement is disabled unless separately approved through legal and commercial"
            + " review.");
  }

  BigDecimal money(Map<String, Object> b, String k) {
    try {
      var n = new BigDecimal(b.get(k).toString());
      if (n.signum() < 0 || n.scale() > 2 || n.compareTo(new BigDecimal("99999999")) > 0)
        throw new Exception();
      return n;
    } catch (Exception ex) {
      throw error(400, "Use a non-negative currency amount for " + k);
    }
  }

  @GetMapping("/plans")
  List<Map<String, Object>> plans(HttpServletRequest r) {
    var u = eco.staff(r);
    if (eco.tenants.operator(u))
      return api.db.queryForList("select * from insurance_plan order by created_at desc");
    eco.roles(u, "insurer");
    return api.db.queryForList(
        "select * from insurance_plan where organization_id=? order by created_at desc",
        eco.tenants.org(u));
  }

  @PostMapping("/plans")
  Map<String, Object> plan(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = eco.staff(r);
    eco.roles(u, "insurer");
    if (!eco.tenants.trusted(u)) throw error(403, "Insurer organization verification required");
    String url = eco.opt(b, "documentsUrl", 1000);
    if (url != null && !url.startsWith("https://"))
      throw error(400, "Plan documents must use HTTPS");
    return eco.atomic(
        () -> {
          String pid = eco.opt(b, "id", 36);
          if (pid != null) {
            var old = eco.row("insurance_plan", pid, u);
            eco.version(b, old);
            api.db.update(
                "update insurance_plan set status='superseded',updated_at=?,version=version+1 where"
                    + " id=?",
                now(),
                pid);
          }
          String nid = id();
          api.db.update(
              "insert into"
                  + " insurance_plan(id,organization_id,name,region,network_type,currency,monthly_premium,deductible,copay,coinsurance,out_of_pocket,coverage,eligibility,documents_url,status,synthetic,created_at,updated_at)"
                  + " values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?)",
              nid,
              eco.tenants.org(u),
              eco.field(b, "name", 160),
              eco.field(b, "region", 120),
              eco.field(b, "networkType", 40),
              eco.field(b, "currency", 3),
              money(b, "monthlyPremium"),
              money(b, "deductible"),
              eco.field(b, "copay", 200),
              eco.field(b, "coinsurance", 200),
              money(b, "outOfPocket"),
              eco.field(b, "coverage", 8000),
              eco.field(b, "eligibility", 4000),
              url,
              api.demo,
              now(),
              now());
          eco.event(
              u, "plan", nid, "marketplace_plan_submitted", null, Map.of("status", "pending"));
          return eco.row("insurance_plan", nid, u);
        });
  }

  @PostMapping("/plans/{pid}/review")
  Map<String, Object> review(
      @PathVariable String pid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = eco.staff(r);
    eco.operator(u);
    String status = eco.field(b, "status", 20);
    if (!Set.of("approved", "rejected").contains(status)) throw error(400, "Invalid review state");
    return eco.atomic(
        () -> {
          var old = api.db.queryForMap("select * from insurance_plan where id=?", pid);
          eco.version(b, old);
          if (Boolean.TRUE.equals(b.get("sponsored")))
            throw error(403, "Sponsored placements remain disabled pending legal approval");
          api.db.update(
              "update insurance_plan set"
                  + " status=?,reviewed_by=?,review_reason=?,updated_at=?,version=version+1 where"
                  + " id=?",
              status,
              api.uid(u),
              eco.field(b, "reason", 1000),
              now(),
              pid);
          var actor = new LinkedHashMap<>(u);
          actor.put("organization_id", old.get("organization_id"));
          eco.event(
              actor, "plan", pid, "marketplace_plan_reviewed", null, Map.of("status", status));
          return api.db.queryForMap("select * from insurance_plan where id=?", pid);
        });
  }

  @GetMapping("/cards")
  List<Map<String, Object>> cards(HttpServletRequest r) {
    var u = patient(r);
    return api.db.queryForList(
        "select id,filename as name,status,created_at from medical_document where patient_id=? and"
            + " document_purpose='insurance' order by created_at desc",
        api.uid(u));
  }

  @PostMapping(value = "/cards", consumes = "multipart/form-data")
  Map<String, Object> uploadCard(
      @RequestPart("file") org.springframework.web.multipart.MultipartFile file,
      HttpServletRequest r) {
    api.csrf(r);
    var u = patient(r);
    return eco.atomic(
        () -> {
          var m =
              documents.upload(
                  api.uid(u), api.uid(u), "Patient insurance card", file, () -> patient(r));
          api.db.update(
              "update medical_document set document_purpose='insurance' where id=?", m.get("id"));
          api.audit(api.uid(u), api.uid(u), "INSURANCE_CARD_UPLOADED", m.get("id").toString());
          return Map.of("id", m.get("id"), "name", m.get("filename"), "status", m.get("status"));
        });
  }

  @GetMapping("/profiles/{pid}/card")
  org.springframework.http.ResponseEntity<byte[]> card(
      @PathVariable String pid, HttpServletRequest r) {
    var u = api.user(r);
    var p = profile(pid);
    if (!canRead(u, p)) throw error(403, "Insurance sharing permission required");
    if (p.get("card_document_id") == null) throw error(404, "No insurance card attached");
    var m = documents.metadata(p.get("card_document_id").toString());
    byte[] bytes = documents.download(m);
    if (!canRead(api.user(r), p)) throw error(403, "Insurance permission expired");
    api.audit(api.uid(u), p.get("patient_id").toString(), "INSURANCE_CARD_READ", pid);
    return org.springframework.http.ResponseEntity.ok()
        .header("Cache-Control", "no-store, private")
        .header("Content-Disposition", "attachment; filename=insurance-card")
        .header("X-Content-Type-Options", "nosniff")
        .contentType(
            org.springframework.http.MediaType.parseMediaType(m.get("media_type").toString()))
        .body(bytes);
  }

  @GetMapping("/profiles/{pid}/card-image")
  Map<String, Object> cardImage(@PathVariable String pid, HttpServletRequest r) {
    var result = card(pid, r);
    if (result.getHeaders().getContentType() == null
        || !result.getHeaders().getContentType().getType().equals("image"))
      throw error(400, "This card is a PDF; use the authorized download in the web portal");
    return Map.of(
        "dataUri",
        "data:"
            + result.getHeaders().getContentType()
            + ";base64,"
            + Base64.getEncoder().encodeToString(result.getBody()));
  }
}
