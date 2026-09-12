package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=jdbc:h2:mem:ecosystem;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
      "DEMO_MODE=true",
      "DEMO_PASSWORD=care-workflow-password!",
      "IDENTITY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    })
class EcosystemWorkflowTest extends CareWorkflowTest {
  Map<String, Object> b(Object... kv) {
    var out = new LinkedHashMap<String, Object>();
    for (int i = 0; i < kv.length; i += 2) out.put(kv[i].toString(), kv[i + 1]);
    return out;
  }

  String random(String prefix) {
    return prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }

  Client organization(String type) throws Exception {
    var p = patient();
    String username = random("admin");
    var org =
        p.ok(
            "POST",
            "/ecosystem/onboard",
            b(
                "name",
                "Synthetic Hospital " + username,
                "type",
                type,
                "adminUsername",
                username,
                "adminName",
                "Synthetic organization administrator",
                "password",
                "care-workflow-password!"));
    var admin = new Client().login(username);
    assertEquals(
        "pending",
        admin.ok("GET", "/ecosystem/workspace", null).path("organization").path("status").asText());
    new Client()
        .login("security")
        .ok(
            "POST",
            "/ecosystem/organizations/" + org.get("organizationId").asText() + "/verify",
            b(
                "version",
                0,
                "status",
                "verified",
                "evidence",
                "Synthetic test reviewer; not real organizational accreditation"));
    return admin;
  }

  Client employee(Client admin, String job) throws Exception {
    String username = random("staff");
    var inv =
        admin.ok(
            "POST",
            "/ecosystem/invitations",
            b("username", username, "professionalRole", job, "department", "General care"));
    new Client()
        .ok(
            "POST",
            "/ecosystem/invitations/accept",
            b(
                "invitationToken",
                inv.get("invitationToken").asText(),
                "password",
                "care-workflow-password!",
                "name",
                "Synthetic " + job));
    var work = admin.ok("GET", "/ecosystem/workspace", null);
    JsonNode member = null;
    for (var e : work.get("staff"))
      if (e.get("professional_role").asText().equals(job)
          && api.byUsername(username).get("id").equals(e.get("user_id").asText())) member = e;
    assertNotNull(member);
    admin.ok(
        "PATCH",
        "/ecosystem/employment/" + member.get("id").asText(),
        b(
            "version",
            member.get("version").asInt(),
            "professionalRole",
            job,
            "department",
            "General care",
            "status",
            "active",
            "credentialStatus",
            "verified",
            "credentialUntil",
            Instant.now().plusSeconds(365 * 86400L).toString(),
            "license",
            "SYNTHETIC-TEST-ONLY",
            "jurisdiction",
            "Synthetic jurisdiction",
            "specialty",
            "General",
            "evidence",
            "Synthetic credential evidence"));
    return new Client().login(username);
  }

  void share(Client p, Client admin, Client staff, List<String> scopes) throws Exception {
    admin.ok("POST", "/care/registration", b("healthId", p.me.get("healthId").asText()));
    admin.ok(
        "POST",
        "/care/assignments",
        b(
            "healthId",
            p.me.get("healthId").asText(),
            "staffId",
            uid(staff),
            "scopes",
            scopes,
            "expiresAt",
            Instant.now().plusSeconds(8640000).toString(),
            "version",
            0));
    p.ok(
        "POST",
        "/consents",
        b(
            "patientId",
            uid(p),
            "granteeId",
            uid(staff),
            "purpose",
            "treatment",
            "scopes",
            scopes,
            "expiresAt",
            Instant.now().plusSeconds(8640000).toString()));
  }

  JsonNode stage(Client c, JsonNode o, String status, Object... extra) throws Exception {
    var payload = b("version", o.get("version").asInt(), "status", status);
    payload.putAll(b(extra));
    return c.ok("PATCH", "/ecosystem/orders/" + o.get("id").asText(), payload);
  }

