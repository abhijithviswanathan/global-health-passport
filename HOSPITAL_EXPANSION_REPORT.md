# Hospital ecosystem expansion — implementation report

The existing Global Health Passport was extended in place. Source, local database, encrypted media, saved web/API builds and mobile exports remain in the project reached through **Desktop → Health Passport**. The latest application runs locally at **http://localhost:5173**. The React Native browser harness runs separately at **http://localhost:5174**.

This is a working synthetic local implementation with explicit external integration and production-release boundaries. It is not a production hospital rollout. The report separates executed verification from features requiring real credentials, institutional decisions or device validation.

## Implemented features

| Area | Result |
|---|---|
| Organization ecosystem | Stable UUID tenant identity plus public Organization ID, parent healthcare groups, locations/departments/units/teams and descriptive service/hours/capability configuration |
| Onboarding | Pending healthcare/insurer organization request, separate work administrator account, independent reviewer evidence and verified/suspended lifecycle |
| Work identity | Separate employment account and Work ID, expiring hashed invitations accepted in both clients, professional-role metadata, encrypted license, jurisdiction/specialty, dates and role-limited clinical privileges |
| Staff access | Active membership, credential status/expiry, role ceiling, clinic/care assignment and patient consent checks; offboarding revokes sessions, assignments and future shifts while retaining historical records |
| Portals | Doctor, nurse, lab, imaging, pharmacy, reception, billing, administration, security and insurer tools adapted by authenticated role; existing clinician/care-team screens retained |
| Nursing | Existing structured vitals plus pain, assessment, observations, intake/output, wound/status/notes and prescription-linked medication administration; structured handoffs and incoming acknowledgment |
| Work grid/tasks | Authorized patient/colleague/location/time/priority/status cards, filters/search/sort, dependencies, acknowledgment, waiting/blocking, escalation/cancellation, completion and independent verification |
| Workforce | Shifts, rotations, on-call, leave, breaks, coverage, substitutions, procedure blocks and department-scoped management; existing appointments and blocking intervals constrain doctor availability |
| Public booking | Only published 30-minute slots are visible; patient books self; transactional slot recheck and replay-safe booking; clinical permission remains separately required |
| Clinical orders | Lab, imaging, medication, procedure, consultation and therapy orders linked to existing record/task infrastructure and appropriate same-clinic recipients |
| Laboratory | Specimen identifiers, two-identifier collection safeguard, processing/result stages, dated result record, critical event and ordering clinician review |
| Imaging | Workflow stages and DICOM study identifier metadata, report result, radiologist attestation and ordering clinician review; no pixel/PACS retrieval claim |
| Communication | Existing scoped direct/department/team/patient-context conversation, task comments, attachments, mentions/read state, priority and handoffs; operational messages remain distinct from legal clinical records |
| Operations | Authorized aggregate staffing, tasks, appointments and lab/imaging workload without broad clinical narratives |
| Insurance | Encrypted member/group/policyholder identifiers, policy metadata/dates/order/card, separate patient-controlled sharing, explicit audited reveals, revocation and purpose-limited eligibility checks |
| Insurance cards | Encrypted/quarantined dedicated uploads, separate access boundary from clinical documents, authorized file/image viewing; ordinary document consent cannot expose a card |
| Marketplace | Verified insurer submissions, independent plan review, objective comparisons/sorting, no diagnosis-based ranking, no insurer clinical access, sponsorship disabled |
| Events/audit | Tenant event metadata, generic web SSE and native cursor fallback, read markers, audit of important workflows and continued record revisions/authorship |
| Mobile | Shared workflow contract and React Native forms/cards, invitation acceptance, insurance photo selection/capture, role navigation and existing secure-session/biometric design retained |

Use [the illustrated guide](docs/ORGANIZATION_ECOSYSTEM.md) for account names, screenshots and step-by-step workflows. The demo includes NorthStar Hospital, Dr Smith, Nurse Williams, Technician Lee, Technician Patel, supporting staff and Alice Morgan. The same current demo password is in `LOCAL_ACCESS.txt`; this report does not duplicate it.

