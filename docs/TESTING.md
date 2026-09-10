# Test strategy and evidence

## Evidence rule
Only executed commands with retained results establish a pass. This document defines the required suite. The root source-of-truth and final verification report record actual run results. Final backend Maven package: 29 tests, 0 failures, 0 errors, 6 skipped optional PostgreSQL cases; 23 executed tests passed on Java 21/Spring Boot 3.5.16. Exact suite summaries are in evidence/backend-test-summary.json and evidence/org.healthpassport.*.txt. H2, generated passkey test material and fake-scanner limits remain explicit.

## Required layers
1. Backend unit/integration: identity randomness, grant state/expiry, policy decisions, record ownership, wrong-patient association, version preservation, quantity/concurrency and audit integrity.
2. Database: fresh Flyway migration and upgrade against PostgreSQL, unique/referential constraints, transactions and restoration. H2 tests do not substitute for this layer.
3. API cross-role workflow: register → ID → clinician request → patient approve → encounter → prescription → lab order/result → patient read → pharmacy verification/dispense → patient audit. Include denial, revoke and unrelated-role cases.
4. Browser E2E: perform the actual workflow against the API, not only synthetic browser fixtures. Verify loading/error/empty/denied states and both themes.
5. Mobile: type/build checks plus iOS/Android device tests for secure login, protected storage, biometrics, notifications, QR, offline expiry and revocation.
6. Security: BOLA, privilege escalation, forged/expired sessions, CSRF/XSS/injection, upload abuse, replay, rate limits, secret/dependency/container scanning and independent penetration review.
7. Accessibility: automated checks plus keyboard, screen reader, zoom, reflow, contrast and reduced motion.
8. Operational: load against the provisional PRD workload, timeout/backpressure behavior, restart/failure, backup restore, RPO/RTO and alert delivery.

## Test-data rules
Every fixture is visibly synthetic. Include two patients, multiple clinicians/organizations, unrelated lab/pharmacy/admin, revoked and expired grants, missing/unknown values, conflicting records, repeated imports and invalid quantities. No production dump or scraped EHR database.

## Report format
For each command record date, build revision, runtime, command, exit status, test count and artifact path. Mark skipped/unsupported checks NOT VERIFIED and state why. Do not revise a test expectation solely to make it pass; reassess the requirement and fix the implementation. A development release can be delivered with honest gaps; the full clinical release gate remains closed until they are resolved.

## Separate real PostgreSQL verification
PostgreSQL 17.11 subsequently passed all six inherited workflow cases (no skipped cases in that explicit invocation) and V1–V8 migration. A logical snapshot restored to a separately migrated database matched all canonical rows across 13 application tables, seven identity-sequence states and 36 audit-chain events. See ../apps/backend/POSTGRES_VERIFICATION.md and evidence/postgres-verification.json. These results supersede the earlier host IPC blocker; default suite skip counts remain accurate for their original invocation. Production PITR/physical backup, key/blob recovery and populated optional-feature restoration are not verified.

## Final browser/static verification
All seven Playwright E2E tests passed against the final static production-format web build served by npm start and the live Java API: 0 failed, 0 skipped, 0 flaky, 24.6 seconds. Exact report: evidence/web-e2e.json. Coverage includes registration/consent/clinical/lab/pharmacy/revoke, source amendments and hostile text, virtual-authenticator WebAuthn, upload quarantine and signed QR, administrative denial, FHIR/source/learning and automated WCAG checks over eight patient views at five widths with dark/200%-text checks. Static build, TypeScript, lint (zero errors/warnings), Prettier and npm audit (zero findings) also passed. Earlier browser sandbox launch failures were superseded by this verified run. Manual screen-reader/native/device/clinical usability testing remains separate.
