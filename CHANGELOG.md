# Changelog

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