## Architecture and database

The Java/Spring Boot modular monolith, H2 local store/PostgreSQL target, React web and React Native app were preserved. No microservice rewrite was introduced. New domain services extend the original consent, identity, clinical record, appointment, document and audit boundaries. Both clients share `apps/shared/ecosystem-model.ts` and the server remains the permission authority.

Flyway **V15–V18** add tenant hierarchy/employment, workforce, events/orders/task dependencies, coverage/shares/eligibility/marketplace, structured nursing/attestation, message priority and the dedicated insurance-card purpose. Composite foreign keys protect tenant-local hierarchy relationships. Sensitive insurance/license values use existing encryption. The live local V14 database was backed up while stopped, upgraded to V18, restarted and exercised without removing earlier records or accounts.

Isolation is application-enforced in a shared database with tenant foreign keys, not physical isolation or PostgreSQL RLS. Session/synchronization/event delivery remain designed for one application process. Parent groups do not automatically inherit child facility access. Capability descriptions are configuration metadata, not executable hospital clinical rules.

## API and interoperability

New route families: `/api/ecosystem/*`, `/api/insurance/*`, plus task verification/expanded transitions in `/api/care/*`. All supported mutations use session/CSRF protection. Versioned records reject stale updates; role/tenant/care/consent checks apply before disclosure and workflow actions.

FHIR collection projections add Organization, Location, HealthcareService, PractitionerRole, Schedule, Task, ServiceRequest, Specimen, registered ImagingStudy metadata, nursing Observation/MedicationAdministration, handoff Communication and consent-scoped patient-reported Coverage. Existing patient clinical exports remain. These are projections, not a general FHIR CRUD/search server or conformance certification. The [API](docs/API.md) and [FHIR](docs/FHIR.md) docs describe exact scope.

Eligibility has synthetic and unconfigured providers plus an optional deployment-configured HTTPS gateway adapter. The adapter uses a server-held token, no redirects, bounded response size/time and strict status parsing, and sends insurance fields only. Demo mode rejects real gateway configuration. No live insurer was contacted. Real gateway credentials, contract and vendor-specific validation are still required. Claims, prior authorization, EOB and clearinghouse processing remain future work as requested.

## Security and privacy review

Executed tests cover foreign-tenant administration/orders, scoped clinical reads, nurse/insurer/reception restrictions, ended employment, patient/internal-operations separation, insurance revocation and encryption, card isolation, specimen mismatch, stale records/drafts and existing authentication/consent/document controls. All clinical entry paths retain source, observed time, author, encounter and revision/amendment metadata. Radiology attestation captures a signer/content hash/time; it is not a certificate-backed digital signature.

Marketplace plans are structurally separate from clinical PHI. Insurer accounts cannot browse patient charts or insurance profiles. No patient-diagnosis targeting or PHI marketing pipeline exists. Sponsorship is disabled pending an appropriate legal/commercial decision. Patient sharing does not override provider retention duties. Generic event signals contain no clinical narrative and require authorized detail fetches.

The application remains synthetic-only. Production initial MFA provisioning, real institutional/license validation, clinical scope/signature policies, managed keys/storage, independently retained audit, distributed session/rate limiting and validated urgent alert delivery require deployment and institutional review. This report is not a compliance certification or a full penetration test.

## Executed verification

