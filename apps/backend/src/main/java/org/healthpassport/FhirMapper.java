/**
 * Maps already-authorized clinical rows into a bounded FHIR R4 collection export.
 * This mapper does not authorize the caller and is not a general FHIR server.
 * Preserve unknown clinical facts instead of inventing codes, diagnoses or timestamps.
 */
package org.healthpassport;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

/** R4 export projection. Missing clinical facts remain unknown, never inferred from row state. */
public final class FhirMapper {
  private FhirMapper() {}

  private static final String RECORD_SYSTEM = "urn:health-passport:clinical-record";
  private static final String ABSENT = "http://hl7.org/fhir/StructureDefinition/data-absent-reason";
  static final Map<String, String> TYPES =
      Map.ofEntries(
          Map.entry("allergy", "AllergyIntolerance"), Map.entry("condition", "Condition"),
          Map.entry("medication", "MedicationStatement"), Map.entry("encounter", "Encounter"),
          Map.entry("lab_order", "ServiceRequest"), Map.entry("lab_result", "DiagnosticReport"),
          Map.entry("prescription", "MedicationRequest"),
              Map.entry("dispense", "MedicationDispense"),
          Map.entry("imaging_report", "DiagnosticReport"), Map.entry("note", "DocumentReference"));

  public static Map<String, Object> capability() {
    return Map.of(
        "resourceType",
        "CapabilityStatement",
        "status",
        "draft",
        "date",
        "2026-09-10",
        "kind",
        "instance",
        "fhirVersion",
        "4.0.1",
        "format",
        List.of("json"),
        "description",
        "Synthetic R4 collection export with typed clinical resources and provenance. No FHIR"
            + " resource CRUD, search, import, terminology normalization, or SMART authorization.",
        "implementation",
        Map.of("description", "Health Passport synthetic pilot collection exporter"),
        "rest",
        List.of(
            Map.of(
                "mode",
                "server",
                "documentation",
                "Only this metadata description and the custom authenticated"
                    + " /api/patients/{id}/fhir collection export are implemented. No standard"
                    + " resource interactions are advertised.")));
  }

  public static Map<String, Object> bundle(
      Map<String, Object> patient, List<Map<String, Object>> rows) {
    String patientId = value(patient, "id");
    List<Map<String, Object>> entries = new ArrayList<>();
    Map<String, Map<String, Object>> supporting = new LinkedHashMap<>();
    Map<String, Object> p = resource("Patient", patientId);
    p.put(
        "identifier",
        List.of(
            Map.of(
                "system",
                "urn:health-passport:public-id",
                "value",
                first(patient, "healthId", "health_id"))));
    p.put("name", List.of(Map.of("text", first(patient, "displayName", "name", "display_name"))));
    p.put(
        "text",
        narrative("Synthetic patient: " + first(patient, "displayName", "name", "display_name")));
    entries.add(entry(p));
    Map<String, Map<String, Object>> byId = new HashMap<>();
    for (var row : rows) byId.put(value(row, "id"), row);
    for (var row : rows) {
      String id = value(row, "id"), kind = value(row, "kind");
      String type = TYPES.getOrDefault(kind, "DocumentReference");
      if (kind.equals("allergy")
          && !Set.of("active", "inactive", "resolved").contains(value(row, "clinical_status"))) {
        type = "DocumentReference";
        Map<String, Object> warning =
            resource("OperationOutcome", derived("mapping-warning:" + id));
        warning.put(
            "issue",
            List.of(
                Map.of(
                    "severity",
                    "warning",
                    "code",
                    "incomplete",
                    "diagnostics",
                    "Allergy record "
                        + id
                        + " is preserved as a text document because no clinical status was"
                        + " captured. No active/inactive status has been inferred.")));
        entries.add(entry(warning));
      }
      String author = authorReference(row, patientId, supporting);
      Map<String, Object> item = clinical(type, row, patientId, author, byId);
      entries.add(entry(item));
      Map<String, Object> provenance = resource("Provenance", derived("provenance:" + id));
      provenance.put("target", List.of(reference(id)));
      provenance.put("recorded", value(row, "created_at"));
      provenance.put("agent", List.of(Map.of("who", Map.of("reference", author))));
      List<Map<String, Object>> entities = new ArrayList<>();
      entities.add(
          Map.of(
              "role",
              "source",
              "what",
              Map.of(
                  "identifier",
                  Map.of("system", RECORD_SYSTEM, "value", id),
                  "display",
                  value(row, "source"))));
      String replaces = value(row, "replaces_id");
      if (!replaces.isBlank() && byId.containsKey(replaces))
        entities.add(Map.of("role", "revision", "what", reference(replaces)));
      provenance.put("entity", entities);
      provenance.put(
          "text",
          narrative(
              "Source: "
                  + value(row, "source")
                  + ". Author: "
                  + value(row, "author_name")
                  + ". Original record: "
                  + id
                  + (replaces.isBlank() ? "" : ". Revises: " + replaces)));
      entries.add(entry(provenance));
    }
    supporting.values().forEach(item -> entries.add(entry(item)));
    return Map.of(
        "resourceType",
        "Bundle",
        "type",
        "collection",
        "timestamp",
        Instant.now().toString(),
        "entry",
        entries);
  }

