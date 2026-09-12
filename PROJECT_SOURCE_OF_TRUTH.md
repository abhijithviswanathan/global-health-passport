# Global Health Passport — project source of truth

## Current revision — September 11 fictional presentation showcase

Added four fictional NorthStar patient stories, including three new accounts and the existing Alice account. The shared backend now holds 33 additional clinical entries (26 authored, five order records, two completed reports), four appointments, a saved unfinished SOAP draft, four curated nurse tasks plus five order-linked tasks, three conversations/six messages, two handoffs, two patient insurance profiles with billing shares, and three approved fictional plans. Pending requests intentionally remain pending. Patient-reported uncertainty, source authors and separate care/upload dates remain explicit.

`scripts/setup_showcase_demo.py` populates this through the existing API with stable request keys and a matching local manifest. It preserves existing records and staged user progress. The fixed presentation schedule is September 11, 2026; reruns do not silently reschedule appointments. `scripts/verify_showcase_demo.py` checks the saved demonstration state. All content is invented and no external insurer/EHR/PACS service was contacted.

PASS in this revision: read-only fixture assertions; no duplicate Showcase clinical records after repeat setup; matching staff/patient record IDs; unrelated staff and cross-patient denials; four focused browser checks covering web doctor/nurse and native-code patient/nurse views; lint of the added browser-test files. Physical native devices and the complete prior backend regression suites were not rerun for this data/report revision.

The illustrated PDF and full inventory/presentation script are recorded in [DEMO_SHOWCASE_REPORT.md](DEMO_SHOWCASE_REPORT.md). Evidence: [API assertions](docs/evidence/showcase-verification.json), [browser tests](docs/evidence/showcase-ui.json), [fixture manifest](docs/evidence/showcase-demo.json). Everything is local under the existing Desktop → Health Passport project link. Existing README files were preserved.

## Previous revision — September 11 organization ecosystem

The latest delivered local revision is documented in [HOSPITAL_EXPANSION_REPORT.md](HOSPITAL_EXPANSION_REPORT.md) and [the illustrated organization guide](docs/ORGANIZATION_ECOSYSTEM.md). It extends the existing application with stable tenant identities, separate employment/Work IDs, verified onboarding, workforce/public booking, clinical tasks/orders/nursing/handoffs, patient insurance sharing and an independently reviewed PHI-separated marketplace in web and React Native. Flyway V15–V18 are applied locally after a consistent backup. Prior milestones below remain historical where their counts or scope differ.

Current executed evidence: PASS — 62 active H2 backend cases, 14 PostgreSQL ecosystem cases, 14 web browser cases, 7 native browser-harness cases, 2 photo browser regressions and 18 mobile unit/policy tests; both client type checks, web lint/build and iOS/Android JavaScript exports. See [machine-readable evidence](docs/evidence/ecosystem-verification.json) for exact scope. Database-specific skipped cases are not counted as passes.

Live insurer/EHR/PACS connections, sponsored activation and real clinical/institutional release are BLOCKED by missing partner inputs or legal/clinical decisions. Physical native-device behavior, external FHIR validation, scale/penetration checks and the V18 disaster-recovery restore are NOT TESTED. This remains a synthetic local pilot, not a production-ready clinical deployment. All files remain local through Desktop → Health Passport; no publication occurred.


## Authority and delivery status
The user supplied the 46-section master specification and approved continuing all phases autonomously on 2026-09-10. This overrides repeated phase approval prompts, not requirements for evidence, security or external clinical/legal validation. The original is preserved in `docs/MASTER_REQUIREMENTS.md` and fully mapped in `docs/MASTER_TRACEABILITY.md`.

Current status: **synthetic development delivery, with substantial implemented functionality and an open full-product backlog**. Backend, database, mobile and final web/browser evidence are recorded below. No live-patient release or production deployment is claimed. Documentation/phase reports distinguish design targets, implemented controls and executed checks.

## Vision, approved scope and constraints
Provide a lifetime, provenance-preserving record across participating organizations using a permanent random Health ID and enforceable patient sharing. The complete original specification remains the requirements baseline. Current executable workflows focus on adult self-managed outpatient synthetic data. Future scope is not erased by that boundary.