  @Test
  void completeHospitalWorkflowInsuranceAndTenantIsolation() throws Exception {
    var a = organization("hospital");
    var other = organization("hospital");
    var doctor = employee(a, "physician");
    var nurse = employee(a, "nurse");
    var lab = employee(a, "laboratory_technician");
    var imaging = employee(a, "radiology_technician");
    var radiologist = employee(a, "radiologist");
    var pharmacy = employee(a, "pharmacist");
    var billing = employee(a, "billing_staff");
    var outsider = employee(other, "physician");
    var p = patient();
    for (String name : List.of("Emergency Department", "Laboratory", "Radiology"))
      a.ok(
          "POST",
          "/ecosystem/nodes",
          b("kind", "department", "name", name, "details", "Synthetic hospital department"));
    var all = new ArrayList<>(PassportApi.KINDS);
    share(p, a, doctor, all);
    share(p, a, radiologist, all);
    share(p, a, nurse, List.of("nursing_observation", "vital", "lab_order", "prescription"));
    share(p, a, lab, List.of("lab_order", "lab_result"));
    share(p, a, imaging, List.of("imaging_order", "imaging_report"));
    share(p, a, pharmacy, List.of("prescription", "dispense", "allergy", "medication"));
    Instant start =
        Instant.now().plusSeconds(86400).truncatedTo(java.time.temporal.ChronoUnit.HOURS);
    String employment =
        doctor.ok("GET", "/ecosystem/workspace", null).get("employment").get("id").asText();
    a.ok(
        "POST",
        "/ecosystem/shifts",
        b(
            "employeeId",
            employment,
            "kind",
            "shift",
            "startsAt",
            start.toString(),
            "endsAt",
            start.plusSeconds(28800).toString(),
            "publicBooking",
            true));
    var appointment =
        a.ok(
            "POST",
            "/care/appointments",
            b(
                "patientId",
                uid(p),
                "doctorId",
                uid(doctor),
                "startsAt",
                start.plusSeconds(3600).toString(),
                "duration",
                30,
                "mode",
                "in_person",
                "requestKey",
                UUID.randomUUID().toString()));
    String encounter = appointment.get("id").asText();
    var vital =
        nurse.ok(
            "POST",
            "/care/records",
            b(
                "patientId",
                uid(p),
                "kind",
                "vital",
                "title",
                "Nurse intake",
                "details",
                "Synthetic observation",
                "observedAt",
                start.toString(),
                "sourceType",
                "nurse_observation",
                "encounterId",
                encounter,
                "measurements",
                b("pulse_bpm", 72),
                "idempotencyKey",
                UUID.randomUUID().toString()));
    assertEquals(a.me.get("organizationId").asText(), vital.get("tenant_id").asText());
    var labOrder =
        doctor.ok(
            "POST",
            "/ecosystem/orders",
            b(
                "patientId",
                uid(p),
                "encounterId",
                encounter,
                "kind",
                "laboratory",
                "code",
                "CBC",
                "instructions",
                "Synthetic CBC request",
                "priority",
                "routine",
                "assigneeId",
                uid(lab),
                "specimenType",
                "whole blood",
                "requestKey",
                UUID.randomUUID().toString()));
    labOrder = stage(lab, labOrder, "accepted");
    assertEquals(
        409,
        nurse
            .call(
                "PATCH",
                "/ecosystem/orders/" + labOrder.get("id").asText(),
                b(
                    "version",
                    1,
                    "status",
                    "specimen_collected",
                    "specimenCode",
                    "WRONG",
                    "patientHealthId",
                    p.me.get("healthId").asText(),
                    "observedAt",
                    start.toString()))
            .statusCode());
    labOrder =
        stage(
            nurse,
            labOrder,
            "specimen_collected",
            "specimenCode",
            labOrder.get("specimen_code").asText(),
            "patientHealthId",
            p.me.get("healthId").asText(),
            "observedAt",
            start.toString());
    labOrder = stage(lab, labOrder, "processing");
    labOrder = stage(lab, labOrder, "result_pending");
    labOrder =
        stage(
            lab,
            labOrder,
            "result_ready",
            "report",
            "Synthetic CBC: no actual patient specimen",
            "observedAt",
            start.toString(),
            "critical",
            true);
    labOrder =
        stage(
            doctor, labOrder, "reviewed", "review", "Synthetic result reviewed", "reviewed", true);
    stage(lab, labOrder, "completed");
    var xray =
        doctor.ok(
            "POST",
            "/ecosystem/orders",
            b(
                "patientId",
                uid(p),
                "encounterId",
                encounter,
                "kind",
                "imaging",
                "code",
                "Chest X-ray",
                "modality",
                "DX",
                "instructions",
                "Synthetic chest X-ray workflow",
                "priority",
                "routine",
                "assigneeId",
                uid(imaging),
                "requestKey",
                UUID.randomUUID().toString()));
    for (String status : List.of("scheduled", "patient_arrived", "imaging"))
      xray = stage(imaging, xray, status);
    xray = stage(imaging, xray, "study_available", "studyUid", "1.2.840.113619.2.55.3.123456");
    xray = stage(imaging, xray, "interpretation");
    xray =
        stage(
            imaging,
            xray,
            "result_ready",
            "report",
            "Synthetic imaging report — no real study",
            "observedAt",
            start.toString());
    xray =
        stage(
            radiologist,
            xray,
            "report_signed",
            "review",
            "Synthetic radiologist review",
            "reviewed",
            true);
    xray = stage(doctor, xray, "reviewed", "review", "Ordering clinician review", "reviewed", true);
    stage(imaging, xray, "completed");
    var rx =
        doctor.ok(
            "POST",
            "/care/records",
            b(
                "patientId",
                uid(p),
                "kind",
                "prescription",
                "title",
                "Synthetic medication",
                "details",
                "Not for administration to a real patient",
                "recipientId",
                uid(pharmacy),
                "dosage",
                "5 mg",
                "route",
                "oral",
                "frequency",
                "daily",
                "duration",
                "2 days",
                "quantity",
                2,
                "refills",
                0,
                "idempotencyKey",
                UUID.randomUUID().toString()));
    pharmacy.ok(
        "POST",
        "/care/records",
        b(
            "patientId",
            uid(p),
            "kind",
            "dispense",
            "title",
            "Synthetic dispensing",
            "details",
            "Synthetic prescription verified",
            "relatedId",
            rx.get("id").asText(),
            "quantity",
            1,
            "idempotencyKey",
            UUID.randomUUID().toString()));
    nurse.ok(
        "POST",
        "/ecosystem/nursing",
        b(
            "patientId",
            uid(p),
            "encounterId",
            encounter,
            "entryType",
            "medication_administration",
            "prescriptionId",
            rx.get("id").asText(),
            "dose",
            "5 mg",
            "route",
            "oral",
            "identityChecked",
            true,
            "details",
            "Synthetic administration record",
            "observedAt",
            start.toString(),
            "requestKey",
            UUID.randomUUID().toString()));
    var profile =
        p.ok(
            "POST",
            "/insurance/profiles",
            b(
                "company",
                "Synthetic Example Insurer",
                "plan",
                "Synthetic Gold",
                "memberId",
                "MEMBER-PRIVATE-123",
                "groupId",
                "GROUP-PRIVATE",
                "policyholder",
                "Synthetic Alice",
                "relationship",
                "self",
                "coverageOrder",
                "primary",
                "effectiveDate",
                "2026-01-01",
                "expirationDate",
                "2027-12-31"));
    var permission =
        p.ok(
            "POST",
            "/insurance/shares",
            b(
                "profileId",
                profile.get("id").asText(),
                "organizationId",
                a.me.get("organizationId").asText(),
                "granteeId",
                uid(billing),
                "purpose",
                "eligibility",
                "expiresAt",
                Instant.now().plusSeconds(86400).toString()));
    var check =
        billing.ok(
            "POST",
            "/insurance/profiles/" + profile.get("id").asText() + "/eligibility",
            b("requestKey", UUID.randomUUID().toString()));
    assertEquals("VERIFIED", check.get("status").asText());
    assertTrue(check.get("synthetic").asBoolean());
    assertFalse(
        api.db
            .queryForObject(
                "select encrypted_identifiers from insurance_profile where id=?",
                String.class,
                profile.get("id").asText())
            .contains("MEMBER-PRIVATE"));
    p.ok("POST", "/insurance/shares/" + permission.get("id").asText() + "/revoke", Map.of());
    assertEquals(
        403,
        billing
            .call("GET", "/insurance/profiles/" + profile.get("id").asText() + "/identifiers", null)
            .statusCode());
    assertEquals(
        403, nurse.call("POST", "/ecosystem/orders", b("kind", "laboratory")).statusCode());
    assertEquals(
        404,
        other.call("PATCH", "/ecosystem/employment/" + employment, b("version", 0)).statusCode());
    assertEquals(
        404,
        outsider
            .call(
                "PATCH",
                "/ecosystem/orders/" + labOrder.get("id").asText(),
                b("version", 0, "status", "completed"))
            .statusCode());
    assertEquals(403, billing.call("GET", "/patients/" + uid(p) + "/timeline", null).statusCode());
    assertEquals(403, p.call("GET", "/ecosystem/operations", null).statusCode());
    assertTrue(p.ok("GET", "/patients/" + uid(p) + "/timeline", null).size() >= 7);
  }

