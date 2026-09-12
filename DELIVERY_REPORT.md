# Delivery report — 2026-09-10

Current September 11 hospital ecosystem delivery: [implementation report](HOSPITAL_EXPANSION_REPORT.md), [illustrated guide](docs/ORGANIZATION_ECOSYSTEM.md), and [current verification](docs/ECOSYSTEM_VERIFICATION.md). The earlier report below is retained as historical evidence.


The repository contains runnable backend, web and mobile source with synthetic data, automated tests, security remediation, architecture and operating documentation. It is a substantial development implementation of the requested Health Passport. **The complete production healthcare platform described in the original prompt is not finished or approved for live use.** The unimplemented and externally gated work remains visible below and in [the complete 46-section matrix](docs/MASTER_TRACEABILITY.md).

## Implemented

| Area | Concrete behavior |
|---|---|
| Identity and security | Cryptographically random permanent Health ID; synthetic registration; BCrypt login; encrypted TOTP enrollment/confirmation; one-time hashed recovery codes; session listing/revocation; maintained-library WebAuthn passkeys |
| Sharing | Patient request approval/denial, category/purpose/expiry grants and revocation; server authorization; administrative roles do not inherit clinical access |
| Clinical records | Source-labelled timeline, patient-entered distinction, encounters/notes/conditions/allergies/medications and auditable author amendments |
| Laboratory/pharmacy | Assigned orders/results; structured prescription fields; permitted pharmacy view; quantity/fill bounds, idempotency and concurrent-dispense checks |
| Organization | Own-organization verification/suspension with evidence reference; suspension invalidates grants/sessions; no claim of external professional-license verification |
| Documents | PDF/JPEG/PNG type/signature/size checks, encrypted local blobs, quarantine and authorization on retrieval; missing scanner fails closed |
| Medication Passport | Local Ed25519-signed, expiring synthetic snapshot, public verification key and authenticated consent-checked reference/QR payload |
| Interoperability | Resource-specific R4 historical collection, authors/organizations/provenance, strict parsing and local official-R4 subset validation |
| Learning | Doctor-only fictional case corpus, structured and lexical/concept matching, explanation and explicit non-recommendation; source-linked record excerpts with no AI/source-write claim |
| Mobile | Patient online workflow, registration/recovery/OTP login, sharing/history, biometric API integration and explicitly selected, bounded 24-hour emergency copy |
| Developer delivery | Local launcher/configuration, Maven wrapper, migrations, Docker recipes, dependency scan script, tests, runbooks, ADRs and full requirement traceability |

## Executed verification

| Check | Result and limit |
|---|---|
| Full default backend package | **31 executed tests passed**, 0 failures/errors; 7 optional PostgreSQL cases skipped in that invocation (38 discovered). Java 21 / Spring Boot 3.5.16. |
| Separate real PostgreSQL run | **7 workflow cases passed** on PostgreSQL 17.11; Flyway V1–V10 applied. This supersedes the initial sandbox-blocked attempt. |
| Logical application-data restore | **Passed:** 13 application tables matched canonical rows, 7 identity-sequence states matched, 36 audit-chain events verified. Optional-feature tables were empty; not physical/PITR/blob/key recovery. |
| FHIR | **3 tests passed:** local parser, official-R4 validation and API export. Tested 29-resource historical collection and CapabilityStatement; warnings/information retained. No partner/profile certification. |
| Maven vulnerability scan | **148 project dependencies, zero OSV matches** after remediation. Original graph had 56 package/advisory matches, including Critical/High findings. Scan scope excludes a complete independent build-tool/OS/container audit. |
| Mobile | **8 tests passed**, TypeScript check and iOS/Android JavaScript exports passed; npm audit reported zero. Not native compilation or device security proof. |
| Web quality gates | **Passed:** static build, TypeScript, ESLint (0 errors/warnings), Prettier and npm audit (0 findings). |
| Browser E2E/accessibility | **9 Playwright tests passed**, 0 failed/skipped/flaky, in 30.6 seconds against the final production-format static build and live API. Includes eight patient views, five widths, dark mode, 200% text and automated WCAG checks. |
| Browser coverage details | Registration→consent→doctor/lab/pharmacy→revocation; amendment/XSS text rendering; virtual-authenticator WebAuthn; upload quarantine/signed QR; admin denial; FHIR download, source review and separate learning. Earlier launch blockers were superseded by the successful final run. |
| Native iOS/Android | Toolchain inspected; signed builds, device sessions/biometrics/storage and native accessibility **NOT VERIFIED**. |
| Real malware scanning | Controlled fake-scanner tests passed; actual ClamAV execution **NOT VERIFIED**. |
| Docker/production operations | Recipes provided; container run/scan and production deployment, monitoring/PITR/key recovery **NOT VERIFIED**. |

