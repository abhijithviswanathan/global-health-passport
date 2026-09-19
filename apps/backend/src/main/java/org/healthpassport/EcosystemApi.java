/**
 * Organization onboarding, hierarchy, employment, shifts and public booking.
 * TenantService resolves stable organization/work identities; legacy organization
 * labels are not sufficient authorization. Shared forms are in ecosystem-model.ts.
 * Clinical orders and insurance live in separate controllers under this domain.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ecosystem")
class EcosystemApi {
  final PassportApi api;
  final TenantService tenants;
  final CareApi care;

  EcosystemApi(PassportApi api, TenantService tenants, CareApi care) {
    this.api = api;
    this.tenants = tenants;
    this.care = care;
  }

  @PostConstruct
  void adopt() {
    tenants.bootstrap(api.demo);
  }

  Map<String, Object> staff(HttpServletRequest r) {
    var u = api.user(r);
    tenants.org(u);
    return u;
  }

  void roles(Map<String, Object> u, String... roles) {
    if (!Set.of(roles).contains(api.role(u)))
      throw error(403, "Your work role does not permit this action");
  }

  void admin(Map<String, Object> u) {
    roles(u, "admin");
  }

  void operator(Map<String, Object> u) {
    if (!tenants.operator(u))
      throw error(403, "Independent platform organization reviewer required");
  }

  String field(Map<String, Object> b, String k, int n) {
    return api.field(b, k, n);
  }

  String opt(Map<String, Object> b, String k, int n) {
    return api.provenance.optional(b, k, n);
  }

  Map<String, Object> row(String table, String id, Map<String, Object> u) {
    if (!Set.of(
            "healthcare_organization",
            "employment",
            "organization_node",
            "workforce_shift",
            "clinical_order",
            "shift_handoff",
            "insurance_plan")
        .contains(table)) throw error(400, "Unknown resource");
    var rows =
        api.db.queryForList(
            "select * from "
                + table
                + " where id=? and "
                + (table.equals("healthcare_organization") ? "id" : "organization_id")
                + "=?",
            id,
            tenants.org(u));
    if (rows.isEmpty()) throw error(404, "Resource not found in your organization");
    return rows.getFirst();
  }

  void version(Map<String, Object> b, Map<String, Object> v) {
    care.version(b, v, "version");
  }

  String instant(Map<String, Object> b, String key, boolean required) {
    String s = opt(b, key, 40);
    if (s == null) {
      if (required) throw error(400, "Provide " + key);
      return null;
    }
    try {
      return OffsetDateTime.parse(s).toInstant().toString();
    } catch (Exception ex) {
      throw error(400, "Use a date and time with timezone for " + key);
    }
  }

  synchronized <T> T atomic(java.util.function.Supplier<T> fn) {
    synchronized (api) {
      return api.tx.execute(tx -> fn.get());
    }
  }

  void event(
      Map<String, Object> u, String type, String rid, String action, Object before, Object after) {
    event(u, type, rid, action, before, after, "routine", null);
  }

  void event(
      Map<String, Object> u,
      String type,
      String rid,
      String action,
      Object before,
      Object after,
      String severity,
      String patient) {
    api.db.update(
        "insert into"
            + " organization_event(id,organization_id,actor_id,patient_id,resource_type,resource_id,action,severity,created_at,previous_value,new_value)"
            + " values(?,?,?,?,?,?,?,?,?,?,?)",
        id(),
        tenants.org(u),
        api.uid(u),
        patient,
        type,
        rid,
        action,
        severity,
        now(),
        before == null ? null : api.provenance.encode(before),
        after == null ? null : api.provenance.encode(after));
    api.audit(api.uid(u), patient, "ORG_" + action.toUpperCase(), rid);
  }

  Map<String, Object> employmentView(Map<String, Object> e) {
    var v = new LinkedHashMap<>(e);
    v.remove("license_encrypted");
    v.put("license_present", e.get("license_encrypted") != null);
    return v;
  }

  @GetMapping("/workspace")
  Map<String, Object> workspace(HttpServletRequest r) {
    var u = staff(r);
    String oid = tenants.org(u);
    var out = new LinkedHashMap<String, Object>();
    out.put("organization", row("healthcare_organization", oid, u));
    out.put("employment", employmentView(tenants.employment(u)));
    out.put("professionalRoles", TenantService.ROLES);
    var catalog = new LinkedHashMap<String, List<String>>();
    TenantService.ROLES.forEach(
        (job, role) ->
            catalog.put(
                job,
                Arrays.stream(TenantService.defaults(role).split(","))
                    .filter(v -> !v.isBlank())
                    .toList()));
    out.put("privilegeCatalog", catalog);
    out.put(
        "nodes",
        api.db.queryForList(
            "select * from organization_node where organization_id=? and active=true order by"
                + " kind,name",
            oid));
    out.put(
        "staff",
        api
            .db
            .queryForList(
                "select e.*,u.display_name as name,u.role,u.department,u.clinic from employment e"
                    + " join app_user u on e.user_id=u.id where e.organization_id=? order by"
                    + " u.display_name",
                oid)
            .stream()
            .map(
                e -> {
                  var v = employmentView(e);
                  if (!api.role(u).equals("admin") && !api.uid(u).equals(e.get("user_id")))
                    for (String key :
                        List.of(
                            "license_present",
                            "license_jurisdiction",
                            "credential_until",
                            "credential_status",
                            "privileges",
                            "start_at",
                            "end_at")) v.remove(key);
                  return v;
                })
            .toList());
    out.put("shifts", shifts(r));
    out.put(
        "policy",
        api.db.queryForMap("select * from workforce_policy where organization_id=?", oid));
    out.put("canReviewOrganizations", tenants.operator(u));
    out.put("notices", notices(r));
    return out;
  }

  @GetMapping("/organizations")
  List<Map<String, Object>> organizations(HttpServletRequest r) {
    var u = api.user(r);
    if (tenants.operator(u))
      return api.db.queryForList("select * from healthcare_organization order by created_at desc");
    return api.db.queryForList(
        "select id,code,name,type,status from healthcare_organization where status in"
            + " ('verified','synthetic_verified') order by name");
  }

  @PostMapping("/onboard")
  Map<String, Object> onboard(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var actor = api.user(r);
    if (!api.role(actor).equals("patient") && !tenants.operator(actor))
      throw error(403, "Use a personal account or independent reviewer to start onboarding");
    String name = field(b, "name", 160),
        type = field(b, "type", 30),
        username = field(b, "adminUsername", 80),
        password = field(b, "password", 72);
    if (!Set.of(
            "group", "hospital", "clinic", "diagnostic_center", "laboratory", "pharmacy", "insurer")
        .contains(type)) throw error(400, "Invalid organization type");
    if (!username.matches("[a-z][a-z0-9._-]{2,79}")
        || password.length() < 12
        || password.getBytes(StandardCharsets.UTF_8).length > 72)
      throw error(400, "Use a unique administrator username and strong password");
    return atomic(
        () -> {
          if (api.byUsername(username) != null) throw error(409, "Username already used");
          String oid = id(), uid = id();
          api.db.update(
              "insert into"
                  + " healthcare_organization(id,code,legacy_key,name,type,status,created_by,created_at)"
                  + " values(?,?,?,?,?,'pending',?,?)",
              oid,
              "ORG-" + HealthIds.generate(),
              oid,
              name,
              type,
              api.uid(actor),
              now());
          api.db.update("insert into workforce_policy values(?,true,0)", oid);
          api.db.update(
              "insert into"
                  + " app_user(id,username,display_name,role,password_hash,organization,organization_id,clinic,department)"
                  + " values(?,?,?,?,?,?,?,?,?)",
              uid,
              username,
              field(b, "adminName", 150),
              type.equals("insurer") ? "insurer" : "admin",
              api.passwords.encode(password),
              oid,
              oid,
              "Main location",
              "Administration");
          var user = api.byUsername(username);
          tenants.enroll(
              user,
              type.equals("insurer") ? "insurer_manager" : "hospital_administrator",
              null,
              "unverified");
          event(
              user,
              "organization",
              oid,
              "onboarding_requested",
              null,
              Map.of("name", name, "status", "pending"));
          return Map.of(
              "organizationId",
              oid,
              "status",
              "pending",
              "adminUsername",
              username,
              "notice",
              "Independent verification is required before clinical privileges. Personal and work"
                  + " accounts remain separate.");
        });
  }

  @PostMapping("/organizations/{oid}/verify")
  Map<String, Object> verifyOrganization(
      @PathVariable String oid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    operator(u);
    String status = field(b, "status", 20), evidence = field(b, "evidence", 1000);
    if (!Set.of("verified", "suspended").contains(status)) throw error(400, "Invalid decision");
    return atomic(
        () -> {
          var old = api.db.queryForMap("select * from healthcare_organization where id=?", oid);
          if (Objects.equals(old.get("created_by"), api.uid(u)) && !api.demo)
            throw error(403, "A second reviewer must verify this organization");
          version(b, old);
          String group = opt(b, "parentId", 36);
          if (group != null) {
            if (group.equals(oid)
                || api.db.queryForObject(
                        "select count(*) from healthcare_organization where id=? and type='group'"
                            + " and status in ('verified','synthetic_verified')",
                        Integer.class,
                        group)
                    != 1
                || old.get("type").equals("group"))
              throw error(400, "Choose a verified parent healthcare group for this facility");
            api.db.update("update healthcare_organization set parent_id=? where id=?", group, oid);
          }
          api.db.update(
              "update healthcare_organization set"
                  + " status=?,evidence=?,verified_by=?,verified_at=?,version=version+1 where id=?",
              status,
              evidence,
              api.uid(u),
              now(),
              oid);
          if (status.equals("suspended"))
            api.db.update(
                "update identity_session set revoked=true where user_id in(select user_id from"
                    + " employment where organization_id=?)",
                oid);
          var auditUser = new LinkedHashMap<>(u);
          auditUser.put("organization_id", oid);
          event(
              auditUser,
              "organization",
              oid,
              "verification_changed",
              old,
              Map.of("status", status, "evidence", evidence));
          return api.db.queryForMap("select * from healthcare_organization where id=?", oid);
        });
  }

  @PostMapping("/nodes")
  Map<String, Object> node(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    admin(u);
    String kind = field(b, "kind", 30), parent = opt(b, "parentId", 36);
    if (!Set.of(
            "location",
            "department",
            "unit",
            "team",
            "specialty",
            "service",
            "hours",
            "lab_capability",
            "imaging_capability",
            "pharmacy_capability")
        .contains(kind)) throw error(400, "Invalid hierarchy item");
    if (parent != null) row("organization_node", parent, u);
    return atomic(
        () -> {
          String nid = id();
          api.db.update(
              "insert into organization_node(id,organization_id,parent_id,kind,name,details)"
                  + " values(?,?,?,?,?,?)",
              nid,
              tenants.org(u),
              parent,
              kind,
              field(b, "name", 120),
              field(b, "details", 4000));
          event(u, "node", nid, "configuration_created", null, b);
          return row("organization_node", nid, u);
        });
  }

  @PatchMapping("/nodes/{nid}")
  Map<String, Object> updateNode(
      @PathVariable String nid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    admin(u);
    return atomic(
        () -> {
          var old = row("organization_node", nid, u);
          version(b, old);
          boolean active = !Boolean.FALSE.equals(b.get("active"));
          if (!active
              && api.db.queryForObject(
                      "select count(*) from organization_node where parent_id=? and active=true",
                      Integer.class,
                      nid)
                  > 0) throw error(409, "Move or deactivate child items first");
          api.db.update(
              "update organization_node set name=?,details=?,active=?,version=version+1 where id=?",
              field(b, "name", 120),
              field(b, "details", 4000),
              active,
              nid);
          event(u, "node", nid, "configuration_updated", old, b);
          return row("organization_node", nid, u);
        });
  }

  @PostMapping("/invitations")
  Map<String, Object> invite(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    admin(u);
    if (!tenants.trusted(u)) throw error(403, "Organization verification required");
    String job = field(b, "professionalRole", 40);
    if (!TenantService.ROLES.containsKey(job) || job.equals("insurer_manager"))
      throw error(400, "Invalid healthcare work role");
    String raw = token(), iid = id();
    api.db.update(
        "insert into"
            + " staff_invitation(id,organization_id,token_hash,username,professional_role,department,expires_at,created_by,created_at)"
            + " values(?,?,?,?,?,?,?,?,?)",
        iid,
        tenants.org(u),
        IdentityService.hash(raw),
        field(b, "username", 80),
        job,
        field(b, "department", 100),
        Instant.now().plusSeconds(172800).toString(),
        api.uid(u),
        now());
    event(u, "invitation", iid, "staff_invited", null, Map.of("role", job));
    return Map.of(
        "id",
        iid,
        "invitationToken",
        raw,
        "notice",
        "Copy this invitation privately to the employee. It expires in 48 hours. No email has been"
            + " sent.");
  }

  // Invitation acceptance establishes employment through the server-controlled invitation context.
  @PostMapping("/invitations/accept")
  Map<String, Object> acceptInvite(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    String password = field(b, "password", 72);
    if (password.length() < 12 || password.getBytes(StandardCharsets.UTF_8).length > 72)
      throw error(400, "Use a strong password");
    return atomic(
        () -> {
          var rows =
              api.db.queryForList(
                  "select * from staff_invitation where token_hash=? and used_at is null for"
                      + " update",
                  IdentityService.hash(field(b, "invitationToken", 100)));
          if (rows.isEmpty() || TenantService.expired(rows.getFirst().get("expires_at")))
            throw error(400, "Invitation expired or already used");
          var inv = rows.getFirst();
          var org =
              api.db.queryForMap(
                  "select * from healthcare_organization where id=?", inv.get("organization_id"));
          if (!Set.of("verified", "synthetic_verified").contains(org.get("status")))
            throw error(403, "Organization verification required");
          if (api.byUsername(inv.get("username").toString()) != null)
            throw error(409, "Username already used");
          String uid = id(), role = TenantService.ROLES.get(inv.get("professional_role"));
          api.db.update(
              "insert into"
                  + " app_user(id,username,display_name,role,password_hash,organization,organization_id,clinic,department)"
                  + " values(?,?,?,?,?,?,?,?,?)",
              uid,
              inv.get("username"),
              field(b, "name", 150),
              role,
              api.passwords.encode(password),
              org.get("legacy_key"),
              org.get("id"),
              "Main location",
              inv.get("department"));
          var user = api.byUsername(inv.get("username").toString());
          tenants.enroll(user, inv.get("professional_role").toString(), null, "unverified");
          api.db.update("update staff_invitation set used_at=? where id=?", now(), inv.get("id"));
          event(user, "employment", uid, "invitation_accepted", null, Map.of("role", role));
          return Map.of(
              "username",
              inv.get("username"),
              "workId",
              tenants.employment(user).get("work_id"),
              "notice",
              "A work ID is not a password. Clinical credential verification and production MFA"
                  + " enrollment are required.");
        });
  }

  @PatchMapping("/employment/{eid}")
  Map<String, Object> employment(
      @PathVariable String eid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    admin(u);
    return atomic(
        () -> {
          var old = row("employment", eid, u);
          version(b, old);
          String status = field(b, "status", 20);
          if (!Set.of("active", "inactive", "terminated").contains(status))
            throw error(400, "Invalid employment state");
          String start = instant(b, "startAt", false);
          if (start == null) start = old.get("start_at").toString();
          String end = instant(b, "endAt", false),
              until = instant(b, "credentialUntil", false),
              node = opt(b, "nodeId", 36);
          if (end != null && !Instant.parse(end).isAfter(Instant.parse(start)))
            throw error(400, "Employment end must follow its start");
          if (node != null) row("organization_node", node, u);
          String job = field(b, "professionalRole", 40), base = TenantService.ROLES.get(job);
          if (base == null || base.equals("insurer"))
            throw error(400, "Unsupported healthcare role");
          String credential = field(b, "credentialStatus", 30);
          if (!Set.of("verified", "unverified", "suspended").contains(credential))
            throw error(400, "Invalid credential state");
          if (credential.equals("verified")
              && TenantService.CLINICAL.contains(base)
              && (until == null || TenantService.expired(until)))
            throw error(400, "Verified clinical credentials require a future expiration");
          String license = opt(b, "license", 200), evidence = field(b, "evidence", 1000);
          String uid = old.get("user_id").toString();
          if (uid.equals(api.uid(u)) && (!base.equals("admin") || !status.equals("active")))
            throw error(409, "Another administrator must change your own access");
          String privileges = TenantService.defaults(base);
          var requested = care.strings(b, "privileges", 100);
          if (b.containsKey("privileges")) {
            if (!Arrays.asList(privileges.split(",")).containsAll(requested))
              throw error(400, "Privileges exceed this professional role");
            privileges = String.join(",", requested);
          }
          api.db.update(
              "update employment set"
                  + " professional_role=?,node_id=?,start_at=?,end_at=?,credential_until=?,license_encrypted=?,license_jurisdiction=?,specialty=?,credential_status=?,privileges=?,status=?,version=version+1"
                  + " where id=?",
              job,
              node,
              start,
              end,
              until,
              license == null
                  ? old.get("license_encrypted")
                  : api.identity.encrypt(license.getBytes(StandardCharsets.UTF_8)),
              opt(b, "jurisdiction", 100),
              opt(b, "specialty", 100),
              credential,
              privileges,
              status,
              eid);
          api.db.update(
              "update app_user set role=?,department=?,staff_active=?,staff_version=staff_version+1"
                  + " where id=?",
              base,
              field(b, "department", 100),
              status.equals("active"),
              uid);
          api.db.update("delete from practitioner_verification where user_id=?", uid);
          if (TenantService.CLINICAL.contains(base))
            api.db.update(
                "insert into practitioner_verification values(?,?,?,?,?)",
                uid,
                credential,
                evidence,
                now(),
                api.uid(u));
          if (!status.equals("active")
              || !Objects.equals(old.get("credential_status"), credential)
              || !Objects.equals(old.get("privileges"), privileges)
              || !Objects.equals(old.get("professional_role"), job)) {
            api.db.update("update identity_session set revoked=true where user_id=?", uid);
            api.db.update(
                "update care_assignment set active=false,version=version+1 where staff_id=?", uid);
            api.db.update(
                "update workforce_shift set status='cancelled',version=version+1 where"
                    + " employee_id=? and ends_at>?",
                eid,
                now());
          }
          event(
              u,
              "employment",
              eid,
              "employment_changed",
              employmentView(old),
              Map.of("status", status, "role", job, "credential", credential, "reason", evidence));
          return employmentView(row("employment", eid, u));
        });
  }

  @GetMapping("/shifts")
  List<Map<String, Object>> shifts(HttpServletRequest r) {
    var u = staff(r);
    return api.db.queryForList(
        "select s.*,u.display_name as name,e.professional_role,e.work_id from workforce_shift s"
            + " join employment e on s.employee_id=e.id join app_user u on e.user_id=u.id where"
            + " s.organization_id=? and s.status='active' and s.ends_at>? order by s.starts_at"
            + " limit 500",
        tenants.org(u),
        Instant.now().minusSeconds(86400).toString());
  }

  @PostMapping("/shifts")
  Map<String, Object> shift(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    roles(u, "admin", "coordinator");
    String eid = field(b, "employeeId", 36),
        node = opt(b, "nodeId", 36),
        kind = field(b, "kind", 30),
        start = instant(b, "startsAt", true),
        end = instant(b, "endsAt", true);
    var employee = row("employment", eid, u);
    if (!employee.get("status").equals("active")) throw error(400, "Choose an active employee");
    if (node != null) row("organization_node", node, u);
    if (!Set.of(
                "shift",
                "rotation",
                "on_call",
                "leave",
                "break",
                "coverage",
                "substitution",
                "procedure")
            .contains(kind)
        || !Instant.parse(end).isAfter(Instant.parse(start))
        || Duration.between(Instant.parse(start), Instant.parse(end)).toDays() > 31)
      throw error(400, "Provide a valid schedule interval of at most 31 days");
    if (api.role(u).equals("coordinator")
        && !Objects.equals(tenants.employment(u).get("node_id"), employee.get("node_id")))
      throw error(403, "Department managers may schedule only their department");
    String replace = opt(b, "replacesId", 36);
    if (replace != null) row("workforce_shift", replace, u);
    return atomic(
        () -> {
          var overlap =
              api.db.queryForList(
                  "select * from workforce_shift where employee_id=? and status='active' and"
                      + " starts_at<? and ends_at>?",
                  eid,
                  end,
                  start);
          if (Set.of("shift", "rotation", "coverage", "substitution").contains(kind)
              && overlap.stream()
                  .anyMatch(
                      x ->
                          Set.of("shift", "rotation", "coverage", "substitution")
                                  .contains(x.get("kind"))
                              && !Objects.equals(x.get("id"), replace)))
            throw error(409, "Overlapping work shift; choose a substitution or different interval");
          String sid = id();
          api.db.update(
              "insert into"
                  + " workforce_shift(id,organization_id,employee_id,node_id,kind,starts_at,ends_at,public_booking,specialty,replaces_id,created_by,created_at)"
                  + " values(?,?,?,?,?,?,?,?,?,?,?,?)",
              sid,
              tenants.org(u),
              eid,
              node,
              kind,
              start,
              end,
              Boolean.TRUE.equals(b.get("publicBooking")),
              opt(b, "specialty", 100),
              replace,
              api.uid(u),
              now());
          if (replace != null)
            api.db.update(
                "update workforce_shift set status='replaced',version=version+1 where id=?",
                replace);
          event(u, "shift", sid, "schedule_created", null, b);
          return row("workforce_shift", sid, u);
        });
  }

  @PostMapping("/shifts/{sid}/cancel")
  Map<String, Object> cancelShift(
      @PathVariable String sid, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    roles(u, "admin", "coordinator");
    return atomic(
        () -> {
          var old = row("workforce_shift", sid, u);
          version(b, old);
          if (api.role(u).equals("coordinator")
              && !Objects.equals(
                  row("employment", old.get("employee_id").toString(), u).get("node_id"),
                  tenants.employment(u).get("node_id")))
            throw error(403, "Department scope required");
          api.db.update(
              "update workforce_shift set status='cancelled',version=version+1 where id=?", sid);
          event(
              u,
              "shift",
              sid,
              "schedule_cancelled",
              old,
              Map.of("reason", field(b, "reason", 1000)));
          return row("workforce_shift", sid, u);
        });
  }

  @PutMapping("/availability-policy")
  Map<String, Object> policy(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    admin(u);
    return atomic(
        () -> {
          var old =
              api.db.queryForMap(
                  "select * from workforce_policy where organization_id=?", tenants.org(u));
          version(b, old);
          api.db.update(
              "update workforce_policy set enforce_availability=?,version=version+1 where"
                  + " organization_id=?",
              Boolean.TRUE.equals(b.get("enforce")),
              tenants.org(u));
          event(u, "schedule", tenants.org(u), "availability_policy_changed", old, b);
          return api.db.queryForMap(
              "select * from workforce_policy where organization_id=?", tenants.org(u));
        });
  }

  @GetMapping("/public-slots")
  List<Map<String, Object>> publicSlots(
      @RequestParam String organizationId, @RequestParam String date, HttpServletRequest r) {
    api.user(r);
    LocalDate day;
    try {
      day = LocalDate.parse(date);
    } catch (Exception ex) {
      throw error(400, "Use YYYY-MM-DD");
    }
    var orgs =
        api.db.queryForList(
            "select name from healthcare_organization where id=? and status in"
                + " ('verified','synthetic_verified')",
            organizationId);
    if (orgs.isEmpty()) return List.of();
    var slots = new ArrayList<Map<String, Object>>();
    for (var s :
        api.db.queryForList(
            "select s.*,u.id as doctor_id,u.display_name as doctor_name from workforce_shift s join"
                + " employment e on e.id=s.employee_id join app_user u on u.id=e.user_id where"
                + " s.organization_id=? and s.public_booking=true and s.status='active' and"
                + " e.status='active' and u.role='doctor' and s.kind in"
                + " ('shift','rotation','coverage','substitution')",
            organizationId)) {
      var doctor = api.db.queryForMap("select * from app_user where id=?", s.get("doctor_id"));
      try {
        tenants.validate(doctor);
        api.verifyPractitioner(doctor);
      } catch (Exception ex) {
        continue;
      }
      for (Instant t = Instant.parse(s.get("starts_at").toString());
          !t.plusSeconds(1800).isAfter(Instant.parse(s.get("ends_at").toString()));
          t = t.plusSeconds(1800)) {
        if (!t.atOffset(ZoneOffset.UTC).toLocalDate().equals(day) || t.isBefore(Instant.now()))
          continue;
        try {
          api.tenants.available(doctor, t, 30, "");
          care.clinician.slot(doctor, t.toEpochMilli(), 30, "");
          slots.add(
              Map.of(
                  "doctorId",
                  s.get("doctor_id"),
                  "doctor",
                  s.get("doctor_name"),
                  "startsAt",
                  t.toString(),
                  "duration",
                  30,
                  "specialty",
                  Objects.toString(s.get("specialty"), "General"),
                  "organizationId",
                  organizationId));
        } catch (Exception ignored) {
        }
      }
    }
    return slots;
  }

  @GetMapping("/notices")
  List<Map<String, Object>> notices(HttpServletRequest r) {
    var u = staff(r);
    return api
        .db
        .queryForList(
            "select e.id,e.seq,e.resource_type,e.severity,e.created_at,case when n.event_id is null"
                + " then false else true end as is_read from organization_event e left join"
                + " notification_read n on n.event_id=e.id and n.user_id=? where"
                + " e.organization_id=? order by e.seq desc limit 40",
            api.uid(u),
            tenants.org(u))
        .stream()
        .map(
            e -> {
              e.put(
                  "message",
                  "Your organization has an update. Open the authorized workspace to review.");
              return e;
            })
        .toList();
  }

  @PostMapping("/notices/{nid}/read")
  Map<String, Object> readNotice(@PathVariable String nid, HttpServletRequest r) {
    api.csrf(r);
    var u = staff(r);
    if (api.db.queryForObject(
            "select count(*) from organization_event where id=? and organization_id=?",
            Integer.class,
            nid,
            tenants.org(u))
        != 1) throw error(404, "Notification not found");
    if (api.db.queryForObject(
            "select count(*) from notification_read where event_id=? and user_id=?",
            Integer.class,
            nid,
            api.uid(u))
        == 0) api.db.update("insert into notification_read values(?,?,?)", api.uid(u), nid, now());
    return Map.of("status", "read");
  }

  @GetMapping("/audit")
  List<Map<String, Object>> audit(HttpServletRequest r) {
    var u = staff(r);
    roles(u, "admin", "security");
    api.audit(api.uid(u), null, "ORGANIZATION_AUDIT_READ", tenants.org(u));
    return api.db.queryForList(
        "select id,actor_id,resource_type,resource_id,action,severity,created_at from"
            + " organization_event where organization_id=? order by seq desc limit 500",
        tenants.org(u));
  }

  @GetMapping("/patient-organizations")
  List<Map<String, Object>> patientOrganizations(HttpServletRequest r) {
    var u = api.user(r);
    roles(u, "patient");
    var out = new ArrayList<Map<String, Object>>();
    for (var o :
        api.db.queryForList(
            "select distinct o.id,o.name,o.code,o.type from healthcare_organization o join app_user"
                + " s on s.organization_id=o.id join care_assignment a on a.staff_id=s.id where"
                + " a.patient_id=? and a.active=true",
            api.uid(u))) {
      var v = new LinkedHashMap<>(o);
      v.put(
          "care_team",
          api.db.queryForList(
              "select u.display_name as name,u.role,u.department from care_assignment a join"
                  + " app_user u on a.staff_id=u.id where a.patient_id=? and a.active=true and"
                  + " a.expires_at>? and u.organization_id=?",
              api.uid(u),
              now(),
              o.get("id")));
      v.put(
          "appointments",
          api.db.queryForList(
              "select a.id,a.starts_at,a.duration_minutes,a.status,a.workflow_stage,u.display_name"
                  + " as doctor from appointment a join app_user u on a.doctor_id=u.id where"
                  + " a.patient_id=? and u.organization_id=? order by a.starts_at desc",
              api.uid(u),
              o.get("id")));
      v.put(
          "insurance_sharing",
          api.db.queryForList(
              "select purpose,department,expires_at,status from insurance_share where patient_id=?"
                  + " and organization_id=?",
              api.uid(u),
              o.get("id")));
      out.add(v);
    }
    return out;
  }

  // Public availability is only a suggestion. Recheck slot/doctor constraints while saving the booking.
  @PostMapping("/public-booking")
  Map<String, Object> publicBooking(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var u = api.user(r);
    roles(u, "patient");
    String oid = field(b, "organizationId", 36),
        did = field(b, "doctorId", 36),
        start = instant(b, "startsAt", true);
    return atomic(
        () -> {
          String key = field(b, "requestKey", 100);
          var existing =
              api.db.queryForList(
                  "select * from appointment where patient_id=? and request_key=?",
                  api.uid(u),
                  key);
          if (!existing.isEmpty()) {
            var a = existing.getFirst();
            if (!did.equals(a.get("doctor_id"))
                || ((Number) a.get("starts_at")).longValue() != Instant.parse(start).toEpochMilli())
              throw error(409, "Submission key already used");
            return Map.of("id", a.get("id"), "status", a.get("status"));
          }
          if (api.db
              .queryForList(
                  "select id from app_user where id=? and organization_id=? for update", did, oid)
              .isEmpty()) throw error(404, "Public doctor not found");
          boolean found =
              publicSlots(
                      oid,
                      Instant.parse(start).atOffset(ZoneOffset.UTC).toLocalDate().toString(),
                      r)
                  .stream()
                  .anyMatch(s -> s.get("doctorId").equals(did) && s.get("startsAt").equals(start));
          if (!found) throw error(409, "This public slot is no longer available");
          String aid = id();
          api.db.update(
              "insert into"
                  + " appointment(id,doctor_id,patient_id,starts_at,duration_minutes,reason,visit_mode,status,request_key,created_at,updated_at,tenant_id)"
                  + " values(?,?,?,?,30,?,'in_person','scheduled',?,?,?,?)",
              aid,
              did,
              api.uid(u),
              Instant.parse(start).toEpochMilli(),
              "Patient booked appointment",
              field(b, "requestKey", 100),
              now(),
              now(),
              oid);
          var doctor = care.person(did);
          if (api.db.queryForObject(
                  "select count(*) from care_assignment where patient_id=? and staff_id=?",
                  Integer.class,
                  api.uid(u),
                  did)
              == 0)
            api.db.update(
                "insert into"
                    + " care_assignment(id,patient_id,staff_id,organization,clinic,scopes,expires_at,assigned_by,created_at)"
                    + " values(?,?,?,?,?,'registration',?,?,?)",
                id(),
                api.uid(u),
                did,
                doctor.get("organization"),
                doctor.get("clinic"),
                Instant.parse(start).plusSeconds(86400).toString(),
                api.uid(u),
                now());
          event(
              doctor,
              "appointment",
              aid,
              "public_appointment_booked",
              null,
              Map.of("status", "scheduled"));
          return Map.of(
              "id",
              aid,
              "status",
              "scheduled",
              "notice",
              "Clinical access still requires your consent and a clinical assignment.");
        });
  }
}
