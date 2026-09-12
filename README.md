# Global Health Passport

**Start here:** [Illustrated local app guide — photos, privacy, doctor workflow, running, backup and deployment](README_USER_GUIDE.md). On this Mac, open **Desktop → Health Passport → Start Health Passport.command**.

An executable synthetic healthcare-record platform with a Java API, responsive patient/provider web portal and Expo patient and doctor application. It includes consent-controlled records, laboratory/pharmacy workflows, passkeys/TOTP, audit history, document quarantine, signed medication snapshots, bounded FHIR export and synthetic learning search.

**This is a development delivery, not a completed or approved live-patient service.** The complete original scope and remaining work are recorded in [DELIVERY_REPORT.md](DELIVERY_REPORT.md) and [the 46-section coverage matrix](docs/MASTER_TRACEABILITY.md). Do not enter real patient information. No production deployment was performed.

## Start locally

Prerequisites: **Java 21**, **Node.js 24 with npm**, **Python 3.12+**, and network access for first dependency installation. A checked-in Maven wrapper downloads Maven 3.9.11 and verifies its checksum. Run these commands from the repository root:

```sh
python3.12 scripts/dev.py --install
```

The launcher creates private local configuration without overwriting an existing `.env`, installs web dependencies, builds/verifies the backend, starts its persistent synthetic H2 database, runs all Flyway migrations, seeds synthetic accounts on an empty database, and starts the web/API. No separate database installation is needed for this default mode.