  private static String authorReference(
      Map<String, Object> row, String patient, Map<String, Map<String, Object>> supporting) {
    String author = value(row, "author_id");
    if (author.equals(patient)) return "urn:uuid:" + patient;
    // These are the participating provider account identities, with no invented license or
    // specialty.
    Map<String, Object> practitioner = resource("Practitioner", author);
    practitioner.put(
        "identifier",
        List.of(Map.of("system", "urn:health-passport:provider-account", "value", author)));
    if (!value(row, "author_name").isBlank())
      practitioner.put("name", List.of(Map.of("text", value(row, "author_name"))));
    practitioner.put(
        "text", narrative("Participating provider account: " + value(row, "author_name")));
    supporting.put(author, practitioner);
    String source = value(row, "source");
    if (source.isBlank()
        || source.toLowerCase(Locale.ROOT).contains("synthetic")
        || source.startsWith("Patient entered")) return "urn:uuid:" + author;
    String orgId = derived("organization:" + source),
        roleId = derived("role:" + author + ":" + source);
    Map<String, Object> organization = resource("Organization", orgId);
    organization.put("name", source);
    organization.put("text", narrative("Recorded source organization: " + source));
    supporting.put(orgId, organization);
    Map<String, Object> role = resource("PractitionerRole", roleId);
    role.put("practitioner", reference(author));
    role.put("organization", reference(orgId));
    role.put("text", narrative("Provider account recorded at source organization: " + source));
    supporting.put(roleId, role);
    return "urn:uuid:" + roleId;
  }

