package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.context.support.DefaultProfileValidationSupport;
import ca.uhn.fhir.parser.StrictErrorHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.hl7.fhir.common.hapi.validation.support.*;
import org.hl7.fhir.common.hapi.validation.validator.FhirInstanceValidator;
import org.hl7.fhir.r4.model.*;
import org.junit.jupiter.api.Test;

class FhirMapperTest {
  private static final String PATIENT = "10000000-0000-4000-8000-000000000001",
      AUTHOR = "10000000-0000-4000-8000-000000000002";

  Map<String, Object> row(String kind, int index) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", String.format("20000000-0000-4000-8000-%012d", index));
    row.put("patient_id", PATIENT);
    row.put("kind", kind);
    row.put("title", kind.equals("prescription") ? "Example medicine" : kind + " sample");
    row.put(
        "details", "Synthetic narrative with <script>text</script>; no numeric result asserted.");
    row.put("author_id", AUTHOR);
    row.put("author_name", "Synthetic clinical account");
    row.put("source", "Synthetic Outpatient Clinic");
    row.put("status", "active");
    row.put("created_at", "2026-09-10T12:00:00Z");
    return row;
  }

  @Test
  void validatesCompleteTypedCollectionAgainstLocalOfficialR4Definitions() throws Exception {
    List<Map<String, Object>> rows = new ArrayList<>();
    int i = 1;
    for (String kind :
        List.of(
            "allergy",
            "condition",
            "medication",
            "encounter",
            "lab_order",
            "lab_result",
            "prescription",
            "dispense",
            "imaging_report",
            "note")) rows.add(row(kind, i++));
    rows.get(0).put("clinical_status", "active");
    rows.get(5).put("related_id", rows.get(4).get("id"));
    rows.get(7).put("related_id", rows.get(6).get("id"));
    rows.get(6).put("quantity", 30);
    rows.get(6).put("refills", 2);
    rows.get(6).put("dosage", "one tablet");
    rows.get(6).put("route", "oral");
    rows.get(6).put("frequency", "twice daily");
    rows.get(6).put("duration", "15 days");
    rows.get(6).put("source", "Example Outpatient Clinic");
    rows.get(7).put("quantity", 30);
    rows.get(9).put("author_id", PATIENT);
    rows.get(9).put("source", "Patient entered — unverified");
    rows.get(9).put("status", "amended");
    var revision = row("note", 11);
    revision.put("replaces_id", rows.get(9).get("id"));
    rows.add(revision);
    rows.add(row("allergy", 12));
    var map =
        FhirMapper.bundle(
            Map.of("id", PATIENT, "healthId", "SYNTHETIC-ID", "displayName", "Synthetic Patient"),
            rows);
    String encoded = new ObjectMapper().writeValueAsString(map);
    FhirContext ctx = FhirContext.forR4();
    Bundle bundle =
        ctx.newJsonParser()
            .setParserErrorHandler(new StrictErrorHandler())
            .parseResource(Bundle.class, encoded);
    assertEquals(Bundle.BundleType.COLLECTION, bundle.getType());
    Set<String> types = new HashSet<>();
    bundle.getEntry().forEach(e -> types.add(e.getResource().fhirType()));
    assertTrue(
        types.containsAll(
            Set.of(
                "Patient",
                "Practitioner",
                "PractitionerRole",
                "Organization",
                "AllergyIntolerance",
                "Condition",
                "MedicationStatement",
                "Encounter",
                "ServiceRequest",
                "DiagnosticReport",
                "MedicationRequest",
                "MedicationDispense",
                "DocumentReference",
                "Provenance")));
    assertTrue(types.contains("OperationOutcome"));
    assertEquals(
        1,
        bundle.getEntry().stream()
            .filter(e -> e.getResource() instanceof AllergyIntolerance)
            .count());
    assertFalse(types.contains("Observation"));
    assertFalse(types.contains("ImagingStudy"));
    var medications =
        bundle.getEntry().stream()
            .map(Bundle.BundleEntryComponent::getResource)
            .filter(r -> r instanceof MedicationRequest)
            .map(r -> (MedicationRequest) r)
            .toList();
    assertEquals(1, medications.size());
    assertEquals("unknown", medications.getFirst().getStatus().toCode());
    assertTrue(
        medications.getFirst().getDosageInstructionFirstRep().getText().contains("one tablet"));
    assertFalse(medications.getFirst().getDosageInstructionFirstRep().hasDoseAndRate());
    assertFalse(medications.getFirst().getDispenseRequest().getQuantity().hasUnit());
    assertTrue(
        bundle.getEntry().stream()
            .map(Bundle.BundleEntryComponent::getResource)
            .filter(r -> r instanceof Provenance)
            .map(r -> (Provenance) r)
            .anyMatch(
                p ->
                    p.getEntity().stream()
                        .anyMatch(e -> e.getRole() == Provenance.ProvenanceEntityRole.REVISION)));
    // No remote terminology or validation support is installed in this chain.
    var support =
        new ValidationSupportChain(
            new DefaultProfileValidationSupport(ctx),
            new InMemoryTerminologyServerValidationSupport(ctx),
            new CommonCodeSystemsTerminologyService(ctx));
    var validator = ctx.newValidator().registerValidatorModule(new FhirInstanceValidator(support));
    var result = validator.validateWithResult(encoded);
    assertTrue(result.isSuccessful(), () -> result.getMessages().toString());
    var capabilityResult =
        validator.validateWithResult(
            new ObjectMapper().writeValueAsString(FhirMapper.capability()));
    assertTrue(capabilityResult.isSuccessful(), () -> capabilityResult.getMessages().toString());
    System.out.println(
        "FHIR local R4 validation: "
            + bundle.getEntry().size()
            + " resources, "
            + result.getMessages().size()
            + " informational/warning messages, zero errors.");
  }

  @Test
  void patientRecordProvenanceDoesNotInventPractitionerAndEscapesNarrative() throws Exception {
    var note = row("note", 1);
    note.put("author_id", PATIENT);
    note.put("source", "Patient entered — unverified");
    String json =
        new ObjectMapper()
            .writeValueAsString(
                FhirMapper.bundle(
                    Map.of("id", PATIENT, "healthId", "SYNTHETIC-ID", "displayName", "Synthetic"),
                    List.of(note)));
    var bundle =
        FhirContext.forR4()
            .newJsonParser()
            .setParserErrorHandler(new StrictErrorHandler())
            .parseResource(Bundle.class, json);
    assertEquals(3, bundle.getEntry().size());
    assertFalse(bundle.getEntry().stream().anyMatch(e -> e.getResource() instanceof Practitioner));
    var provenance = (Provenance) bundle.getEntry().get(2).getResource();
    assertEquals("urn:uuid:" + PATIENT, provenance.getAgentFirstRep().getWho().getReference());
    assertTrue(json.contains("&lt;script&gt;"));
  }
}