Never use real patient data for development, treat Health ID/QR as unrestricted authorization, silently merge identities, overwrite original records with generated content, scrape proprietary EHR databases or equate pseudonymization with anonymity. Patient sharing controls do not override provider legal retention.

## Architecture and technology decisions
- Java 21 / Spring Boot 3.5.16; a single-process modular backend. Explicit packages/classes organize concerns but do not create operational security isolation.
- PostgreSQL deployment target; persistent H2 default for simple local development. Real PostgreSQL 17.11 separately passed all ten migrations and seven workflow cases.
- React/TypeScript web from the Sites vinext starter. Vinext is beta; production runtime suitability remains a release review item. Java remains the authorization authority.
- React Native/Expo patient client. JavaScript builds and policy tests do not establish OS/device security.
- Flyway V1–V8: foundational users/records/grants/audit; structured assigned orders; identity/recovery/session registry; encrypted documents; WebAuthn; signed medication references; captured clinical status; practitioner verification.
- Local encrypted document/signing files supplement transactional storage. Independent audit retention, KMS, notification/scanning workers and regional deployments remain production work.
- Avoid unneeded Redis/search clusters/vector stores/Kubernetes; add based on measured need. The learning corpus is immutable synthetic data and does not ingest clinical tables.

ADRs record these decisions and consequences. Material changes require updating this source of truth and the affected contract/evidence.

## Security and identity decisions
Public Health IDs use 9 characters from a 32-character unambiguous alphabet (45 cryptographically random bits), per the user’s shorter-ID revision, distinct from public resource UUIDs and hidden numeric database primary keys. Identifiers reveal no grant. Registration is synthetic-only; duplicate reconciliation/contact verification remain unimplemented.

Authentication uses BCrypt with explicit 72-byte UTF-8 bounds, server sessions, CSRF on POSTs, session-ID rotation and database revocation checks. Unknown-user password login performs dummy BCrypt work. Absolute session lifetime is 15 minutes; servlet sessions remain process-local. TOTP uses java-otp with encrypted secrets, confirmation and replay prevention. Eight random one-time recovery codes are hashed; recovery invalidates factors, challenges and sessions. WebAuthn uses maintained Yubico verification with exact RP/origin, mandatory user verification and expiring one-use session-bound challenges. Non-demo staff password login requires MFA by default; production profiles reject demo/disabled staff-MFA configuration.

Clinical staff require verification state on login and protected access. Organization admins can update only their own clinical members' evidence/status; suspension revokes grants/sessions. This does not verify a professional license externally. Tenant provisioning and generic in-app events are now implemented as described above; federated OIDC, distributed throttling/push delivery, device validation and managed key lifecycle remain deployment work.

Authorization combines trusted actor role, organization, patient relationship/grant, purpose, category, assignment and time. Revoke/suspension take effect on subsequent protected requests. Admin is not a clinical role. Audit is hash-linked and append-oriented in the shared database, not independently immutable.

## Clinical and interoperability conventions
Patient-entered contributions remain visibly unverified. Author/source/recording time and amendment lineage are retained. Record details are substantially narrative; captured prescription fields and clinical-status fields add structure. Internal active/amended state is not automatically a clinical status.

FHIR R4 is a bounded historical collection, not a full FHIR server. Resource-specific mapping includes identity/provider/context, supported clinical types and provenance. Unknown allergy clinical status falls back to DocumentReference plus warning OperationOutcome rather than inventing a required code. Consumers must resolve amendment history. Remaining resource types, full coding/units, SMART, imports and partner validation remain open.

Clinical-time precision, controlled terminology, comprehensive status semantics, legal signatures and typed domain completeness are targets rather than falsely assumed properties of every current record.

## API, UI and repository conventions
API prefix `/api`; opaque resource IDs, JSON responses, trusted server role/author derivation, CSRF header and cookie sessions. `docs/API.md` is the current contract. Web uses a same-origin proxy, renders clinical text as data, and stores only theme preference in browser localStorage. Mobile persists only explicitly selected bounded emergency content through SecureStore APIs, not a whole-record cache.

