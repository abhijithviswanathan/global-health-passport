/**
 * Builds bounded organization and insurance FHIR collection projections.
 * Uses domain API methods so their access checks run before serialization.
 * Do not bypass those checks by exporting raw database tables.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.web.bind.annotation.*;

/** R4 collection projections, not a general FHIR CRUD/search server. */
@RestController
@RequestMapping("/api")
class OrganizationFhirApi {
  final EcosystemApi eco;
  final ClinicalOperationsApi clinical;
  final InsuranceApi insurance;

  OrganizationFhirApi(EcosystemApi eco, ClinicalOperationsApi clinical, InsuranceApi insurance) {
    this.eco = eco;
    this.clinical = clinical;
    this.insurance = insurance;
  }

  Map<String, Object> ref(String type, Object id) {
    return Map.of("reference", type + "/" + id);
  }

  Map<String, Object> resource(String type, Object id) {
    var v = new LinkedHashMap<String, Object>();
    v.put("resourceType", type);
    v.put("id", id);
    return v;
  }

  Map<String, Object> bundle(List<Map<String, Object>> values) {
    return Map.of(
        "resourceType",
        "Bundle",
        "type",
        "collection",
        "timestamp",
        now(),
        "entry",
        values.stream()
            .map(v -> Map.of("fullUrl", "urn:uuid:" + v.get("id"), "resource", v))
            .toList());
  }

  @GetMapping("/ecosystem/fhir")
  Map<String, Object> export(HttpServletRequest r) {
    var u = eco.staff(r);
    var workspace = eco.workspace(r);
    var values = new ArrayList<Map<String, Object>>();
    var org = (Map<String, Object>) workspace.get("organization");
    var o = resource("Organization", org.get("id"));
    o.put("name", org.get("name"));
    o.put("active", eco.tenants.trusted(u));
    o.put(
        "identifier",
        List.of(Map.of("system", "urn:health-passport:organization", "value", org.get("code"))));
    values.add(o);
    for (var n :
        eco.api.db.queryForList(
            "select * from organization_node where organization_id=? and active=true",
            eco.tenants.org(u))) {
      if (Set.of("location", "unit").contains(n.get("kind"))) {
        var location = resource("Location", n.get("id"));
        location.put("status", "active");
        location.put("name", n.get("name"));
        location.put("managingOrganization", ref("Organization", org.get("id")));
        values.add(location);
      } else if (Set.of("service", "lab_capability", "imaging_capability", "pharmacy_capability")
          .contains(n.get("kind"))) {
        var service = resource("HealthcareService", n.get("id"));
        service.put("active", true);
        service.put("providedBy", ref("Organization", org.get("id")));
        service.put("name", n.get("name"));
        values.add(service);
      }
    }
    for (var e :
        eco.api.db.queryForList(
            "select * from employment where organization_id=?", eco.tenants.org(u))) {
      var role = resource("PractitionerRole", e.get("id"));
      role.put("active", e.get("status").equals("active"));
      role.put("practitioner", ref("Practitioner", e.get("user_id")));
      role.put("organization", ref("Organization", org.get("id")));
      role.put(
          "identifier",
          List.of(Map.of("system", "urn:health-passport:work-id", "value", e.get("work_id"))));
      role.put("code", List.of(Map.of("text", e.get("professional_role"))));
      values.add(role);
    }
    for (var s : eco.shifts(r)) {
      var schedule = resource("Schedule", s.get("id"));
      schedule.put("active", s.get("status").equals("active"));
      schedule.put("actor", List.of(ref("PractitionerRole", s.get("employee_id"))));
      schedule.put("planningHorizon", Map.of("start", s.get("starts_at"), "end", s.get("ends_at")));
      schedule.put(
          "comment", s.get("kind") + "; internal staffing interval, not itself a bookable slot");
      values.add(schedule);
    }
    if (CareApi.STAFF.contains(eco.api.role(u)))
      for (var t : eco.care.tasks(r)) {
        var task = resource("Task", t.get("id"));
        task.put(
            "status",
            switch (t.get("status").toString()) {
              case "accepted" -> "accepted";
              case "in_progress" -> "in-progress";
              case "completed" -> "completed";
              case "blocked", "waiting" -> "on-hold";
              case "cancelled" -> "cancelled";
              default -> "requested";
            });
        task.put("intent", "order");
        task.put("businessStatus", Map.of("text", t.get("status")));
        task.put("description", t.get("details"));
        task.put("authoredOn", t.get("created_at"));
        task.put("lastModified", t.get("updated_at"));
        task.put("requester", ref("Practitioner", t.get("creator_id")));
        if (t.get("assignee_id") != null)
          task.put("owner", ref("Practitioner", t.get("assignee_id")));
        if (t.get("patient_id") != null) task.put("for", ref("Patient", t.get("patient_id")));
        if (t.get("encounter_id") != null)
          task.put("encounter", ref("Encounter", t.get("encounter_id")));
        values.add(task);
      }
    if (TenantService.CLINICAL.contains(eco.api.role(u)))
      for (var order : clinical.orders(r)) {
        if (order.get("kind").equals("medication")) continue;
        var sr = resource("ServiceRequest", order.get("id"));
        sr.put("status", order.get("status").equals("completed") ? "completed" : "active");
        sr.put("intent", "order");
        sr.put("code", Map.of("text", order.get("code")));
        sr.put("subject", ref("Patient", order.get("patient_id")));
        sr.put("requester", ref("Practitioner", order.get("requester_id")));
        sr.put("performer", List.of(ref("Practitioner", order.get("assigned_id"))));
        sr.put("authoredOn", order.get("created_at"));
        if (order.get("encounter_id") != null)
          sr.put("encounter", ref("Encounter", order.get("encounter_id")));
        values.add(sr);
        if (order.get("collected_at") != null) {
          var specimen =
              resource(
                  "Specimen",
                  UUID.nameUUIDFromBytes((order.get("id") + ":specimen").getBytes()).toString());
          specimen.put("status", "available");
          specimen.put(
              "identifier",
              List.of(
                  Map.of(
                      "system",
                      "urn:health-passport:specimen",
                      "value",
                      order.get("specimen_code"))));
          specimen.put("subject", ref("Patient", order.get("patient_id")));
          specimen.put(
              "collection",
              Map.of(
                  "collectedDateTime",
                  order.get("collected_at"),
                  "collector",
                  ref("Practitioner", order.get("collected_by"))));
          specimen.put("request", List.of(ref("ServiceRequest", order.get("id"))));
          values.add(specimen);
        }
        if (order.get("study_uid") != null) {
          var study =
              resource(
                  "ImagingStudy",
                  UUID.nameUUIDFromBytes((order.get("id") + ":study").getBytes()).toString());
          study.put("status", "registered");
          study.put("subject", ref("Patient", order.get("patient_id")));
          study.put(
              "identifier",
              List.of(
                  Map.of("system", "urn:dicom:uid", "value", "urn:oid:" + order.get("study_uid"))));
          study.put(
              "description",
              "Study identifier metadata only; no PACS pixel data or availability validation");
          values.add(study);
        }
      }
    if (TenantService.CLINICAL.contains(eco.api.role(u)))
      for (var n :
          eco.api.db.queryForList(
              "select n.*,r.patient_id,r.encounter_id,r.author_id,r.observed_at,r.details from"
                  + " nursing_entry n join clinical_record r on n.record_id=r.id where"
                  + " n.organization_id=?",
              eco.tenants.org(u))) {
        try {
          eco.care.clinical(n.get("record_id").toString(), u);
        } catch (org.springframework.web.server.ResponseStatusException denied) {
          continue;
        }
        boolean med = n.get("entry_type").equals("medication_administration");
        var v = resource(med ? "MedicationAdministration" : "Observation", n.get("id"));
        v.put("status", med ? "completed" : "final");
        v.put("subject", ref("Patient", n.get("patient_id")));
        v.put("effectiveDateTime", n.get("observed_at"));
        if (med) {
          v.put(
              "medicationCodeableConcept",
              Map.of(
                  "text",
                  eco.api.db.queryForObject(
                      "select title from clinical_record where id=?",
                      String.class,
                      n.get("prescription_id"))));
          v.put("request", ref("MedicationRequest", n.get("prescription_id")));
          v.put("performer", List.of(Map.of("actor", ref("Practitioner", n.get("author_id")))));
          v.put("dosage", Map.of("text", n.get("dose"), "route", Map.of("text", n.get("route"))));
        } else {
          v.put("code", Map.of("text", n.get("entry_type")));
          v.put("valueString", n.get("details"));
          v.put("performer", List.of(ref("Practitioner", n.get("author_id"))));
        }
        values.add(v);
      }
    if (Set.of("doctor", "nurse").contains(eco.api.role(u)))
      for (var h : clinical.handoffs(r)) {
        var c = resource("Communication", h.get("id"));
        c.put("status", h.get("status").equals("acknowledged") ? "completed" : "in-progress");
        c.put("subject", ref("Patient", h.get("patient_id")));
        c.put("sender", ref("Practitioner", h.get("outgoing_id")));
        c.put("recipient", List.of(ref("Practitioner", h.get("incoming_id"))));
        c.put("sent", h.get("created_at"));
        if (h.get("acknowledged_at") != null) c.put("received", h.get("acknowledged_at"));
        c.put("payload", List.of(Map.of("contentString", h.get("details"))));
        values.add(c);
      }
    eco.api.audit(eco.api.uid(u), null, "ORGANIZATION_FHIR_EXPORT", eco.tenants.org(u));
    return bundle(values);
  }

