# Health Passport mobile

An Expo / React Native application for patients, clinicians and hospital staff in the synthetic pilot. It connects to the Java service used by the web portal. This is source code plus earlier verified JavaScript bundles, not a signed App Store or Play Store release. See [current portfolio verification](../../docs/PORTFOLIO_REVIEW.md) for the latest checks.

## Run

Prerequisites: Node.js 24 and npm, the running backend, and either a compatible Expo Go installation or native development tools. The checked-in lockfile was installed with Node 24.19.0 / npm 11.6.0.

```sh
cd apps/mobile
npm ci
cp .env.example .env
npm start
```

Set `EXPO_PUBLIC_API_URL` to the backend origin, without `/api`. iOS simulator: `http://localhost:8080`; Android emulator: `http://10.0.2.2:8080`; physical device: use the development computer's LAN address. The backend must be reachable from that device. Use only synthetic records with development HTTP. Production builds reject any API origin that does not begin with HTTPS.

Use an existing synthetic account. The server role selects the workspace; the entry tab never grants permissions. Patient, doctor, nurse, reception, lab, diagnostic, coordinator, admin, pharmacy, billing, security and insurer roles are recognized. The hospital ecosystem section below describes the expanded staff workflows. For a native development build:

```sh
npm run ios
# or, with Android SDK and an emulator/device configured:
npm run android
```

Face ID needs a development build; Expo Go does not support its iOS authentication flow. Before any distribution, replace `org.example.healthpassport`, configure signing and a real HTTPS service, and complete the native release checks below.

## Implemented

- Synthetic patient registration, login with optional authenticator code, recovery-code password reset, and logout with backend cookie sessions and fresh CSRF tokens for writes. Second-factor enrollment and passkeys use the web portal.
- Health ID card with selectable text; the identifier itself grants no access.
- Source-labelled timeline, text search, record status, and refresh.
- Medication and prescription history; no medication-change recommendations.
- Pending access-request review, selected record categories, expiry (1–720 hours), consent approval, and confirmed revocation.
- Server audit history.
- Patient-controlled online emergency summary displaying available allergies, conditions, and medicines. It is explicitly a potentially incomplete snapshot and does not implement emergency override.
- Individually selected offline emergency records (allergy/medication/prescription only), protected with SecureStore `requireAuthentication`, capped at 1,800 UTF-8 bytes and five records, expiring after 24 hours. No clinical text is truncated. Saving opts into biometric app locking.
- Light/dark appearance and accessible labelled controls with minimum touch targets.
- Opt-in biometric lock using Expo LocalAuthentication, with strong biometrics requested on Android.

## Device data policy

The app never saves the user's password or a whole-record cache. Clinical response state is cleared on backgrounding. With biometric lock enabled, successful local authentication is followed by a fresh server fetch; otherwise, backgrounding signs out locally and attempts server logout. A privacy screen is shown while inactive.

