# FHIR interoperability

FHIR R4 is the initial mapping target. An exporter is not a conformant FHIR server. SMART on FHIR, partner authentication, resource validation, terminology binding and vendor certification require separate work. R4B support must be tested explicitly rather than assumed from R4 output. Use only authorized partner interfaces and licensed terminology.

| Domain concept | FHIR resource candidate | Mapping considerations |
|---|---|---|
| Patient identity | Patient | Public identifier system, no internal credential data |
| Professional/organization | Practitioner, PractitionerRole, Organization | Independent verification and organization membership |
| Visit | Encounter | Clinical period distinct from recording timestamp |
| Diagnosis | Condition | Coding system/version, clinical/verification status |
| Allergy | AllergyIntolerance | Substance, reaction, criticality, unknown versus none |
| Vitals/lab values | Observation | Value type, units, reference range, effective time |
| Lab report/order/specimen | DiagnosticReport, ServiceRequest, Specimen | Patient/order linkage and result references |
| Prescription and use | Medication, MedicationRequest, MedicationStatement | Do not conflate prescription, patient report and dispensing |
| Pharmacy event | MedicationDispense | Authorizing prescription, quantity and performer |
| Procedure/immunization | Procedure, Immunization | Historical status and source |
| Plan/team | CarePlan, CareTeam | Intent, participants and validity |
| Imaging | ImagingStudy | DICOM identifiers and protected retrieval metadata |
| Attachment | DocumentReference | Content type, integrity and authorized attachment resolution |
| Sharing | Consent | Internal policy evaluation remains authoritative |
| Lineage/access | Provenance, AuditEvent | Resource versions, actor and activity |
| Insurance/cost claim | Coverage, Claim | Deferred until billing scope and jurisdiction decided |

Preserve partner identifier namespace, original identifier/version, source organization, author and timestamps. Unknown coding must remain explicitly uncoded; do not invent SNOMED/LOINC/RxNorm values. UCUM conversion requires verified semantic equivalence. Clinical narrative escaping and reference integrity require tests.

Conformance gate: publish CapabilityStatement and supported profiles/operations; validate representative positive/negative resources using a maintained validator; test read/export authorization, restricted category handling, duplicate imports, idempotency, amendments, missing references and round trips with each partner. Current mapper behavior is described by source/tests; no broad R4/R4B conformance claim is made.

## Current executable subset
Patient-self export now maps Patient, Practitioner, PractitionerRole and Organization plus clinical Encounter, Condition, AllergyIntolerance, MedicationStatement, ServiceRequest, DiagnosticReport, MedicationRequest, MedicationDispense, DocumentReference and Provenance as available. Allergy records without a captured valid clinical status become a DocumentReference plus warning OperationOutcome, because the R4 required binding does not permit an invented unknown allergy status. Conditions without captured status omit clinicalStatus/category where permitted. Application active/amended state remains separate metadata. Amendment lineage uses revision provenance. The export is a historical collection; consumers must resolve history and must not treat every entry as a current active clinical item. Public UUID resource IDs are distinct from hidden numerical database primary keys.

Still absent: numeric coded Observation (source laboratory content is narrative), Specimen, standalone Medication (codeable concepts used), Procedure, Immunization, CarePlan/CareTeam, ImagingStudy with DICOM UIDs, Consent/AuditEvent mappings and Coverage/Claim. Encrypted uploaded-file metadata is not yet included in the timeline export. SMART, authorized partner import, terminology validation and full profiles remain pending. The final verification report distinguishes local parser/validator results from broader interoperability.

V7 adds nullable captured clinical_status. New synthetic fixtures explicitly label known active statuses; existing records are not retroactively assigned a clinical status.

## Executed local validation
FhirMapperTest (2 cases) and FhirApiTest (1 case) passed after the status-mapping correction. A local HAPI validator using bundled official R4 definitions accepted the 29-resource historical collection and CapabilityStatement; strict parsing passed. Nine informational/warning messages remained, including the hostile-text fixture and OperationOutcome narrative warning. This validates the tested synthetic subset, not an external partner/profile, terminology license, import round trip or universal FHIR conformance.
