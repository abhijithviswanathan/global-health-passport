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

## Compact Health ID revision

V9 adds `health_id_alias`; V10 migrates existing long IDs to unique nine-character IDs while preserving legacy lookup. Historical PostgreSQL restore evidence covers V1–V8; include `health_id_alias` in all future logical snapshots and restores.

## V11 — clinician scheduling and documentation

`appointment` stores the owning doctor, patient reference, UTC start in milliseconds, duration, visit reason/type, state, optimistic version and completion record reference. `(doctor_id, request_key)` is unique. `visit_draft` stores the doctor's four note sections and an independent optimistic version. The owning doctor row is locked while booking, rescheduling or completing a visit. Include both tables in subsequent logical snapshots/restores; previous restore reports predate this addition.

## V12 profile photos
`profile_policy` stores the owner's audience; `profile_viewer` stores an explicit selected-account allowlist. `photo_asset` stores the owner, uploader, profile/clinical kind, unique holder key, doctor/organization scope, organization, stated purpose and timestamp. Image bytes are AES-GCM blobs in `PHOTO_STORAGE_PATH`, not inline database values. Back up database metadata and matching encrypted files/keys together. One current profile photo per owner and one current clinical photo per holder are retained.

## Care coordination storage (V13–V14)

Additive migrations extend `app_user` with clinic/department and membership state; `clinical_record` with observation/source/author snapshots, version, signature, encounter, carry-forward and structured measurement fields; and appointments with a workflow stage. New tables cover assignments, record revisions/confirmations, freshness templates and clinic overrides, tasks, conversations/members/messages, coordination events, service progress and result reviews. Uploaded-document metadata links to a clinical timeline record.

Do not edit applied migration files. Preserve all new tables when backing up and restoring. Existing records receive a bounded provenance snapshot without inventing their earlier edit history. Keep production migration permissions separate from runtime access; no API permits ordinary users to delete revision history. External notification/integration providers are not configured by these migrations. See [care-team workflows](CARE_TEAM_WORKFLOWS.md).


## Organization migrations V15–V18

- V15: healthcare_organization, organization_node, employment, platform_operator, staff_invitation, workforce_shift, workforce_policy, shift_handoff, organization_event, clinical_order and task_dependency; stable organization references on users/records/documents/appointments/tasks; task completion and verification fields.
- V16: insurance_profile with encrypted identifiers, insurance_share, eligibility_check, insurance_plan and notification_read. Marketplace plans have a separate review lifecycle and no patient foreign key.
- V17: nursing_entry, clinical_attestation and care_message priority.
- V18: document_purpose boundary, insurance-card backfill and purpose index. Classified insurance cards are excluded from ordinary document/timeline attachment authorization.

Flyway applied the four additive migrations to the existing local V14 database after a consistent stopped-database backup. Tenant adoption only marks the original named demo network synthetic-verified; pre-existing non-demo groups remain pending. Employment backfill does not invent old license evidence. Existing aliases, records, media and signatures are preserved. Old clinical authors without tenant metadata are resolved conservatively through their author identity.

IDs, FK/unique constraints and tenant/time indexes are declared in the SQL files. Sensitive insurance values and license values use the existing identity encryption key; file content uses the separate document encryption key. Do not edit applied migrations or manually remove tenant/membership rows to bypass access checks. Independent, immutable audit storage and managed key lifecycle remain deployment work.
