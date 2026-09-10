# Deployment

## Supported boundary
This bundle is a synthetic development build. A hosted frontend preview does not host or validate the Java backend, database or native applications. Frontend synthetic mode must visibly disclose its data source; a live server connection must use an explicitly configured protected API. Keep local backend bound to loopback by default.

See the root README for executable startup commands; application package scripts and backend configuration are authoritative. Backend properties expose `BIND_ADDRESS`, `PORT`, `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` and `COOKIE_SECURE`. The default H2 database is disposable synthetic development storage. Production must use managed PostgreSQL, approved secrets and HTTPS with secure cookies. Never deploy development account seeding or synthetic identity shortcuts as an authentication system for patient data.

## Production infrastructure gate
Select approved region/account and data-processing contracts; provision private database and object storage, managed identity/KMS, TLS/WAF, least-privilege network/service roles, protected audit sink, secret rotation, monitoring, on-call and backups. Supply infrastructure-as-code review and automated policy checks. Separate migration permissions from runtime. CI must build/test and scan immutable artifacts; deployment must support rollback to a known compatible image/schema.

Before exposure, run identity integration, authorization matrix, PostgreSQL migration/concurrency, upload quarantine, external dependency/security, backup restore, load/failure and accessibility checks. Verify no default credentials, no public object buckets, no debug endpoints and no PHI in observability. Clinical/legal approval and partner conformance remain external gates. This document alone does not implement this infrastructure.
