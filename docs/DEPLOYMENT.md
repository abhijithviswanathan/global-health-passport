# Deployment

## Supported boundary
This bundle is a synthetic development build. A hosted frontend preview does not host or validate the Java backend, database or native applications. Frontend synthetic mode must visibly disclose its data source; a live server connection must use an explicitly configured protected API. Keep local backend bound to loopback by default.

See the root README for executable startup commands; application package scripts and backend configuration are authoritative. Backend properties expose `BIND_ADDRESS`, `PORT`, `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` and `COOKIE_SECURE`. The default H2 database is disposable synthetic development storage. Production must use managed PostgreSQL, approved secrets and HTTPS with secure cookies. Never deploy development account seeding or synthetic identity shortcuts as an authentication system for patient data.

## Production infrastructure gate
Select approved region/account and data-processing contracts; provision private database and object storage, managed identity/KMS, TLS/WAF, least-privilege network/service roles, protected audit sink, secret rotation, monitoring, on-call and backups. Supply infrastructure-as-code review and automated policy checks. Separate migration permissions from runtime. CI must build/test and scan immutable artifacts; deployment must support rollback to a known compatible image/schema.

Before exposure, run identity integration, authorization matrix, PostgreSQL migration/concurrency, upload quarantine, external dependency/security, backup restore, load/failure and accessibility checks. Verify no default credentials, no public object buckets, no debug endpoints and no PHI in observability. Clinical/legal approval and partner conformance remain external gates. This document alone does not implement this infrastructure.

## Care coordination storage (V13–V14)

Additive migrations extend `app_user` with clinic/department and membership state; `clinical_record` with observation/source/author snapshots, version, signature, encounter, carry-forward and structured measurement fields; and appointments with a workflow stage. New tables cover assignments, record revisions/confirmations, freshness templates and clinic overrides, tasks, conversations/members/messages, coordination events, service progress and result reviews. Uploaded-document metadata links to a clinical timeline record.

Do not edit applied migration files. Preserve all new tables when backing up and restoring. Existing records receive a bounded provenance snapshot without inventing their earlier edit history. Keep production migration permissions separate from runtime access; no API permits ordinary users to delete revision history. External notification/integration providers are not configured by these migrations. See [care-team workflows](CARE_TEAM_WORKFLOWS.md).


## Running the expanded saved application

The existing local database migrated from V14 to V18 after a stopped-database backup. Build the backend/web, stop the previous launcher, then run `python3 scripts/start_saved.py --no-open` from the project root. This applies additive Flyway migrations and serves web5173/API8080 on loopback. Do not run two launchers against one H2 database. The desktop command wraps the same saved-build flow.

Run `python3 scripts/setup_ecosystem_demo.py` for the synthetic hospital walkthrough; credentials remain in the protected local files. The deployment `.env.example` adds optional server-only eligibility gateway URL/token; demo mode cannot use that gateway. No external insurer, PACS or EHR is configured. Production MFA provisioning, real institutional/license verification, TLS, managed PostgreSQL/keys/storage, audit retention, notification delivery and clinical/legal release review must be resolved before real use. This turn did not deploy or publish the app.

Never roll back the schema by starting an older binary against a migrated database. Stop services, restore the complete consistent database/files/keys backup to a separate protected location, and test the matching older binary there. The V14-to-V18 upgrade executed locally and on disposable H2/PostgreSQL databases; a current-revision disaster-recovery restore was NOT TESTED.
