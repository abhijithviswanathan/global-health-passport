# PostgreSQL verification and recovery harness

## Actual result on this host

**VERIFIED for the bounded synthetic workflow and application-data restore described below.** An isolated PostgreSQL **17.11** ARM64 server ran on loopback. A fresh UTF-8 `passport_test` database was created. Flyway applied **V1–V8**, and the **six inherited `PostgresWorkflowTest` cases all passed** with zero failures, errors, or skips. These are real PostgreSQL tests, separate from H2 compatibility-mode results.

A logical snapshot of all 13 application tables was then inserted through parameterized JDBC statements into a separate, freshly Flyway-migrated UTF-8 database. All canonical ordered rows matched exactly. The snapshot contained **6 users, 3 grants, 13 clinical records, 2 access requests, 36 audit events, 11 session rows, and 3 practitioner-verification rows**; other optional-feature tables were empty. All **7 identity sequence states** matched, and the **36-event audit chain** passed hash/link verification after restoration. The aggregate application-data SHA-256 was `02ed66cc1cb19d80923a385c8f246c2290508c58a32a12edd0b42052ff1b6b52`.

Machine-readable results are in `postgres-verification-evidence.json`. The reusable `scripts/verify-logical-postgres-restore.sh` harness was also run against another fresh target database successfully. It requires distinct source/target disposable JDBC URLs, an existing empty target database, JDK 21, and a built application JAR. Set `SOURCE_DATABASE_URL`, `TARGET_DATABASE_URL`, `TEST_DATABASE_USER`, and `TEST_DATABASE_PASSWORD`; reports and the private synthetic snapshot are written under `target/postgres-verification`.

**Limits:** This was a logical application-data restore, not `pg_dump`, physical backup, point-in-time recovery, document-blob restoration, signing/MFA key recovery, or a production disaster-recovery exercise. Populated restore coverage for empty optional-feature tables remains unverified. Multi-instance concurrency and production recovery objectives remain release gates.

The initial child-agent attempts failed because the desktop sandbox blocked PostgreSQL's required shared-memory IPC. A later parent-agent execution was approved and started the isolated server; the successful tests above supersede that initial blocker. No sandbox denial was bypassed by the child agent.

## Reproduce against a real engine

Use a fresh, disposable PostgreSQL 17 database and JDK 21. Set `TEST_DATABASE_URL` to its JDBC URL, `TEST_DATABASE_USER`, and `TEST_DATABASE_PASSWORD`; execute `scripts/test-postgres.sh` from this backend. The script runs `PostgresWorkflowTest`, which inherits every existing `WorkflowTest` assertion, including full doctor/lab/pharmacy workflow, role authorization, consent expiry validation, revocation, concurrent dispensing, idempotency, amendments, audit hashes, staff authentication guard, and request denial. Flyway applies all current migrations to the empty database. These opt-in tests are skipped when `TEST_DATABASE_URL` is absent.

Run these tests only against a disposable database: synthetic users/records are inserted. Never point the test URL to any clinical or production data. The inherited fixture uses test-only credentials that are unrelated to application deployment passwords.

## CI service example

The repository owner can integrate this job into the root workflow. The service password below is deliberately scoped to the ephemeral test container.

```yaml
postgres:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:17
      env:
        POSTGRES_DB: passport_test
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: ephemeral-ci-database-only
      ports: ['5432:5432']
      options: >-
        --health-cmd "pg_isready -U postgres"
        --health-interval 5s --health-timeout 5s --health-retries 12
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with:
        distribution: temurin
        java-version: '21'
    - name: Real PostgreSQL workflow
      working-directory: apps/backend
      env:
        TEST_DATABASE_URL: jdbc:postgresql://localhost:5432/passport_test
        TEST_DATABASE_USER: postgres
        TEST_DATABASE_PASSWORD: ephemeral-ci-database-only
      run: scripts/test-postgres.sh
    - name: Dump and restore disposable database
      env:
        PG_CONTAINER: ${{ job.services.postgres.id }}
      run: |
        mkdir -p work
        docker exec "$PG_CONTAINER" pg_dump -U postgres -d passport_test -Fc > work/passport-test.dump
        docker exec "$PG_CONTAINER" createdb -U postgres passport_restored
        docker exec -i "$PG_CONTAINER" pg_restore -U postgres -d passport_restored --exit-on-error < work/passport-test.dump
        docker exec "$PG_CONTAINER" psql -U postgres -d passport_test -Atc "select 'users',count(*) from app_user union all select 'records',count(*) from clinical_record union all select 'audit',count(*) from audit_event order by 1" > work/before.txt
        docker exec "$PG_CONTAINER" psql -U postgres -d passport_restored -Atc "select 'users',count(*) from app_user union all select 'records',count(*) from clinical_record union all select 'audit',count(*) from audit_event order by 1" > work/after.txt
        diff -u work/before.txt work/after.txt
```

The dump/restore job checks successful restoration and basic counts, not full disaster-recovery correctness. A release still needs encrypted backup management, integrity checks, recovery time/point objectives, key recovery, isolated restore drills, and actual recorded CI evidence. Multiple API instances are not supported yet; single-instance request serialization does not replace database-level locking across all prescribing/dispensing operations.
