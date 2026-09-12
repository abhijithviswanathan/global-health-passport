# Changelog

## 2026-09-11 — Fictional presentation showcase

- Added four connected NorthStar patient stories (three new accounts and richer existing Alice content), 26 authored clinical entries, five order records and two completed result reports: 33 new clinical entries total.
- Added four appointments, one saved SOAP draft, four curated nurse tasks plus five linked order tasks, three conversations/six messages, two structured handoffs, two insurance profiles with billing shares and three approved fictional comparison plans.
- Preserved pending versus completed workflow states, patient-reported uncertainty, observation/upload dates, role assignments, consent and existing earlier fixtures. All content is explicitly fictional; no actual DICOM pixels, medicines, insurer calls or external notifications were introduced.
- Added repeatable API setup, read-only fixture verification, four focused web/native browser checks, screenshots and an illustrated PDF plus full Markdown demonstration report. Existing README files were preserved.
- PASS: fixture assertions, no duplicate Showcase clinical records after repeated setup, two unauthorized access denials, matching patient/staff record IDs, four browser checks and lint of the new browser-test files. Native verification is the React Native browser harness, not physical-device testing. See DEMO_SHOWCASE_REPORT.md and docs/evidence/showcase-verification.json.

## 2026-09-11 — Organization ecosystem expansion

- Continued the existing modular backend and both clients; added stable organization tenancy, verified onboarding, hierarchy, separate staff Work IDs/invitations, professional credentials/privileges and automatic offboarding.
- Added role-adaptive hospital workspaces, workforce intervals and public booking, structured clinical orders, specimen identity safeguards, nursing administration/observations, handoffs, task dependencies and independent completion verification.
- Added encrypted patient insurance profiles/cards, purpose-specific sharing/eligibility, secure provider/gateway boundary and independently reviewed insurer plans. Marketplace remains separated from clinical PHI; sponsorship disabled.
- Extended generic tenant events/SSE/cursor updates, audit and FHIR collection projections; applied V15–V18 after a local backup. Existing records/accounts/care workflows preserved.
- Added synthetic NorthStar API setup, shared web/native forms, responsive screenshots, ADRs 0012–0014 and all affected guides.
- PASS: 62 H2 backend cases, 14 PostgreSQL cases, 14 web browser cases, 7 native harness cases, 2 photo regressions, 18 native policy/unit tests, type checks/lint/web build and both native exports. See HOSPITAL_EXPANSION_REPORT.md for exact scope and remaining BLOCKED/NOT TESTED integrations/device checks.


## 0.1.0 — synthetic development delivery — 2026-09-10

- Established PRD/SRS, architecture/threat model, UX, compliance matrix, ADRs and full original-scope traceability.
- Added Java/Spring Boot API, Flyway migrations, React web and Expo patient application.
- Implemented random Health IDs, synthetic registration, TOTP/recovery, session controls and maintained-library passkeys.
- Added source-labelled records/amendments, consent request/approval/denial/revocation, assigned lab/pharmacy workflows and audit history.
- Added bounded encrypted documents/quarantine, signed medication snapshots, R4 projection, synthetic case search/excerpts and organization verification/suspension.
- Added selected expiring offline mobile emergency storage with policy tests; native enforcement remains unverified.
- Executed backend/H2, real PostgreSQL workflow, bounded logical restore, FHIR, mobile, seven-test live-browser E2E/accessibility and dependency checks; retained exact evidence and limitations.
- Remediated dependency advisories and password timing/UTF-8 boundary defects.
- Added local startup/configuration, Docker recipes and verification/runbook documentation. Production deployment and complete master-product scope remain open.

## Compact Health ID revision

Health IDs now contain nine memorable letters/digits. Existing records retain stable UUIDs and historical long IDs remain valid for lookup. Case and separators are normalized; random ID collisions retry safely.

## Doctor workspace revision

- Separate Doctor / care team sign-in entry and role-aware home screen.
- Searchable authorized patient directory; day scheduling, rescheduling, check-in, no-show and cancellation.
- Shared context beside server-saved visit drafts; reviewed completion files one encounter atomically.
- Home-logo navigation, a Back action, browser history and remembered schedule date.
- V11 appointment/draft storage; consent checks, ownership checks, stale-write protection and overlapping-slot prevention.

## Mobile doctor parity

Added patient/doctor entry, doctor Today/Patients/Appointments/Settings, authorized charts, shared scheduling and server-backed visit drafts. Added patient and doctor Back/Home navigation with unsaved-draft confirmation. Shared API responses now normalize both individual and list results, keep per-request CSRF state and display actionable conflict errors. Added mobile policy/transport tests and a reproducible browser harness exercising both clients. Cross-platform expectations are recorded in AGENTS.md and the parity matrix.

## Doctor experience refinement

Replaced oversized mobile Back/refresh controls with compact controls, organized navigation and date selection, added a visual timestamp agenda on both clients, enriched patient cards with actual upcoming-booking context and grouped secondary appointment actions. Shared agenda calculations and native bundler configuration preserve web/mobile consistency, including overnight visits.

## Profile photos, privacy and local guide

- Optional photo/camera step after patient registration, skip, and later change/removal on web and mobile.
- Owner-only, care-team, selected-account and signed-in-public profile visibility, enforced at every image endpoint.
- Separate doctor/organization identification images with current consent, holder-specific access and patient-visible holder/purpose metadata.
- Local OpenCV YuNet face-presence checking, bounded metadata-stripped JPEG normalization and encrypted local photo files.
- Compact account menus, Settings photo shortcut and preserved clinician unsaved-draft navigation guards.
- Desktop project shortcut, saved-build launcher, illustrated local use/setup/backup/deployment guide and explicit future README approval rule.

## Shared care-team workflows — 2026-09-11

- Additive V13–V14 migrations preserve provenance, record revisions, assignments, task/message state, service status and clinic freshness rules.
- Shared role workspaces and native/web controls for vitals, histories, notes, scheduling, tasks, conversations, service queues and access management.
- Separate observation and entry dates; historical/carry-forward labels; reviewed confirmations and signed-note amendments with conflict protection.
- Assignment plus consent checks, membership restrictions, scoped attachments and generic in-app escalation notices.
- Illustrated care-team guide and final cross-platform verification evidence.