The default backend suite and separate PostgreSQL invocation are different runs; do not combine their counts into a claim that every feature was tested against PostgreSQL. The latter inherits the seven workflow tests, while identity/passkey/document/FHIR/organization-specific tests primarily use H2.

## Security fixes made

Upgraded Spring Boot, Spring Framework, Tomcat, Jackson, HTTP components, PostgreSQL JDBC and related resolved dependencies to versions without matches in the final OSV scan. Patched build-plugin HTTP component versions separately. Added dummy BCrypt work for unknown-user login and correctly bounded passwords at 72 UTF-8 bytes; a regression verifies oversized multibyte inputs do not cause server errors. Full details and raw evidence are in [SECURITY_SCAN.md](docs/SECURITY_SCAN.md).

## What remains before the full requested product exists

| Remaining work | Why it is still open |
|---|---|
| Clinical breadth | Full procedures/surgeries/immunizations, admission/discharge, referrals/care plans, availability/reminders/calendar integrations, diet/recovery, coverage/claims/costs and comprehensive typed observations are not complete. |
| Clinical/identity governance | Real staff onboarding, trusted organizational provisioning, contact verification, duplicate reconciliation, delegates/minors, clinical risk ownership and external license checks require further systems and decisions. |
| Interoperability | Full minimum-resource coverage, authorized import/vendor adapters, SMART, licensed terminology/drug knowledge, partner conformance and DICOM viewers remain. |
| Emergency and native | Break-glass remains deliberately closed; mobile offline enforcement and passkeys need real-device testing; notifications, QR scanning, secure native document UX and signing/distribution remain. |
| Privacy/research/AI | Real-data de-identification with risk review and separate operations, clinical AI/model evaluation, legal rights/retention/deletion/hold workflows and regional rules remain. Fictional search and deterministic excerpts do not satisfy those full requirements. |
| Operations and security | Managed production identity/keys, scanner operations, distributed limits/sessions/concurrency, independently anchored audit, load/failover, physical/PITR/blob/key restore and independent penetration testing remain. |
| Legal and clinical release | Choose jurisdiction, operating/legal model, contracts, data residency and licensed partners; obtain qualified privacy/legal/security/clinical review. No software test establishes compliance or medical validity. |

## Use and inspect

Start with `python3 scripts/dev.py --install` from the repository root. Display initial synthetic credentials separately with `python3 scripts/configure.py --show-accounts`. The [README](README.md) covers prerequisites, migration behavior, mobile, Docker and test commands. Original requirements remain in [MASTER_REQUIREMENTS.md](docs/MASTER_REQUIREMENTS.md); decisions and current scope are in [PROJECT_SOURCE_OF_TRUTH.md](PROJECT_SOURCE_OF_TRUTH.md).

No production service was deployed. The intended handoff is a runnable, reviewable engineering repository with evidence and an explicit remaining-work register—not a claim of universal healthcare readiness.

## Final web evidence
The seven-test final browser report is `docs/evidence/web-e2e.json`; it records seven expected tests, zero unexpected/skipped/flaky tests and 24,036 ms duration. The final npm report records zero vulnerabilities. Tests ran against `npm start` serving the final static build with its live backend proxy. The responsive checks used 320, 390, 768, 1440 and 1920 pixel widths, plus dark mode and 200% text. Automated accessibility results cover the tested views; they do not establish full manual WCAG certification or native accessibility. Virtual-authenticator WebAuthn establishes browser/protocol behavior in that environment, not every physical device.

## Compact Health ID revision

At the user’s request, canonical IDs now contain nine unambiguous letters/digits. V9–V10 preserve old long IDs as lookup aliases without changing patient UUIDs or clinical references. Updated checks passed: 26 backend tests, seven separate PostgreSQL workflow tests and seven browser journeys. Database uniqueness/collision retries, migration stability, case/separator normalization and readable phone layouts are covered. See `docs/evidence/compact-health-id-verification.json` (from the repository root). Earlier logical-restore evidence remains scoped to V1–V8; the restore harness now also includes the alias table.

## Doctor workspace revision

Implemented a separate doctor sign-in entry and dedicated Today, Patients and Appointments workspace. The doctor can book/reschedule appointments, check in patients, mark no-shows and cancel. Shared chart context sits beside a persistent visit draft; reviewed completion files one encounter without duplicate submissions. Back and browser navigation work, and the logo returns to the role’s home. The selected agenda date survives reloads.