| Check | Status | Actual scope |
|---|---|---|
| Backend/H2 package | PASS | 62 active cases, zero failures/errors; 31 PostgreSQL-only cases skipped in this invocation |
| PostgreSQL ecosystem suite | PASS | 14 cases, zero failures/errors, disposable PostgreSQL 17.11 database |
| Web type check/lint/build | PASS | TypeScript, ESLint, portable Sites production/static build |
| Native type check/exports | PASS | React Native TypeScript, iOS and Android JavaScript/Hermes exports |
| Native unit/policy tests | PASS | 18 tests including transport, state, calendar and emergency-cache policies |
| Full web browser suite | PASS | 14 cases, including persisted hospital forms, appointment/clinical paths, WebAuthn, quarantine, consent and accessibility |
| Native browser harness | PASS | 7 cases, including shared task/draft flows, revocation, nursing and insurance/marketplace navigation |
| Existing profile-photo browser regressions | PASS | 2 cases: onboarding, cross-client privacy, private clinical holders and skipped-onboarding recovery |
| Live local migration | PASS | Consistent pre-upgrade backup; V14→V18 applied; saved app restarted |
| Synthetic NorthStar setup | PASS | API-driven setup and safe rerun without duplicate staff/orders |
| Physical iOS/Android hardware | NOT TESTED | Camera permission/biometric/secure-store behavior and signed device binaries not executed |
| External FHIR validator/load/penetration/restore suite | NOT TESTED | Not inferred from integration tests or exports |
| Live insurer/EHR/PACS connectivity | BLOCKED | Missing real partner endpoints/credentials/contracts and validation |
| Sponsored activation/real clinical release | BLOCKED | Requires actual legal/clinical/institutional decisions |

Backend cases are counted per execution, including inherited cases; H2 and PostgreSQL counts are not claimed as unique scenarios. The first broad run found two legacy tests that created staff without new membership fixtures; those were corrected while preserving their denial assertions. The combined browser run exceeded the unchanged synthetic registration limit; separate runs passed. A mobile test selector mismatch was corrected. No test or security protection was removed to obtain a passing result.

Current evidence and exact commands: [ECOSYSTEM_VERIFICATION.md](docs/ECOSYSTEM_VERIFICATION.md), [machine-readable results](docs/evidence/ecosystem-verification.json), and `docs/evidence/ecosystem-verification/`. Browser-harness runs substitute device APIs; they do not prove native device security.

## Files and documentation

New backend modules: TenantService, EcosystemApi, ClinicalOperationsApi, InsuranceApi, EligibilityProvider, HttpEligibilityProvider, OrganizationEventsApi and OrganizationFhirApi. Existing PassportApi, CareApi, ClinicianApi, OrganizationApi, DocumentApi, MedicationPassportApi, RecordProvenance and API error handling were extended to retain shared permission/provenance behavior.

New migrations: V15__organization_ecosystem.sql, V16__insurance_and_notifications.sql, V17__clinical_execution.sql, V18__insurance_card_boundary.sql. New shared/client modules: ecosystem-model.ts, web ecosystem-workspace.tsx/CSS, native EcosystemWorkspace.tsx. Existing client navigation/account entry/care model were extended. Test additions include EcosystemWorkflowTest, PostgresEcosystemWorkflowTest, EligibilityProviderTest, insurance-card tests and ecosystem UI suites in both clients. `scripts/setup_ecosystem_demo.py` creates the local walkthrough; `.env.example` documents the optional gateway.

Updated/created documentation: PROJECT_SOURCE_OF_TRUTH.md, CHANGELOG.md, README.md, README_USER_GUIDE.md, apps/mobile/README.md, docs/PRD.md, SRS.md, ARCHITECTURE.md, DATABASE.md, FHIR.md, API.md, SECURITY.md, COMPLIANCE.md, THREAT_MODEL.md, TESTING.md, MOBILE.md, DEPLOYMENT.md, PLATFORM_PARITY.md, EXPANSION_PROGRESS.md, ORGANIZATION_ECOSYSTEM.md, ECOSYSTEM_VERIFICATION.md; ADRs 0012–0014; screenshots and evidence. Earlier delivery reports/evidence remain historical and are not counted as current verification.

## Run now

1. Open **Desktop → Health Passport → Start Health Passport.command**, or from project root run `python3 scripts/start_saved.py --no-open`.
2. Visit http://localhost:5173 and sign in with a hospital account from the illustrated guide, using the existing local demo password.
3. Open Hospital workspace. For the patient, use Insurance, Hospitals, Book appointment or Marketplace. For staff, use the role-specific tabs and the existing Care team/doctor workspace.
4. Keep the launcher open. The native browser harness at http://localhost:5174 is a separate development process; its exact start command is in the verification guide.

No deployment, publication, app-store release, real patient enrollment, external clinical data transfer or sponsored placement was performed.