Open [http://localhost:5173](http://localhost:5173). Use **localhost**, rather than the IP-address URL, for the default WebAuthn relying party. In another terminal:

```sh
python3 scripts/configure.py --show-accounts
```

This displays the locally generated initial password for `patient`, `doctor`, `lab`, `pharmacy`, `admin` and `security`. These are synthetic accounts. Changing `.env` does not reset an existing user's password. Keep `.env`, local data and signing-key files private; they are excluded from version control.

Press **Ctrl+C** in the launcher terminal to stop both services. Logs are in `.runtime/backend.log` and `.runtime/web.log`. For later starts with existing dependencies, use `python3 scripts/dev.py`; `--no-build` reuses an already built backend archive.

## Try the connected workflow

1. Sign in as `patient`; inspect the Health ID and source-labelled records. Registration can create another synthetic patient.
2. Sign in as `doctor`; request access using that Health ID.
3. As the patient, approve selected categories and an expiry. Requesting access alone reveals no record.
4. As the doctor, create an encounter, an assigned laboratory order and an assigned pharmacy prescription with structured quantity/regimen fields.
5. As `lab`, post a result against its assigned order after the patient grants laboratory scopes.
6. As `pharmacy`, inspect permitted prescriptions and record a dispense after the patient grants pharmacy scopes. Duplicate/conflicting fills are checked by the backend.
7. As the patient, inspect results and access history, then revoke a grant. Subsequent provider access is denied.
8. Explore security settings, source-linked excerpts, medication credential issuance and doctor-only synthetic case search. The learning examples are fictional and do not recommend treatments.

Browser and API evidence are distinct: see the delivery report for exactly what was executed. Some full-product sections remain intentionally absent or gated rather than represented as clinical functionality.

## Configure features

[.env.example](.env.example) documents the settings. Prefer `python3 scripts/configure.py` to generate private local values instead of filling secrets into tracked files.

| Setting | Purpose |
|---|---|
| `DEMO_MODE`, `DEMO_PASSWORD` | Explicit synthetic seeding; credentials apply only at initial seed |
| `IDENTITY_ENCRYPTION_KEY` | Base64 32-byte key protecting TOTP secrets; missing key blocks enrollment |
| `DOCUMENT_ENCRYPTION_KEY` | Base64 32-byte key protecting document and photo blobs; missing key blocks upload |
| `CLAMAV_EXECUTABLE` | Approved scanner executable; absent scanner leaves uploads quarantined |
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGINS` | Exact relying party/origin; localhost defaults are development only |
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | Optional PostgreSQL JDBC connection |
| `PASSPORT_SIGNING_PRIVATE_KEY`, `PASSPORT_SIGNING_PUBLIC_KEY` | External Ed25519 keys outside demo mode; demo can create a protected local key file |
| `COOKIE_SECURE` | False only for local HTTP; HTTPS deployments require secure cookies |

The API defaults to `127.0.0.1:8080`; web uses a same-origin API proxy. Backend configuration and detailed endpoints are in [apps/backend/README.md](apps/backend/README.md) and [docs/API.md](docs/API.md). Flyway runs automatically at API startup. Do not edit an applied migration or point test commands at a clinical database.

## Mobile development

Start the API, then in a separate terminal:

```sh
cd apps/mobile
npm ci
cp .env.example .env
npm start
```

Set `EXPO_PUBLIC_API_URL` without `/api`: iOS simulator `http://localhost:8080`, Android emulator `http://10.0.2.2:8080`, or the reachable development-host address for a physical device. Backend binding/firewall must allow that device; do not expose the synthetic service publicly. Native `npm run ios` / `npm run android` require the appropriate SDKs, signing and device/emulator tooling.

The mobile app supports online patient views and explicitly selected, capped, expiring emergency copies through OS-protected storage APIs. Native biometric/storage enforcement has **not** been verified on a device. JavaScript exports are not signed native binaries. See [mobile setup and limits](apps/mobile/README.md).

## Verify

```sh
# Backend: default H2 suite; optional PostgreSQL cases skip without a test URL
cd apps/backend
./mvnw verify
```

```sh
# From apps/web
npm run typecheck
npm run lint
npm run build
npm audit
# Requires running local services and a supported Playwright browser installation
npm run test:e2e
```

```sh
# From apps/mobile
npm run typecheck
npm test
EXPO_NO_TELEMETRY=1 npx expo export --platform ios
EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir dist-android
npm audit
```

The final Playwright run passed all seven tests against the production-format static build and live API, including the cross-role workflow and automated accessibility checks. Initial browser-launch blockers were resolved for this final run. Exact coverage and limitations are in the delivery report.

Real PostgreSQL 17.11 passed six workflow cases and all eight migrations. A bounded logical restore matched 13 application tables, seven identity-sequence states and 36 audit-chain events. Reproduction scripts and exact limits are in [PostgreSQL verification](apps/backend/POSTGRES_VERIFICATION.md). This is not evidence of point-in-time recovery, blob/key restoration or production disaster recovery.

## Docker option

Dockerfiles and a local PostgreSQL/API/web Compose configuration are provided:

```sh
python3 scripts/configure.py
docker compose up --build
```

Open the same localhost web address. Stop with `docker compose down`; volumes preserve synthetic data. Docker/Compose execution and container scanning were **not verified** on this host. This configuration is not production infrastructure or a compliance deployment. Do not delete volumes containing information you need to retain.

## Read next

- [Delivery report and remaining work](DELIVERY_REPORT.md)
- [Project source of truth](PROJECT_SOURCE_OF_TRUTH.md)
- [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [FHIR](docs/FHIR.md)
- [Security scan evidence](docs/SECURITY_SCAN.md), [testing](docs/TESTING.md), [compliance gates](docs/COMPLIANCE.md)
- [Operations](docs/OPERATIONS.md), [troubleshooting](docs/TROUBLESHOOTING.md), [ADRs](ADRs)

## Doctor workspace

Open [Doctor sign-in](http://localhost:5173/?portal=doctor) and use the existing local doctor account. Today, Patients and Appointments provide scheduling and saved visit notes with shared chart context. [Workflow and boundaries](docs/CLINICIAN_WORKSPACE.md) · [Verification](docs/evidence/clinician-workspace-verification.json).

## Care coordination revision — 11 September 2026

See [the illustrated care-team guide](docs/CARE_TEAM_WORKFLOWS.md). Web and mobile share clinic assignments, patient consent, observation/entry timestamps, source/author metadata, version history, task acknowledgment, scoped conversations, clinic scheduling, orders/results and doctor review. Flyway migrations V13–V14 are additive. Keep database and encrypted local files backed up together before upgrading.

With the local synthetic app running, `python3 scripts/setup_care_demo.py` prepares a separate Casey Rivera walkthrough. Use the existing local credential file for staff passwords. This creates internal synthetic fixtures, not external orders or notifications.


## Hospital ecosystem expansion — September 11

The saved local application now includes organization onboarding, separate staff identities, workforce schedules, clinical work grids/orders, nursing/handoffs, patient insurance and a separated insurer marketplace in both clients. Start with the [illustrated workflow and account guide](docs/ORGANIZATION_ECOSYSTEM.md). The current password remains in the root LOCAL_ACCESS.txt; new hospital usernames start with `hospital`. Existing accounts and local records are preserved.

This remains a synthetic pilot. Live insurer/PACS integration, production MFA provisioning, clinical/legal approval and physical native-device verification are not implied by a successful local build.