  private static Map<String, Object> clinical(
      String type,
      Map<String, Object> row,
      String patient,
      String author,
      Map<String, Map<String, Object>> byId) {
    String id = value(row, "id"),
        kind = value(row, "kind"),
        title = value(row, "title"),
        details = value(row, "details"),
        created = value(row, "created_at");
    Map<String, Object> item = resource(type, id);
    item.put("identifier", List.of(Map.of("system", RECORD_SYSTEM, "value", id)));
    item.put(
        "meta",
        Map.of(
            "tag",
            List.of(
                Map.of("system", "urn:health-passport:record-status", "code", value(row, "status")),
                Map.of("system", "urn:health-passport:record-kind", "code", kind))));
    item.put(
        "text",
        narrative(
            title
                + ". "
                + details
                + ". Source: "
                + value(row, "source")
                + ". Record state: "
                + value(row, "status")
                + (value(row, "clinical_status").isBlank()
                    ? ". Clinical status was not separately captured."
                    : ". Reported clinical status: " + value(row, "clinical_status"))));
    Map<String, Object> subject = reference(patient);
    Map<String, Object> authorRef = Map.of("reference", author);
    switch (type) {
      case "AllergyIntolerance" -> {
        item.put(
            "clinicalStatus",
            coded(
                "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                value(row, "clinical_status")));
        item.put("code", concept(title));
        item.put("patient", subject);
        item.put("recordedDate", created);
        item.put("recorder", authorRef);
        item.put("note", notes(details));
      }
      case "Condition" -> {
        if (Set.of("active", "recurrence", "relapse", "inactive", "remission", "resolved")
            .contains(value(row, "clinical_status")))
          item.put(
              "clinicalStatus",
              coded(
                  "http://terminology.hl7.org/CodeSystem/condition-clinical",
                  value(row, "clinical_status")));
        item.put("code", concept(title));
        item.put("subject", subject);
        item.put("recordedDate", created);
        item.put("recorder", authorRef);
        item.put("note", notes(details));
      }
      case "MedicationStatement" -> {
        item.put("status", "unknown");
        item.put("medicationCodeableConcept", concept(title));
        item.put("subject", subject);
        item.put("dateAsserted", created);
        item.put("informationSource", authorRef);
        item.put("note", notes(details));
      }
      case "Encounter" -> {
        item.put("status", "unknown");
        item.put("class", unknown());
        item.put("type", List.of(concept(title)));
        item.put("subject", subject);
        // Record creation time is not asserted as encounter start/end time.
      }
      case "ServiceRequest" -> {
        item.put("status", "unknown");
        item.put("intent", "order");
        item.put("code", concept(title));
        item.put("subject", subject);
        item.put("authoredOn", created);
        item.put("requester", authorRef);
        item.put("note", notes(details));
      }
      case "DiagnosticReport" -> {
        item.put("status", "unknown");
        item.put("code", concept(title));
        item.put("subject", subject);
        item.put("conclusion", details);
        item.put("presentedForm", List.of(attachment(title, details)));
        String related = value(row, "related_id");
        if (byId.containsKey(related) && "lab_order".equals(value(byId.get(related), "kind")))
          item.put("basedOn", List.of(reference(related)));
        // Free-text results do not imply numeric Observations, units, reference ranges, or DICOM
        // UIDs.
      }
      case "MedicationRequest" -> {
        item.put("status", "unknown");
        item.put("intent", "order");
        item.put("medicationCodeableConcept", concept(title));
        item.put("subject", subject);
        item.put("authoredOn", created);
        item.put("requester", authorRef);
        item.put("note", notes(details));
        Map<String, Object> dosage = new LinkedHashMap<>();
        List<String> text = new ArrayList<>();
        for (String key : List.of("dosage", "route", "frequency", "duration"))
          if (!value(row, key).isBlank()) text.add(key + ": " + value(row, key));
        if (!text.isEmpty()) dosage.put("text", String.join("; ", text));
        if (!value(row, "route").isBlank()) dosage.put("route", concept(value(row, "route")));
        if (!value(row, "frequency").isBlank())
          dosage.put("timing", Map.of("code", concept(value(row, "frequency"))));
        if (!dosage.isEmpty()) item.put("dosageInstruction", List.of(dosage));
        Map<String, Object> dispense = new LinkedHashMap<>();
        if (row.get("quantity") instanceof Number n) dispense.put("quantity", Map.of("value", n));
        if (row.get("refills") instanceof Number n) dispense.put("numberOfRepeatsAllowed", n);
        if (!dispense.isEmpty()) item.put("dispenseRequest", dispense);
      }
      case "MedicationDispense" -> {
        item.put("status", "unknown");
        item.put("subject", subject);
        item.put("note", notes(details));
        String related = value(row, "related_id");
        // Use the original prescription's medication name rather than a dispensing-event title.
        String medication = byId.containsKey(related) ? value(byId.get(related), "title") : title;
        item.put("medicationCodeableConcept", concept(medication));
        if (byId.containsKey(related) && "prescription".equals(value(byId.get(related), "kind")))
          item.put("authorizingPrescription", List.of(reference(related)));
        if (row.get("quantity") instanceof Number n) item.put("quantity", Map.of("value", n));
      }
      default -> {
        item.put("status", "amended".equals(value(row, "status")) ? "superseded" : "current");
        item.put("subject", subject);
        item.put("date", created);
        item.put("author", List.of(authorRef));
        item.put("description", title);
        item.put("content", List.of(Map.of("attachment", attachment(title, details))));
        String replaces = value(row, "replaces_id");
        if (byId.containsKey(replaces) && "note".equals(value(byId.get(replaces), "kind")))
          item.put("relatesTo", List.of(Map.of("code", "replaces", "target", reference(replaces))));
      }
    }
    return item;
  }

  private static Map<String, Object> attachment(String title, String details) {
    return Map.of(
        "contentType",
        "text/plain",
        "title",
        title,
        "data",
        Base64.getEncoder().encodeToString(details.getBytes(StandardCharsets.UTF_8)));
  }

  private static List<Map<String, Object>> notes(String details) {
    return List.of(Map.of("text", details));
  }

  private static Map<String, Object> coded(String system, String code) {
    return Map.of("coding", List.of(Map.of("system", system, "code", code)));
  }

  private static Map<String, Object> concept(String text) {
    return Map.of("text", text);
  }

  private static Map<String, Object> unknown() {
    return Map.of("extension", List.of(Map.of("url", ABSENT, "valueCode", "unknown")));
  }

  private static Map<String, Object> reference(String id) {
    return Map.of("reference", "urn:uuid:" + id);
  }

  private static Map<String, Object> resource(String type, String id) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("resourceType", type);
    m.put("id", id);
    return m;
  }

  private static Map<String, Object> entry(Map<String, Object> resource) {
    return Map.of("fullUrl", "urn:uuid:" + resource.get("id"), "resource", resource);
  }

  private static String value(Map<String, Object> map, String key) {
    Object v = map.get(key);
    return v == null ? "" : v.toString();
  }

  private static String first(Map<String, Object> map, String... keys) {
    for (String key : keys) if (!value(map, key).isBlank()) return value(map, key);
    return "";
  }

  private static String derived(String text) {
    return UUID.nameUUIDFromBytes(text.getBytes(StandardCharsets.UTF_8)).toString();
  }

  private static Map<String, Object> narrative(String text) {
    return Map.of(
        "status",
        "generated",
        "div",
        "<div xmlns=\"http://www.w3.org/1999/xhtml\">"
            + text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
            + "</div>");
  }
}
