# Product requirements

## Decision record
The user approved continued autonomous execution after Phase 0. The approved vision remains the complete longitudinal health platform in the original prompt. Engineering proceeds with a synthetic adult outpatient implementation while jurisdiction, commercial operating model, clinical partners, budget and production hosting remain unresolved. This development boundary is not cancellation of the broader requirements. No real patient data is authorized for this build.

## Intended use and users
The product connects patients and participating providers through a permanent Health ID and explicitly authorized longitudinal records. It supports record continuity and documentation; it does not establish a diagnosis, substitute for professional judgment, or guarantee international prescription acceptance.

| Persona | Need | Success condition |
|---|---|---|
| Adult patient | Understand history and control disclosure | Can distinguish source records, grant access, revoke and inspect access history |
| Verified clinician | Document care with enough relevant context | Can request access, view permitted categories and create traceable encounters/prescriptions |
| Laboratory worker | Associate a result with an authorized order | Cannot submit unrelated results or browse unrelated clinical history |
| Pharmacist | Verify and dispense an active prescription | Minimum necessary view, validated quantity and traceable dispensing |
| Organization administrator | Manage staff and membership | Administrative role alone cannot open clinical records |
| Security/privacy reviewer | Investigate access and disclosure | Can inspect appropriate events without unrestricted clinical content |

## Core journey and acceptance criteria
PRD-01 Identity: register a synthetic patient, receive a permanent random Health ID; ID must survive contact changes and convey no access. Collisions are rejected by database constraints. Duplicate candidates require human reconciliation.

PRD-02 Record continuity: patient sees source-labelled conditions, allergies, medications, encounters and results ordered by clinical time. Original author, source and recording time remain available. Patient contributions never acquire provider verification implicitly.

PRD-03 Consent: clinician identifies a patient and requests category-scoped access with purpose and expiry. Patient approves or denies. Revocation stops subsequent protected requests; repeated requests do not resurrect revoked grants. Restricted views indicate possible incompleteness without disclosing hidden categories.

PRD-04 Clinical workflow: authorized clinician records encounter and prescription. Corrections preserve prior versions and author. Cross-patient resource substitution must fail.

PRD-05 Laboratory: clinician orders a test; laboratory posts a structured result against that order. Patient sees result and attribution. Mismatched patient/order or unrelated laboratory fails.

PRD-06 Medication: pharmacy sees active prescription information needed for dispensing, records quantity and history, and cannot exceed permitted supply. Passport preserves prescriber and source. No drug-conflict result is shown as clinically validated without an authoritative licensed knowledge source.

PRD-07 Audit: patient can inspect readable access and sharing history. Security audit captures decisions and relevant identity without copying clinical payloads.

PRD-08 Mobile: patient dashboard, timeline, consent and passport use the same protected API. Device biometrics unlock locally protected material, never establish server authorization independently.

PRD-09 Research and AI: identifiable records are excluded from global case search. Synthetic search is a separate learning demonstration. AI output is labelled and source-linked, never silently writes records, and remains gated for clinical use.

PRD-10 Release: repository includes executable applications, setup, synthetic workflows, test evidence, known limitations and operational instructions. Passing development checks is not external clinical or regulatory approval.

## Full-scope backlog
The delivery register must retain: passkeys, TOTP, recovery and adaptive step-up; independently verified practitioners; duplicate reconciliation; delegate/minor rules; admission/discharge; referrals, procedures, surgeries, immunizations and CarePlans; insurance/costs; diet and recovery tracking; appointments and medication reminders; secure document uploads and malware quarantine; imaging orders, DICOMweb and viewing; emergency break-glass; signed medication credentials and refill controls; SMART authorization and vendor adapters; licensed terminology/drug data; separated secondary-use processing; clinically validated AI; legal holds and deletion; regional deployments, KMS, immutable audit sinks, monitoring, backup/restore and disaster recovery. Each absent item remains unmet, even if represented in a design or a screen.

## Roadmap and release gates
1. Establish requirements, architecture and synthetic runnable foundation.
2. Verify identity, authorization, records and the cross-role workflow.
3. Complete secure authentication, document/imaging, mobile native verification and operational controls.
4. Complete licensed integrations, clinical safety evaluation and jurisdiction-specific review.
5. Pilot under approved contracts, monitored operations and rollback capability.

## Provisional nonfunctional targets
These are engineering acceptance targets, not measured results: WCAG 2.2 AA; 320px through 2560px responsive layouts and 200% browser zoom; p95 protected reads under 500ms and writes under 1s at 50 concurrent synthetic users excluding upstream integrations; online revocation effective on the next request; 99.9% monthly service availability after production operations exist; RPO at most 15 minutes and RTO at most 4 hours after restoration exercises. Load dataset: 10,000 synthetic patients with 100 timeline entries each. Target ownership and operating costs require confirmation before contractual use.


## September 11 organization ecosystem expansion

The product now includes verified healthcare organization onboarding, separate work identities, role-specific hospital workspaces, department configuration, workforce intervals/public booking, clinical task/order/handoff workflows, patient insurance sharing and an independently reviewed marketplace. Existing care-team charts, appointment documentation and patient-controlled timelines remain the clinical core. Web and React Native share the new form/permission contract. See [implemented workflows and screenshots](ORGANIZATION_ECOSYSTEM.md).

This is an executable synthetic pilot. Role categories do not replace local licensure/scope-of-practice policy. Marketplace information is patient-selected and separated from PHI; paid placement is disabled. Production clinical deployment, live insurer/PACS integration and device validation remain external release gates.
