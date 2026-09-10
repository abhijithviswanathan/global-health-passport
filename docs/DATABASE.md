# Database

## Current foundation
The executable schema is `apps/backend/src/main/resources/db/migration/V1__foundation.sql`; migrations run through Flyway at backend startup. PostgreSQL is the intended deployment database. H2 in PostgreSQL compatibility mode is for local synthetic development and tests and does not prove PostgreSQL compatibility.

The foundation tables are `app_user` (identity, synthetic credentials, role and organization), `consent` (patient, grantee, purpose, scopes, expiry, status), `clinical_record` (patient, type, narrative, author, source, status and relationship/version references), `access_request` (requester/patient/purpose/status) and `audit_event` (ordered hash-linked events). Public Health IDs have uniqueness enforcement and are distinct from internal UUID keys. Patient/author references enforce association where defined.

## Limitations and migration plan
The compact schema is a development foundation: identity and security share a table, clinical detail is largely narrative, time fields use ISO strings, organizational policy is simplified and the audit table shares the application database. Before live use, normalize organization/membership and clinically typed domains, use timezone-aware timestamps with date precision metadata, constrain statuses and validated codes, model structured prescriptions/supply, record full provenance/version history and apply per-domain least-privilege roles. Add identity resolution and legal-hold/lifecycle tables with controlled workflows.

Never edit an applied migration in a deployed environment. Add forward migrations and test from both empty and previous schema snapshots. Do not infer compatibility from H2 alone: execute PostgreSQL migrations, constraints, concurrency and rollback/restoration tests. Back up before a risky migration; rollback usually means restore or forward repair, not dropping clinical data.

## Operational rules
Use private database networking, distinct application/migration/backup identities, encrypted storage/backups and managed secrets. No real PHI belongs in seed data. Ensure indexes support patient/time reads and active grant checks, but avoid indexing sensitive narrative indiscriminately. Query plans, retention partitioning and replica behavior require measured workloads. Restore procedures and RPO/RTO verification are in OPERATIONS.

## Added migrations
V2 adds structured order recipient, dosage/route/frequency/duration, quantity/refill and idempotency fields. V3 adds encrypted TOTP enrollment state and last consumed timestep, hashed one-time recovery codes and session revocation metadata. Numerical internal primary keys are separate from UUID public resource IDs. Identity encryption keys are never stored in these tables.

V4 adds encrypted-document metadata and scan state, V5 passkey credentials/one-time session-bound challenges, and V6 signed medication-passport references. Refer to actual migrations for exact columns. Local encrypted blob/signing files are outside the transactional database and require coordinated backup/restore.

V8 adds practitioner verification status, evidence reference and verifying actor. Suspension atomically revokes active consents/sessions and pending passkey challenges. Organization membership remains simplified on the user record.

Real-engine evidence: PostgreSQL 17.11 applied migrations V1–V8 and six HTTP workflow tests passed. Logical restoration matched 13 application tables, 7 sequence states and 36 audit events. This verifies the bounded fixture, not every domain/feature or production database operation; see backend POSTGRES_VERIFICATION.md.
