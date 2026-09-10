# Operations and incident runbooks

## Readiness
There is no established production on-call team or cloud operating environment in this bundle. Assign service, privacy, security and clinical owners before any live pilot. Define support hours, escalation contacts, change approvals and incident severity. Never place real contact secrets or credentials in this repository.

## Monitor
Track availability, latency/error percentiles, database saturation, denied-access spikes, unusual exports, repeated login failures, queue age, audit gaps, object scan failures and backup age. Logs use correlation identifiers and minimized metadata, not clinical narratives or tokens. Alerts require delivery tests, owner and response expectation.

## Incident response
1. Declare incident, assign commander and preserve timestamped evidence.
2. Contain affected sessions/service identities and isolate compromised paths without deleting evidence.
3. Assess affected people, data classes, jurisdictions and timeline with privacy/legal owners.
4. Restore from trusted artifacts/data and rotate affected secrets; validate authorization and integrity.
5. Let qualified owners determine applicable notifications and timing; do not assume a universal deadline.
6. Record root cause, affected versions, remediation and prevention tests.

## Backup and restoration
Target RPO ≤15 minutes and RTO ≤4 hours are provisional, unmeasured. Use encrypted backups and point-in-time recovery in a separate protected failure domain. Restore into an isolated environment, verify schema/version, record counts, consent integrity, provenance, audit continuity and object references, then execute synthetic workflow. Capture actual recovery point and duration. Do not reconnect notifications or external dispensing while testing. Retention and legal hold must cover backups according to approved policy.

## Change/rollback
Review migrations before deployment; preserve recoverable state. Deploy immutable versioned images, run health and synthetic checks, observe error/authorization metrics and roll back on defined thresholds. Schema changes must be backward compatible or have an explicit recovery plan. Do not roll back by discarding legitimate clinical writes.

## Executed bounded restoration evidence
A PostgreSQL 17.11 logical application-table restore was executed between isolated synthetic databases: canonical rows in 13 tables, 7 sequence states and 36 audit-chain events matched. This is useful application-data evidence; the provisional production RPO/RTO, physical/PITR recovery, document blobs and signing/MFA key recovery were not tested by this exercise. See backend POSTGRES_VERIFICATION.md.

## Local configuration compatibility

A newly generated `DATABASE_PASSWORD` applies to a newly initialized database; editing `.env` alone does not rotate an existing H2 password. This workspace's earlier empty-password database has now been explicitly migrated to its generated configuration while the application was stopped. All 14 table fingerprints and counts were preserved, and the old empty password is rejected. The normal `python3 scripts/dev.py --install` launcher now works without a compatibility override. Future rotations still require a verified backup and deliberate database change. The development guide records launcher ports, environment precedence, installation scope, and logs.