Five clinician integration cases cover permission and role enforcement, appointment ownership, stale changes, overlapping bookings, concurrent booking, saved-draft recovery and duplicate completion. V11 ran on local H2; the earlier PostgreSQL and restore exercises do not yet cover these two new tables. See [the workflow guide](docs/CLINICIAN_WORKSPACE.md) for exact scope. This remains local synthetic software; invitations, calendar synchronization and built-in video are not connected.

Doctor revision final verification: all nine browser journeys passed, including doctor navigation at 1440/768/390/320px, visit-editor accessibility and the booking-to-filed-encounter workflow. TypeScript, ESLint, formatting and the web production build passed. Desktop and phone visit-editor screenshots were visually reviewed after responsive layout settled. Raw evidence: `docs/evidence/clinician-workspace-verification.json`.

## Mobile parity delivery — 2026-09-10

The doctor workflow now exists in mobile source as well as web: separate entry, Today, authorized Patients, Appointments, source chart, rescheduling/status changes, saved visit drafts and reviewed single-encounter completion. Patient and doctor Back/Home navigation are included. The same nine-character server Health ID appears in both clients. Future cross-platform change requirements are recorded in AGENTS.md and `docs/PLATFORM_PARITY.md`.

Final verification: 14 mobile policy/transport tests passed, strict TypeScript passed, and both iOS and Android Metro/Hermes bundle exports passed. Three browser-harness journeys passed in 6.3 seconds, including an actual mobile-screen → web-portal → mobile-screen draft journey and revoked chart access. The native app source was rendered through React Native Web with explicit native-feature test substitutes; this does not establish device behavior. No native simulator devices were installed, and no signed binary/device test is claimed. Evidence: `docs/evidence/mobile-clinician-verification.json`. Older mobile gaps are explicitly retained in the parity matrix.

## Doctor design refinement verification

The visual timestamp agenda, patient cards and compact navigation are implemented on web and mobile. Final checks: 17 mobile/shared policy tests, three targeted web browser journeys and three mobile-harness journeys passed. Both strict type checks, web lint/build, and iOS/Android Hermes exports passed. Populated schedule and patient-card screenshots were visually reviewed. Web testing here is a targeted three-case regression, not a new run of the entire earlier nine-case suite. Native-device verification remains unavailable. See `docs/evidence/doctor-ui-refinement.json`.

## Profile-photo and local project delivery

Optional patient photo selection/capture and skip are available during registration, with later replacement/removal and audience settings in both clients. A compact top-right account menu and Settings shortcut expose the same controls. The API enforces signed-in-only public visibility, selected account viewers, active care-team grants and private clinical holder scopes. Patients see who holds a clinical identification image and its purpose, without image access. Local YuNet face-presence checking rejects no-face/group fixtures; it is not identity/liveness verification. Image blobs are encrypted on disk with metadata stripped and local processing.

The project, source, model, illustrated guide and images are saved on this Mac; Desktop → Health Passport points to the same folder. The saved-build launcher starts the local web/API. Initial README guide creation was authorized; future README edits require confirmation. See [the illustrated guide](README_USER_GUIDE.md) and [photo verification evidence](docs/evidence/profile-photo-verification.json) for exact results. Physical devices, native compilation, Docker execution and production release remain unverified.

## Care coordination delivery — September 11, 2026

Implemented shared web/mobile staff workspaces, structured dated vitals and provenance, original-source carry-forward, configurable clinic freshness, record histories and signed-note amendments. Clinic assignments and patient consent are enforced independently by the API. Tasks, scoped conversations, acknowledgments, read state, record-reference attachments and generic in-app escalations connect reception, triage, consultations, laboratory/imaging results, review and follow-up/discharge. Existing prescription/dispensing and document records remain linked to the same patient.

Final verification: 45 H2 backend tests and 10 separate PostgreSQL care-workflow tests passed; all 11 web journeys, five browser-rendered native journeys and 18 mobile policy/transport tests passed. Web lint, formatting, both type checks, the web production build and iOS/Android Hermes exports passed. The older seven PostgreSQL tests were skipped, not claimed as newly verified.

Open the app locally and sign in with the role accounts listed in LOCAL_ACCESS.txt. Doctors choose Care team (Care team workspace on mobile); nurse, reception, lab, diagnostic, coordinator and admin accounts open their corresponding workspace. See [the illustrated care-team guide](docs/CARE_TEAM_WORKFLOWS.md) and [verification evidence](docs/evidence/care-coordination-verification.json). External clinical integrations, OS notification delivery and physical-device release testing remain outstanding. No production or real-patient readiness is claimed.
