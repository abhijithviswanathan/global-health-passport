# Ecosystem verification and exact run instructions

This file records September 11 execution. Machine-readable counts and logs are in `docs/evidence/ecosystem-verification.json` and `docs/evidence/ecosystem-verification/`. Statuses are PASS, FAIL, BLOCKED or NOT TESTED only.

## Local application

From the project directory:

```sh
python3 scripts/start_saved.py --no-open
```

Open http://localhost:5173. Or double-click **Start Health Passport.command** through Desktop → Health Passport. The launcher uses the saved Java/web builds and the existing protected `.env`. Keep it running; Ctrl+C stops both services. Do not run two launchers on the same database. Use usernames in [the illustrated guide](ORGANIZATION_ECOSYSTEM.md) and the current password in `LOCAL_ACCESS.txt`.

To create/reuse the synthetic hospital walkthrough after startup:

```sh
python3 scripts/setup_ecosystem_demo.py
```

The native browser harness is a development/testing tool:

```sh
cd apps/mobile
../web/node_modules/.bin/vite --config tests/browser/vite.config.mjs
```

Open http://localhost:5174. Physical native development uses `npm start` from `apps/mobile`, followed by the Expo device/simulator workflow and an appropriate reachable API URL. Native hardware testing was NOT TESTED in this revision.

## Rebuild after edits

Use Java 21, Node 24, Python 3.12+ for the existing photo service, and Maven. With installed dependencies and a normal local Maven cache:

```sh
mvn -f apps/backend/pom.xml package
cd apps/web
npm run typecheck
npm run lint
npm run build
cd ../mobile
npm run typecheck
npm test
npm run export
```

For this computer's bundled offline backend tools, from project root:

```sh
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home ../../work/apache-maven-3.9.11/bin/mvn -f apps/backend/pom.xml -o -Dmaven.repo.local=/Users/rogue/Documents/Codex/2026-09-10/files-pasted-by-the-user-master/work/m2 package
```

Use an absolute Maven repository path if launching from a different directory. The execution used `/Users/rogue/Documents/Codex/2026-09-10/files-pasted-by-the-user-master/work/m2`. Node is available at `/Users/rogue/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`; the local `work/toolchain/bin` wrapper supplies it to package scripts. The Sites build script was used for the portable web build; no site was published.

Stop the old launcher before restarting the saved builds. Rebuilding does not hot-swap the running copied API jar. Native source changes hot-reload only in the development harness, not in an already installed device binary.

## Automated checks

```sh
# from apps/web, while the local saved application runs
node node_modules/@playwright/test/cli.js test

# from apps/mobile, while both app and native harness run
node ../web/node_modules/@playwright/test/cli.js test --config tests/browser/playwright.config.mjs
```

This computer uses `PLAYWRIGHT_BROWSERS_PATH=/Users/rogue/Documents/Codex/2026-09-10/files-pasted-by-the-user-master/work/browsers` for the downloaded test browser.

H2 backend package executed 62 active tests with zero failures; 31 PostgreSQL-only tests were skipped in that invocation. The new PostgreSQL ecosystem class separately executes 14 tests, including inherited care workflow cases. Use a fresh disposable database and the following environment variables:

```sh
TEST_DATABASE_URL=jdbc:postgresql://127.0.0.1:55432/DISPOSABLE_DATABASE \
TEST_DATABASE_USER=postgres TEST_DATABASE_PASSWORD=YOUR_PRIVATE_TEST_PASSWORD \
mvn -f apps/backend/pom.xml -Dtest=PostgresEcosystemWorkflowTest test
```

No example password is a real credential. Keep secrets out of command history in real deployments; inject them through the approved secret mechanism. The execution used a protected local password file and a fresh named database.

Coverage includes: two-tenant administration/order/record boundaries, nurse/insurer/reception restrictions, employment expiry, encrypted insurance and grant revocation, wrong patient/specimen rejection, lab/imaging/radiologist/doctor sequence, prescription dispensing and nursing administration, task prerequisites and independent verification, handoff acknowledgment, booking retries/conflicts, synthetic coverage safety, document quarantine and separate insurance-card access, identity/WebAuthn, existing clinical and photo regressions. Browser tests cover role navigation, persisted forms, cross-client task/draft state, responsive dimensions and automated accessibility. Screenshots are synthetic fixtures.

## Limits

Live eligibility/EHR/PACS endpoints and sponsored promotion are BLOCKED by missing integration inputs or legal/clinical decisions. Native hardware/OS security, external FHIR validation, production deployment, cluster/load tests, full penetration testing and V18 disaster-recovery restore were NOT TESTED. Passing local tests does not make the application production-ready.


## Final browser results

Full web suite: PASS, 14/14. Native browser harness: PASS, 7/7. Separate profile-photo regressions: PASS, 2/2. Native unit/policy tests: PASS, 18/18. Web TypeScript/ESLint/build and native TypeScript/iOS/Android exports: PASS. Run registration-heavy suites in separate fresh synthetic test-server windows: the core web suite uses the full five-registration limit, which remains enabled.