  @Test
  void offboardingCredentialExpiryAndIndependentVerification() throws Exception {
    var a = organization("hospital");
    var nurse = employee(a, "nurse");
    var e = nurse.ok("GET", "/ecosystem/workspace", null).get("employment");
    assertEquals(
        403,
        a.call(
                "POST",
                "/ecosystem/organizations/" + a.me.get("organizationId").asText() + "/verify",
                b("status", "verified", "evidence", "self", "version", 1))
            .statusCode());
    api.db.update(
        "update employment set credential_until=? where id=?",
        Instant.now().minusSeconds(1).toString(),
        e.get("id").asText());
    assertEquals(403, nurse.call("GET", "/ecosystem/workspace", null).statusCode());
    assertTrue(
        api.db.queryForObject(
                "select count(*) from identity_session where user_id=? and revoked=false",
                Integer.class,
                uid(nurse))
            == 0);
  }

  @Test
  void insurerMarketplaceHasNoClinicalAccess() throws Exception {
    var insurer = organization("insurer");
    var p = patient();
    assertEquals(403, insurer.call("GET", "/patients/" + uid(p) + "/timeline", null).statusCode());
    assertEquals(403, insurer.call("GET", "/insurance/profiles", null).statusCode());
    var plan =
        insurer.ok(
            "POST",
            "/insurance/plans",
            b(
                "name",
                "Synthetic Clear Plan",
                "region",
                "New Jersey",
                "networkType",
                "PPO",
                "currency",
                "USD",
                "monthlyPremium",
                300,
                "deductible",
                1000,
                "copay",
                "$20 synthetic",
                "coinsurance",
                "20% synthetic",
                "outOfPocket",
                5000,
                "coverage",
                "Synthetic comparison only",
                "eligibility",
                "Fictional adult eligibility"));
    assertEquals(0, p.ok("GET", "/insurance/marketplace", null).get("organic").size());
    new Client()
        .login("security")
        .ok(
            "POST",
            "/insurance/plans/" + plan.get("id").asText() + "/review",
            b("status", "approved", "reason", "Synthetic plan reviewed", "version", 0));
    assertTrue(
        p.ok("GET", "/insurance/marketplace?sort=deductible", null).get("organic").size() > 0);
  }

