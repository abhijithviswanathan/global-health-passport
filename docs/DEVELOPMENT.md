# Development workflow

Use only synthetic fixtures. Read PROJECT_SOURCE_OF_TRUTH before changing architecture and record material decisions in ADRs. The root README provides the exact commands for the current bundle; use backend Maven and each app's checked-in package scripts, lockfiles and environment examples. Do not install unpinned replacements simply to bypass failures.

Java 21 is the backend language target. Flyway applies checked-in migrations at startup. Backend development configuration defaults to a loopback server and local H2 storage. React/TypeScript web and Expo/TypeScript mobile are separate clients; their API mode and synthetic mode must be explicit. Never assume a screen's sample data came from the Java API.

For each change: state requirement, implement smallest coherent behavior, compile, execute relevant tests, inspect UI where applicable, review authorization/error paths, fix failures, retest and update evidence. Security-sensitive changes need negative cases. Avoid claiming platform behavior from TypeScript compilation or a mock test.

Keep secrets and personal data out of commits, fixtures, screenshots and logs. Commit logical increments. Generated outputs/build caches and local databases are not source. Changes to API contracts require both client updates and integration coverage. Maintain ISO UTC timestamps and provenance and do not introduce silent data coercions.

## Existing local H2 database passwords

`configure.py` creates a private `.env` only when it does not already exist. New configurations contain a randomly generated `DATABASE_PASSWORD`. That value initializes a new H2 database; editing the setting alone does not rotate the password on an existing file.

The existing synthetic database in this workspace has now been explicitly migrated from its original empty password to the generated `.env` password using an authenticated, parameterized database command while the application was stopped. All 14 database-table fingerprints and row counts matched before and after; the generated password authenticates and the former empty password is rejected. A private pre-migration backup was retained outside the deliverable. No application account or clinical data was reset.

Use the normal launcher without a password override:

```sh
python3 scripts/dev.py --install
```

Fresh installations should also use their generated configuration normally. Future password changes require an intentional database migration and verified backup; do not silently replace credentials or delete the existing database. Changing `DEMO_PASSWORD` likewise does not reset already seeded accounts.

## Local launcher behavior

The launcher requires Java 21 and Node.js 24 with npm on `PATH`. Its `--install` option installs the web dependencies; mobile dependencies must be installed separately in `apps/mobile`. Without `--no-build`, it verifies and packages the backend. It starts the web development server rather than a hosted deployment, and uses a private copy of the backend JAR so another build cannot replace the running archive.

Keep ports 8080 and 5173 free before launching. Use `http://localhost:5173` for passkeys; the IP-address URL does not match the configured relying-party identity. The launcher writes local logs to `.runtime/backend.log` and `.runtime/web.log`, prints readiness after both services respond, and stops the directly launched processes on interruption. If an interrupted npm process leaves a development-server descendant behind, stop that stale local process before relaunching. Exported environment variables override `.env`, including explicitly empty values. Only point this synthetic launcher at disposable development data.

## Continuous integration

`.github/workflows/ci.yml` defines independent backend, web, and mobile jobs on pull requests, pushes to `main`/`master`, and manual dispatch. It uses JDK 21 and Node.js 24. Backend `verify` runs the ordinary suite plus the optional real PostgreSQL workflow tests, enabled through an isolated PostgreSQL 17 service and `TEST_DATABASE_URL`. Web CI performs locked installation, type checking, linting, and a production build. Mobile CI performs locked installation, type checking, and the package's behavior tests.

GitHub Actions are pinned to verified official commit references, the workflow grants only repository read access, and backend test reports are retained for 14 days. No deployment or browser-driven E2E execution is performed by this workflow. CI configuration is provided and locally checked; a hosted GitHub run requires the repository to be pushed and Actions enabled and has not been claimed as completed here.