UI targets responsive reflow, source/context visibility, restrained light/dark tokens, about 8px card radii, accessible labels/focus and WCAG 2.2 AA. Automated checks do not replace manual screen-reader/clinical usability review.

Repository: `apps/backend`, `apps/web`, `apps/mobile`, `docs`, `ADRs`, `scripts`, `infra`, `tests`. Root launcher/configuration provide synthetic setup. Secrets, generated credentials, local databases, key files, dependency/build caches and runtime files are excluded from version control. Requirements trace PRD → SRS → evidence; avoid recording an unexecuted check as passed.

## Implemented functionality
Synthetic registration/Health ID; password/TOTP/passkey/recovery and session controls; patient and provider web workflows; patient mobile online views and selected emergency-copy policy; records/timeline/amendments; sharing requests/approval/denial/expiry/revocation; assigned lab/pharmacy orders/results/dispenses and idempotency; audit history; encrypted file quarantine; local expiring signed medication credentials; supported R4 mapping/provenance; doctor-only fictional case retrieval; authorized deterministic source excerpts; organization verification/suspension foundation.

## Verification ledger
- Default full backend package: 38 discovered cases, **31 executed passed**, 7 optional PostgreSQL skipped, 0 failures/errors.
- Separate real PostgreSQL 17.11: **seven workflow cases passed**, V1–V10 migrated. This supersedes earlier host IPC failures.
- Logical application-data restore: **13 tables**, seven identity-sequence states and **36 audit-chain events** matched. Optional-feature tables were empty; not PITR/physical/blob/key recovery.
- FHIR: three local tests passed, including official-R4 subset validation and strict parsing; no partner certification.
- Maven/OSV: final **148 project artifacts, zero matches** after fixing original findings. Build-plugin HTTP dependencies also patched. Not a complete OS/container/plugin or application-security audit.
- Mobile: **eight tests**, TypeScript check and iOS/Android JavaScript exports passed; npm audit zero. Native device enforcement/signing remains unverified.
- Web: static build, TypeScript, lint (0 errors/warnings), Prettier and npm audit (0 findings) passed. Final Playwright: **9 passed**, 0 failed/skipped/flaky, 30.6 seconds against static production-format build and live backend. Includes full cross-role workflow, source amendments/XSS text, virtual-authenticator WebAuthn, quarantine/signed QR, FHIR/source/learning, admin denial and eight-view automated WCAG/responsive/dark/200%-text checks. Initial browser launch blockers were superseded by this successful run.

Evidence: `docs/evidence`, `apps/backend/POSTGRES_VERIFICATION.md`, `apps/backend/postgres-verification-evidence.json`, mobile README and final delivery report. No private database snapshot or secret key is part of report evidence.

## Remaining functionality and external decisions
Complete clinical breadth (procedures, immunizations, admissions, referrals/care plans, diet/recovery, availability/reminders/calendar integrations, coverage/costs); verified contacts and duplicate identity reconciliation; delegates/minors; full FHIR/authorized integrations/terminology; DICOM; licensed drug knowledge; emergency governance; real-data de-identification and clinical AI; legal lifecycle/rights/retention/holds; native verification and distribution; production operations, independent security evaluation and key/blob/PITR restoration.

Choose launch country/state and responsible entities; provider-sponsored versus consumer operating contracts; real EHR/lab/pharmacy partners and licenses; hosting/residency, budget and approved SLOs; clinical, privacy/legal, security and operations owners. These decisions block a live release, not synthetic development.

## Compact Health ID revision

At the user’s request, canonical IDs now contain nine unambiguous letters/digits. V9–V10 preserve old long IDs as lookup aliases without changing patient UUIDs or clinical references. Updated checks passed: 26 backend tests, seven separate PostgreSQL workflow tests and seven browser journeys. Database uniqueness/collision retries, migration stability, case/separator normalization and readable phone layouts are covered. See `docs/evidence/compact-health-id-verification.json` (from the repository root). Earlier logical-restore evidence remains scoped to V1–V8; the restore harness now also includes the alias table.

