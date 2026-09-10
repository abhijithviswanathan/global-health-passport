# Global Health Passport — project source of truth

## Authority and delivery status
The user supplied the 46-section master specification and approved continuing all phases autonomously on 2026-09-10. This overrides repeated phase approval prompts, not requirements for evidence, security or external clinical/legal validation. The original is preserved in `docs/MASTER_REQUIREMENTS.md` and fully mapped in `docs/MASTER_TRACEABILITY.md`.

Current status: **synthetic development delivery, with substantial implemented functionality and an open full-product backlog**. Backend, database, mobile and final web/browser evidence are recorded below. No live-patient release or production deployment is claimed. Documentation/phase reports distinguish design targets, implemented controls and executed checks.

## Vision, approved scope and constraints
Provide a lifetime, provenance-preserving record across participating organizations using a permanent random Health ID and enforceable patient sharing. The complete original specification remains the requirements baseline. Current executable workflows focus on adult self-managed outpatient synthetic data. Future scope is not erased by that boundary.

Never use real patient data for development, treat Health ID/QR as unrestricted authorization, silently merge identities, overwrite original records with generated content, scrape proprietary EHR databases or equate pseudonymization with anonymity. Patient sharing controls do not override provider legal retention.

## Architecture and technology decisions
- Java 21 / Spring Boot 3.5.16; a single-process modular backend. Explicit packages/classes organize concerns but do not create operational security isolation.
- PostgreSQL deployment target; persistent H2 default for simple local development. Real PostgreSQL 17.11 separately passed all eight migrations and six workflow cases.
- React/TypeScript web from the Sites vinext starter. Vinext is beta; production runtime suitability remains a release review item. Java remains the authorization authority.
- React Native/Expo patient client. JavaScript builds and policy tests do not establish OS/device security.
- Flyway V1–V8: foundational users/records/grants/audit; structured assigned orders; identity/recovery/session registry; encrypted documents; WebAuthn; signed medication references; captured clinical status; practitioner verification.
- Local encrypted document/signing files supplement transactional storage. Independent audit retention, KMS, notification/scanning workers and regional deployments remain production work.
- Avoid unneeded Redis/search clusters/vector stores/Kubernetes; add based on measured need. The learning corpus is immutable synthetic data and does not ingest clinical tables.

ADRs record these decisions and consequences. Material changes require updating this source of truth and the affected contract/evidence.

## Security and identity decisions
Public Health IDs use at least 128 cryptographically random bits, distinct from public resource UUIDs and hidden numeric database primary keys. Identifiers reveal no grant. Registration is synthetic-only; duplicate reconciliation/contact verification remain unimplemented.

Authentication uses BCrypt with explicit 72-byte UTF-8 bounds, server sessions, CSRF on POSTs, session-ID rotation and database revocation checks. Unknown-user password login performs dummy BCrypt work. Absolute session lifetime is 15 minutes; servlet sessions remain process-local. TOTP uses java-otp with encrypted secrets, confirmation and replay prevention. Eight random one-time recovery codes are hashed; recovery invalidates factors, challenges and sessions. WebAuthn uses maintained Yubico verification with exact RP/origin, mandatory user verification and expiring one-use session-bound challenges. Non-demo staff password login requires MFA by default; production profiles reject demo/disabled staff-MFA configuration.

Clinical staff require verification state on login and protected access. Organization admins can update only their own clinical members' evidence/status; suspension revokes grants/sessions. This does not verify a professional license externally. Full tenant provisioning, federated OIDC, distributed throttling, notifications, device validation and key lifecycle remain open.

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
- Default full backend package: 29 discovered cases, **23 executed passed**, 6 optional PostgreSQL skipped, 0 failures/errors.
- Separate real PostgreSQL 17.11: **six workflow cases passed**, V1–V8 migrated. This supersedes earlier host IPC failures.
- Logical application-data restore: **13 tables**, seven identity-sequence states and **36 audit-chain events** matched. Optional-feature tables were empty; not PITR/physical/blob/key recovery.
- FHIR: three local tests passed, including official-R4 subset validation and strict parsing; no partner certification.
- Maven/OSV: final **148 project artifacts, zero matches** after fixing original findings. Build-plugin HTTP dependencies also patched. Not a complete OS/container/plugin or application-security audit.
- Mobile: **eight tests**, TypeScript check and iOS/Android JavaScript exports passed; npm audit zero. Native device enforcement/signing remains unverified.
- Web: static build, TypeScript, lint (0 errors/warnings), Prettier and npm audit (0 findings) passed. Final Playwright: **7 passed**, 0 failed/skipped/flaky, 24.6 seconds against static production-format build and live backend. Includes full cross-role workflow, source amendments/XSS text, virtual-authenticator WebAuthn, quarantine/signed QR, FHIR/source/learning, admin denial and eight-view automated WCAG/responsive/dark/200%-text checks. Initial browser launch blockers were superseded by this successful run.

Evidence: `docs/evidence`, `apps/backend/POSTGRES_VERIFICATION.md`, `apps/backend/postgres-verification-evidence.json`, mobile README and final delivery report. No private database snapshot or secret key is part of report evidence.

## Remaining functionality and external decisions
Complete clinical breadth (procedures, immunizations, admissions, referrals/care plans, diet/recovery, appointments/reminders, coverage/costs); verified contacts and duplicate identity reconciliation; delegates/minors; full FHIR/authorized integrations/terminology; DICOM; licensed drug knowledge; emergency governance; real-data de-identification and clinical AI; legal lifecycle/rights/retention/holds; native verification and distribution; production operations, independent security evaluation and key/blob/PITR restoration.

Choose launch country/state and responsible entities; provider-sponsored versus consumer operating contracts; real EHR/lab/pharmacy partners and licenses; hosting/residency, budget and approved SLOs; clinical, privacy/legal, security and operations owners. These decisions block a live release, not synthetic development.