Only an explicit save action persists selected emergency records. SecureStore uses `requireAuthentication: true` and `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. A nonclinical availability flag and biometric preference are stored separately. Saved summaries show generated and expiry times and a stale/incomplete warning. They expire on opening and while displayed; TTL uses the device clock. Logout, recovery, a fresh login, an authorization rejection, disabling biometric locking, or explicit removal deletes the copy. Storage failures are surfaced where possible; storage deletion and key invalidation still require device verification.

Opening a saved summary first checks the server session when reachable. Only network failure or timeout permits offline use; HTTP 401/403 never falls back to the cache. An explicit biometric-protected read is required; the application never automatically substitutes a saved summary for live data. Remote revocation cannot instantly affect an offline device. Native biometric enforcement, key invalidation, OS backup exclusion, cookie/session behavior and physical storage removal are NOT VERIFIED.

Network cookies are managed by the native fetch stack. A failed network logout clears local screen state but cannot guarantee remote session invalidation until connectivity returns or the session expires. Device-record synchronization, notifications, QR code and distribution signing remain incomplete. Camera/library photo selection is implemented; native camera operation remains unverified. Biometric unlock is not server-side MFA, and the privacy screen does not establish prevention of OS screenshots or extraction on a compromised device.

## Earlier verification

```sh
npm run typecheck
npm test
EXPO_NO_TELEMETRY=1 npx expo export --platform ios
EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir dist-android
npm audit
```

- TypeScript strict check: passed.
- Fourteen tests: passed (four emergency-policy tests, six API transport tests and four clinician date/booking-policy tests). Emergency tests cover TTL, scope/count/byte limits, clock reversal, text preservation, and exclusion of unrelated fields. API transport checks: passed (fresh CSRF, cookie/no-store options, backend-field normalization, cleartext rejection in release, and preserved unauthorized status are covered across the transport cases).
- iOS Metro/Hermes JavaScript bundle export: passed.
- Android Metro/Hermes JavaScript bundle export: passed.
- Dependency audit: zero reported vulnerabilities at verification time. The `xcode` build dependency's `uuid` is narrowly overridden to 11.1.1 to address GHSA-w5hq-g745-h8pq. Its `generateUuid()` path was smoke-tested with an initialized project structure. This is not evidence of a complete native Xcode build.

NOT VERIFIED: iOS or Android native compilation; signed binaries; simulator/device operation; native session-cookie handling; Face ID/fingerprint enforcement; background privacy snapshots; device screen-reader and dynamic-type behavior; real API journeys from a native device; store review; production security or compliance.

## Native toolchain inspection (2026-09-10)

Xcode 16.3 (16E140) and iOS/iOS Simulator 18.4 SDKs are installed. The installed React Native package requires Xcode 16.1 or later. CocoaPods was absent from the command path and local Ruby gems; no Android SDK, `adb`, or `sdkmanager` was found in the checked standard/cache locations. `xcrun simctl list devices booted` failed with CoreSimulatorService connection refusal and sandbox log-access errors, so available runtimes and devices could not be verified. No native simulator or device build was executed and no large toolchain download was attempted.

## Release checks still required

1. Build on both supported native toolchains with signed application IDs and the correct HTTPS origin.
2. Verify login, fresh CSRF, expiry, logout, and role routing and unsupported-role rejection against the deployed service on each platform.
3. Verify background locks, cancellation and lockout, biometric enrollment change, interrupted network requests, and no record recovery after logout.
4. Exercise approval and revocation across two devices; confirm access history and stale-data behavior.
5. Inspect device storage, backups, OS screenshots, logs, crash reports, and network traffic for sensitive data.
6. Test VoiceOver, TalkBack, maximum text scaling, keyboard entry, orientation settings, and low-connectivity errors.

Sources: [Expo SDK 55](https://expo.dev/changelog/sdk-55), [SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/), [LocalAuthentication](https://docs.expo.dev/versions/v55.0.0/sdk/local-authentication/).

## Doctor workspace revision

Doctor sign-in opens Today, Patients and Agenda. Profile & photo, Settings and Sign out are grouped in the top-right menu. Search by patient name or short Health ID; request treatment access; open a shared source-labelled chart; book or reschedule appointments; check in, cancel or mark a no-show. Times use the device timezone, with date and 24-hour time inputs, Today/Tomorrow shortcuts and common duration choices. The shared backend prevents overlapping appointments.

The visit workspace includes shared context, four note sections, explicit reuse of the visit reason, a follow-up writing guide, saved server drafts, start-visit and reviewed completion. Mobile and web share the same drafts. Stale changes are rejected; Reload visit asks before discarding unsaved edits. Completion adds exactly one encounter through the shared endpoint. Save before leaving the app: clinical component state is cleared on backgrounding, and unsaved clinician text is not stored offline.

The top-left logo returns to role home. Patient and clinician screens have Back navigation; Android BackHandler is wired to the same navigation decisions. Navigation away from an unsaved clinician draft asks before discarding it.

See [the cross-platform matrix](../../docs/PLATFORM_PARITY.md) and [browser harness instructions](tests/browser/README.md). Native simulator/device checks remain unverified; an unrestricted simulator inventory returned no installed devices.

Final doctor revision evidence: **14 policy/transport tests**, strict TypeScript, **three browser-harness journeys**, and both iOS/Android Hermes exports passed. The cross-client journey edits one draft in mobile and the actual web portal before completing it on mobile. See `../../docs/evidence/mobile-clinician-verification.json`. Browser screenshots are labelled with `-browser` to avoid implying native device verification.

The doctor design refinement adds a timestamp agenda, patient cards with upcoming-visit context, compact Back and date controls, grouped secondary actions and scroll reset on section changes. The shared agenda model is included through `metro.config.cjs`; browser-test dependencies are excluded from Metro.

## Profile photo revision

See the [illustrated local guide](../../README_USER_GUIDE.md) for onboarding, all four profile audiences, private doctor/organization identification photos, local storage and setup. Camera/library permission messages and picker integration are included. The system picker temporarily preserves its hidden task; normal background privacy and sign-out rules resume when it closes. Doctor menu actions retain unsaved-draft guards. Native permission dialogs, image orientation, cache deletion and app background transitions still need physical-device testing.


## Hospital ecosystem expansion — September 11

The saved local application now includes organization onboarding, separate staff identities, workforce schedules, clinical work grids/orders, nursing/handoffs, patient insurance and a separated insurer marketplace in both clients. Start with the [illustrated workflow and account guide](../../docs/ORGANIZATION_ECOSYSTEM.md). The current password remains in the root LOCAL_ACCESS.txt; new hospital usernames start with `hospital`. Existing accounts and local records are preserved.

This remains a synthetic pilot. Live insurer/PACS integration, production MFA provisioning, clinical/legal approval and physical native-device verification are not implied by a successful local build.