## Doctor workspace revision

The web now has explicit Patient and Doctor / care team entry, with server-role routing. Doctors have Today, searchable authorized Patients, and a dated Appointments agenda. Booking, conflict detection, rescheduling, check-in, cancellation and no-show state persist in V11. A shared-chart/visit-note workspace saves drafts on the server and files one reviewed encounter atomically when completing a visit. Back, browser history and the logo support navigation. Only the schedule date preference is stored in sessionStorage. See `docs/CLINICIAN_WORKSPACE.md`.

V11 was exercised on local H2 with five new clinician integration tests. The separate PostgreSQL and restore evidence remains scoped to earlier migrations; V11 has not been included in those drills. External invitation delivery, calendar synchronization, availability rules and video infrastructure remain unimplemented.

Doctor revision final verification: all nine browser journeys passed, including doctor navigation at 1440/768/390/320px, visit-editor accessibility and the booking-to-filed-encounter workflow. TypeScript, ESLint, formatting and the web production build passed. Desktop and phone visit-editor screenshots were visually reviewed after responsive layout settled. Raw evidence: `docs/evidence/clinician-workspace-verification.json`.

## Cross-platform change policy

The user explicitly requested on 2026-09-10 that future feature changes be applied everywhere. Treat web and mobile as one product: review each affected workflow on both clients, implement equivalent behavior with platform-appropriate controls, share the server contract, test cross-client continuity, and document any platform limitation. Do not silently deliver a web-only change. Native behavior must not be claimed as device-verified without native evidence.

## Mobile parity delivery — 2026-09-10

The doctor workflow now exists in mobile source as well as web: separate entry, Today, authorized Patients, Appointments, source chart, rescheduling/status changes, saved visit drafts and reviewed single-encounter completion. Patient and doctor Back/Home navigation are included. The same nine-character server Health ID appears in both clients. Future cross-platform change requirements are recorded in AGENTS.md and `docs/PLATFORM_PARITY.md`.

Final verification: 14 mobile policy/transport tests passed, strict TypeScript passed, and both iOS and Android Metro/Hermes bundle exports passed. Three browser-harness journeys passed in 6.3 seconds, including an actual mobile-screen → web-portal → mobile-screen draft journey and revoked chart access. The native app source was rendered through React Native Web with explicit native-feature test substitutes; this does not establish device behavior. No native simulator devices were installed, and no signed binary/device test is claimed. Evidence: `docs/evidence/mobile-clinician-verification.json`. Older mobile gaps are explicitly retained in the parity matrix.

## Doctor design refinement verification

The visual timestamp agenda, patient cards and compact navigation are implemented on web and mobile. Final checks: 17 mobile/shared policy tests, three targeted web browser journeys and three mobile-harness journeys passed. Both strict type checks, web lint/build, and iOS/Android Hermes exports passed. Populated schedule and patient-card screenshots were visually reviewed. Web testing here is a targeted three-case regression, not a new run of the entire earlier nine-case suite. Native-device verification remains unavailable. See `docs/evidence/doctor-ui-refinement.json`.

## Profile-photo and local delivery revision
Both patient and doctor clients now include a compact account menu, optional photo onboarding and later Settings access. The shared API stores independent profile audiences (owner, care team, selected usernames, authenticated public) and private clinical doctor/organization identification photos. Patients receive holder/purpose/date metadata without the private image. V12 stores policy/holder metadata; AES-GCM image files stay on the API host. A bundled YuNet model checks face presence locally, without identity or liveness claims. The Desktop shortcut points to the local repository, with a saved-build launcher and `README_USER_GUIDE.md` illustrations. Future README modifications require user approval; cross-platform parity remains the standing rule.

The photo revision's definitive checks and their platform limits are in `docs/evidence/profile-photo-verification.json`. Earlier ledger counts above refer to their historical revisions. Docker/native-device execution is not implied by recipes or bundle exports.