  @Test
  void taskDependenciesVerificationHandoffAndPublicBooking() throws Exception {
    var a = organization("hospital");
    var doctor = employee(a, "physician");
    var nurse = employee(a, "nurse");
    var nextNurse = employee(a, "nurse");
    var p = patient();
    var scopes = List.of("nursing_observation", "vital");
    share(p, a, doctor, scopes);
    share(p, a, nurse, scopes);
    share(p, a, nextNurse, scopes);
    var first =
        doctor.ok(
            "POST",
            "/care/tasks",
            b(
                "patientId",
                uid(p),
                "scope",
                "nursing_observation",
                "title",
                "Prepare patient",
                "details",
                "Synthetic preparation",
                "assigneeId",
                uid(nurse),
                "priority",
                "routine",
                "requestKey",
                random("task")));
    var second =
        doctor.ok(
            "POST",
            "/care/tasks",
            b(
                "patientId",
                uid(p),
                "scope",
                "nursing_observation",
                "title",
                "Repeat observation",
                "details",
                "Synthetic dependency",
                "assigneeId",
                uid(nurse),
                "priority",
                "routine",
                "dependencies",
                List.of(first.get("id").asText()),
                "requestKey",
                random("task")));
    String secondPath = "/care/tasks/" + second.get("id").asText();
    nurse.ok("PATCH", secondPath, b("version", 0, "status", "accepted", "comment", "Accepted"));
    assertEquals(
        409,
        nurse
            .call(
                "PATCH",
                secondPath,
                b("version", 1, "status", "in_progress", "comment", "Too early"))
            .statusCode());
    String path = "/care/tasks/" + first.get("id").asText();
    int v = 0;
    for (String status : List.of("accepted", "in_progress", "waiting", "in_progress", "completed"))
      nurse.ok(
          "PATCH", path, b("version", v++, "status", status, "comment", "Synthetic task progress"));
    assertEquals(
        403,
        nurse
            .call("POST", path + "/verify", b("version", v, "comment", "Self verify"))
            .statusCode());
    assertNotNull(
        doctor
            .ok("POST", path + "/verify", b("version", v, "comment", "Independent verification"))
            .get("verified_at"));
    nurse.ok(
        "PATCH",
        secondPath,
        b("version", 1, "status", "in_progress", "comment", "Dependency complete"));
    nurse.ok(
        "PATCH",
        secondPath,
        b("version", 2, "status", "escalated", "comment", "Synthetic escalation"));
    nurse.ok(
        "PATCH",
        secondPath,
        b("version", 3, "status", "cancelled", "comment", "No longer required"));
    var h =
        nurse.ok(
            "POST",
            "/ecosystem/handoffs",
            b(
                "patientId",
                uid(p),
                "incomingId",
                uid(nextNurse),
                "patientStatus",
                "Stable synthetic",
                "pendingTasks",
                "None",
                "medications",
                "None",
                "tests",
                "None",
                "observations",
                "Synthetic",
                "concerns",
                "None"));
    assertEquals(
        403,
        doctor
            .call(
                "POST",
                "/ecosystem/handoffs/" + h.get("id").asText() + "/acknowledge",
                b("version", 0))
            .statusCode());
    assertEquals(
        "acknowledged",
        nextNurse
            .ok(
                "POST",
                "/ecosystem/handoffs/" + h.get("id").asText() + "/acknowledge",
                b("version", 0))
            .get("status")
            .asText());
    Instant start =
        Instant.now().plusSeconds(172800).truncatedTo(java.time.temporal.ChronoUnit.HOURS);
    String emp =
        doctor.ok("GET", "/ecosystem/workspace", null).get("employment").get("id").asText();
    a.ok(
        "POST",
        "/ecosystem/shifts",
        b(
            "employeeId",
            emp,
            "kind",
            "shift",
            "startsAt",
            start.toString(),
            "endsAt",
            start.plusSeconds(7200).toString(),
            "publicBooking",
            true));
    String oid = a.me.get("organizationId").asText();
    var slots =
        p.ok(
            "GET",
            "/ecosystem/public-slots?organizationId="
                + oid
                + "&date="
                + start.atOffset(ZoneOffset.UTC).toLocalDate(),
            null);
    assertEquals(4, slots.size());
    assertFalse(slots.toString().contains("employee_id"));
    var booking =
        b(
            "organizationId",
            oid,
            "doctorId",
            uid(doctor),
            "startsAt",
            start.toString(),
            "requestKey",
            random("booking"));
    var booked = p.ok("POST", "/ecosystem/public-booking", booking);
    assertEquals(booked.get("id"), p.ok("POST", "/ecosystem/public-booking", booking).get("id"));
    booking.put("requestKey", random("different"));
    assertEquals(409, p.call("POST", "/ecosystem/public-booking", booking).statusCode());
    assertTrue(p.ok("GET", "/ecosystem/patient-organizations", null).size() > 0);
    assertEquals("Bundle", nurse.ok("GET", "/ecosystem/fhir", null).get("resourceType").asText());
  }
}
