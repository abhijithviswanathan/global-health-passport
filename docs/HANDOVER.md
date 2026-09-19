# Developer handover

Start here when taking over part of Health Passport. The repository contains a full local application and a separate public demonstration. The comments describe existing behavior; they do not certify clinical use or production readiness.

## 1. Choose the right application

| Surface | Entry point | What it runs |
| --- | --- | --- |
| Full web app | [`apps/web/app/page.tsx`](../apps/web/app/page.tsx) | React UI backed by Java sessions, permissions and persisted records |
| Mobile app | [`apps/mobile/App.tsx`](../apps/mobile/App.tsx) | Expo/React Native UI using the same Java API |
| Backend | [`Application.java`](../apps/backend/src/main/java/org/healthpassport/Application.java) | Spring Boot controllers, JDBC storage and Flyway migrations |
| Public presentation | [`docs/index.html`](index.html) | Standalone fictional demo on [GitHub Pages](https://abhijithviswanathan.github.io/global-health-passport/); no real login, backend, uploads or persistent edits |

Changing the full web app does **not** update the Pages demo. Editing the demo does **not** change the full app. The demo is intentionally independent because GitHub Pages only serves its static files. Keep it labelled as fictional, including any new examples.

## 2. First run on a coworker's computer

Install Java 21, Node.js 24 with npm, Python 3.12 or newer, and Git. Use the checked-in lockfiles. Native builds also need the relevant iOS/Android development tools.

```sh
# Clone once, then work from this directory.
git clone https://github.com/abhijithviswanathan/global-health-passport.git
cd global-health-passport

# Creates private local configuration, prepares the photo checker, installs the
# web dependencies, verifies/builds Java and starts API + web development servers.
python3.12 scripts/dev.py --install
```

If your Python 3.12+ executable is named `python3`, use that name. Open `http://localhost:5173` and keep the launcher running. Java listens on port 8080. Use `localhost` for browser passkeys because it matches the configured relying-party identity.

In a second terminal, from the repository root:

```sh
# Prints this installation's generated synthetic credentials. Keep this output private.
python3.12 scripts/configure.py --show-accounts
```

Stop the launcher with Ctrl+C. Later starts use `python3.12 scripts/dev.py`; `--no-build` reuses the last Java package. Web source still runs through the development server. The alternative `scripts/start_saved.py` starts existing backend and web builds, so source edits require rebuilding first.

Mobile setup, with the API running:

```sh
cd apps/mobile
npm ci
cp .env.example .env
# Edit EXPO_PUBLIC_API_URL for the simulator/device before starting Expo.
npm start
```

The mobile URL excludes `/api`: typically `http://localhost:8080` for the iOS simulator, `http://10.0.2.2:8080` for the Android emulator, or a reachable development-host address for a physical device. Device access requires an appropriate backend bind address and firewall configuration. Release requests require HTTPS. See [mobile setup](../apps/mobile/README.md) for limits and native tooling.

The application creates a small base fixture. The richer presentation examples are produced by the `setup_*_demo.py` scripts. These scripts **write** fictional records through the API; read their inputs and the [showcase report](../DEMO_SHOWCASE_REPORT.md) before rerunning them against an existing database.

To preview only the public static demonstration:

```sh
# From the repository root; no Java or npm installation is needed.
python3 -m http.server 5180 --bind 127.0.0.1 --directory docs
```

Open `http://localhost:5180`. Changes to sample tasks disappear on refresh. This is not a way to run the full platform.

## 3. Read the code in this order

1. [`apps/web/lib/api.ts`](../apps/web/lib/api.ts) and [`apps/mobile/src/api.ts`](../apps/mobile/src/api.ts): session cookies, CSRF, errors and the difference in row naming.
2. [`PassportApi.java`](../apps/backend/src/main/java/org/healthpassport/PassportApi.java): `user()`, `allowed()`, `require()`, `create()` and the consent routes. These explain the core trust boundary.
3. [`TenantService.java`](../apps/backend/src/main/java/org/healthpassport/TenantService.java) and [`CareApi.java`](../apps/backend/src/main/java/org/healthpassport/CareApi.java): organization identity, employment, assignment, transactions and versions.
4. The shared [`care-model.ts`](../apps/shared/care-model.ts) and [`ecosystem-model.ts`](../apps/shared/ecosystem-model.ts), followed by the corresponding web and native workspaces. Most staff forms are described once and rendered twice.
5. The feature's integration test, its database migration and its entry in the [source map](SOURCE_MAP.md).

Do not begin by splitting the largest files solely to make them smaller. They contain coupled session, draft and permission lifecycles. When a feature needs extraction, preserve those boundaries and verify both clients.

## 4. Where to make a change

| Requested change | Shared/server owner | Client locations |
| --- | --- | --- |
| Health ID generation/lookup | `HealthIds`, `PassportApi`, identity endpoints | Web `page.tsx`; mobile `App.tsx` |
| Login, session, recovery or MFA | `IdentityApi`, `IdentityService`, `PasskeyApi`, `PasskeyService` | Web `account-entry`, `security-panel`, `lib/passkeys`; mobile `App.tsx` for supported flows |
| Patient records and sharing | `PassportApi`, `RecordProvenance` | Web `page.tsx`; mobile `App.tsx` |
| Doctor agenda/bookings/drafts | `ClinicianApi`, shared `agenda.ts` | Web/native `ClinicianWorkspace`; native `clinician-model.ts` |
| Intake, tasks, messages, assignments | `CareApi`, shared `care-model.ts` | Web/native `CareWorkspace` |
| Organizations, staff and shifts | `EcosystemApi`, `TenantService`, shared `ecosystem-model.ts` | Web/native `EcosystemWorkspace` |
| Orders, nursing and handoffs | `ClinicalOperationsApi`, `CareApi` | Shared ecosystem forms and both ecosystem workspaces |
| Insurance and marketplace | `InsuranceApi`, `EligibilityProvider`, `DocumentService` | Shared ecosystem forms and both ecosystem workspaces |
| Profile/identification photos | `ProfileApi`, `PhotoService`, `photo-check/check.py` | Web `profile-photos`; native `ProfilePhotos` |
| Clinical file upload/download | `DocumentApi`, `DocumentService` | Web `documents-panel`; consult the parity matrix before assuming mobile support |
| Exports and educational examples | `FhirMapper`, `OrganizationFhirApi`, `MedicationPassportApi`, `LearningApi` | Relevant web panels; mobile support varies |
| App navigation/home/back | Server role from `/me` | Web `page.tsx`; mobile `App.tsx` and workspace back/discard handlers |
| Public demo presentation | `docs/index.html` only | Responsive HTML/CSS/JS in the same file |

The [source map](SOURCE_MAP.md) links directly to each module and explains its responsibility. Generic web controls live under `apps/web/components/ui`; feature-specific styling is beside its workspace or in the app styles. Starter build code under `apps/web/build` is tooling, not the clinical backend.

## 5. Trace a staff action from button to database

A care-workflow action normally follows this path:

```text
care-model.actions() defines endpoint + fields + fixed context
    -> web CareWorkspace or native CareWorkspace renders the form
    -> initial() supplies fresh defaults; options() supplies permitted choices
    -> payload() converts values and adds the stable request/idempotency key
    -> web api() / native request(..., raw=true) sends the request
    -> CareApi authenticates, checks scope/assignment, locks and validates version
    -> JDBC transaction updates rows + revision/event/audit records
    -> client refreshes from the server or displays a conflict/error
```

For organization work, `ecosystem-model.context()` loads supporting choices, `rows()` loads the section, and `actions()` supplies the forms. `ClinicalOperationsApi` and `InsuranceApi` handle their domain-specific requests. The UI model describes the form; it never grants permission.

**Example: adding a field to a nursing action.** Find the action in `ecosystem-model.ts`; check how `payload()` represents it; add validation/persistence to the relevant Java endpoint; add a new Flyway migration if storage changes; check both renderers support the field type; exercise valid, missing, unauthorized and stale submissions. A purely visual label may need no migration or new test.

## 6. Data conventions that are easy to miss

| Concept | Meaning in this codebase |
| --- | --- |
| Internal ID vs Health ID | Internal resources use UUIDs. The nine-character Health ID is a public lookup label, never a password or a permission grant. |
| JSON naming | JDBC response rows are usually `snake_case`; request fields are commonly `camelCase`. Web keeps server keys. Native `request()` normally converts only top-level row keys; shared care/ecosystem callers use `raw=true`. Nested data is not recursively converted. |
| Role vs employment vs consent | Session role, active organization employment/privileges, clinic assignment and patient consent are separate checks. An admin is not automatically entitled to a clinical chart. |
| Observed vs entered time | `observed_at` describes when care happened, with its zone. `created_at`/`updated_at` describe entry/edit time. A confirmation or carry-forward must not fabricate a new observation. |
| Appointment time | API booking inputs are instants with offsets; calendar controls display local time. `agenda.ts` and native date helpers handle local-day boundaries. A free agenda gap is not necessarily a bookable workforce slot. |
| Version | The version the user originally loaded. A mismatch produces 409; refresh and review rather than silently overwriting newer work. |
| Request/idempotency key | Identifies one logical submission across retries. Keep the key while retrying; create a new one for a new form/action. |
| Task vs record | Operational task completion, a chat read and clinical result review are different actions. Promoting a message into the chart is explicit. |
| Missing data | Unknown observation time, pending results and unverified coverage must remain unknown. Do not substitute invented clinical conclusions. |

Keep payload field names aligned with the server. `Row = Record<string, any>` reflects variable permission-scoped data, not runtime validation. Server validators and integration tests remain necessary.

## 7. Rules to preserve during edits

- Resolve the authenticated user on the server. Login tabs, hidden buttons and client IDs are not security checks.
- Recheck current consent and organization access before serving records, photos, documents or exports. Preserve denial paths as well as the happy path.
- Keep frontend generation/abort guards when changing session or patient loading. A late response must not put the previous patient's data back on screen.
- Keep transactions, row locks, request keys and version checks together around mutations. Java `synchronized` and in-memory rate limits coordinate one process, not a distributed deployment.
- Add a **new** numbered Flyway migration. Do not edit already-applied SQL or `V10__compact_health_ids.java`; migration checksums are part of upgrade integrity.
- A scanner outage keeps documents quarantined. A detected face does not verify a person's identity. Profile audience rules do not expose hospital-held identification photos.
- Native background/biometric/picker handling is deliberate. The emergency snapshot is a separate, explicitly selected, small, expiring SecureStore copy; general record caching is not enabled.
- Private insurance shares and identifiers stay separate from public plan browsing and marketplace data.
- Keep `.env`, generated passwords, keys, databases, uploads and local logs out of Git. Give a coworker source and setup instructions, then generate their own local configuration.

## 8. Checks before submitting work

Run the checks relevant to the changed layer. These are the current package commands, from the indicated directory:

```sh
# apps/backend
./mvnw -B --no-transfer-progress verify

# apps/web
npm run typecheck
npm run lint
npm run build
# Requires the configured running services and a Playwright browser:
npm run test:e2e

# apps/mobile
npm run typecheck
npm test
# Bundle checks when native dependencies or bundling change:
EXPO_NO_TELEMETRY=1 npx expo export --platform ios
EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir dist-android
```

The backend suite includes optional PostgreSQL cases that skip locally without `TEST_DATABASE_URL`; [CI](../.github/workflows/ci.yml) supplies an isolated PostgreSQL service. A local H2 pass alone is not PostgreSQL evidence. The mobile browser harness and bundle exports do not prove camera, biometric, secure-store, cookies or background behavior on a physical device.

The hosted CI workflow verifies Java/PostgreSQL, web types/lint/build and mobile types/tests. It does not deploy the Java server or run all browser/device tests. For cross-client behavior changes update [PLATFORM_PARITY.md](PLATFORM_PARITY.md), record exactly what ran, and keep known gaps visible.

## 9. GitHub handoff and publication

Work on a branch, commit a focused change, and have the other developer review its diff. Start from the latest `main`; preserve unrelated work. A useful review explains the changed behavior, both-client impact and actual checks.

The public demo is deployed separately by GitHub Pages from **`main` → `/docs`**. Keep `docs/.nojekyll` and `docs/index.html`. No backend keys or environment variables are required for that demo. After editing it, preview the responsive layouts, patient selector, search, dialogs and task reset; then check the Pages deployment and live URL. No dependency build is needed for this file.

For a full local-app change, use the normal CI workflow and setup instructions. Publishing source to GitHub does not start Java, a database or a mobile service. The repository still has explicit production and native-device limitations in [PORTFOLIO_REVIEW.md](PORTFOLIO_REVIEW.md).

## 10. Keep the handover useful

Comments explain module responsibility, data flow and invariants. Update a nearby comment when you change the rule it describes. Avoid comments that merely repeat each assignment; use clear names and small functions for new logic. Preserve existing lint/typing suppression directives when moving comments because some attach to the next line.

For the next developer, include the feature being delegated, relevant source-map entries, a synthetic reproduction, expected behavior, and the checks required. Share access through GitHub's normal collaborator controls; do not share the owner's login credentials.