  @GetMapping("/insurance/fhir")
  Map<String, Object> coverage(HttpServletRequest r) {
    var u = eco.api.user(r);
    var values = new ArrayList<Map<String, Object>>();
    for (var p : insurance.profiles(r)) {
      var c = resource("Coverage", p.get("id"));
      c.put("status", "active");
      c.put("beneficiary", ref("Patient", p.get("patient_id")));
      c.put("payor", List.of(Map.of("display", p.get("company"))));
      c.put("relationship", Map.of("text", p.get("relationship")));
      c.put(
          "class",
          List.of(
              Map.of(
                  "type",
                  Map.of(
                      "coding",
                      List.of(
                          Map.of(
                              "system",
                              "http://terminology.hl7.org/CodeSystem/coverage-class",
                              "code",
                              "plan"))),
                  "value",
                  p.get("plan_name"))));
      var period = new LinkedHashMap<String, Object>();
      if (p.get("effective_date") != null) period.put("start", p.get("effective_date"));
      if (p.get("expiration_date") != null) period.put("end", p.get("expiration_date"));
      if (!period.isEmpty()) c.put("period", period);
      c.put(
          "extension",
          List.of(
              Map.of(
                  "url",
                  "urn:health-passport:coverage-source",
                  "valueString",
                  "Patient reported. Coverage validity is not established by this resource.")));
      values.add(c);
      eco.api.audit(
          eco.api.uid(u),
          p.get("patient_id").toString(),
          "COVERAGE_FHIR_EXPORT",
          p.get("id").toString());
    }
    return bundle(values);
  }
}
