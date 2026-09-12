# Mobile patient and doctor application

The React Native/Expo application lives in `apps/mobile`. It is a patient client of the Java API, with visibly synthetic-use labelling. It includes patient login with optional TOTP, synthetic registration/recovery, overview, timeline search, medication records, sharing requests/grants, audit history and settings. Doctors also have Today, patient cards, appointments and shared visit drafts. Lab/pharmacy/admin workflows remain on web. Review actual source and final test evidence for implemented behavior.

## Development commands
From `apps/mobile`, copy `.env.example` to `.env`, set `EXPO_PUBLIC_API_URL`, run `npm ci`, then `npm start`. `npm run typecheck` checks TypeScript. `npm run export` builds application bundles. `npm run ios` and `npm run android` require the corresponding native toolchain/device setup and do not constitute signed store releases.

The iOS simulator can use `http://localhost:8080`; Android emulator uses `http://10.0.2.2:8080`. Physical devices require an explicitly reachable development host and matching backend binding. HTTP is for synthetic local development only; production-mode client requests require HTTPS. Never expose the development backend to the internet to solve device connectivity.

## Security behavior and limits
Clinical records and passwords are not persisted to AsyncStorage. Local authentication uses Expo's OS biometric integration; the preference is stored with SecureStore. Background handling clears visible clinical state and may require local biometric unlock or server login. Biometric unlock is a local privacy measure and does not replace server authentication. Native cookie/session behavior, device storage and background transitions require real iOS/Android testing.

The default emergency display uses fetched records. Patients can separately select up to five allergy, medication or prescription records for a protected offline summary, capped at 1,800 UTF-8 bytes with no clinical text truncation. This is an explicit opt-in with SecureStore `requireAuthentication: true`, device-only keychain accessibility, a 24-hour expiry, generated/expiry timestamps, and a stale/incomplete warning. Saving enables biometric app locking. The full chart is never cached.

The summary is removed on logout, account recovery, fresh login, authorization rejection, biometric-lock opt-out, or explicit removal. Opening attempts a session check and permits offline access only on network failure/timeout, never HTTP 401/403. Biometric reading is explicit, and no saved copy automatically replaces an unauthorized live response. Expiry also removes a displayed snapshot. Remote revocation cannot immediately change a disconnected copy, and TTL depends on device time. Actual OS storage/biometric enforcement remains NOT VERIFIED.

Signed QR credentials, QR scanning, notifications, medication reminder scheduling, secure document viewing, native passkeys and native distribution signing remain original-scope gaps.

## Native acceptance gates
Verify session expiry and logout on physical devices; stale in-flight responses after logout; foreground/background and biometric cancellation; both themes and dynamic text; keyboard/screen-reader navigation; minimum touch sizes; network loss and timeout; device backup behavior; secure network configuration; no clinical data in logs/screenshots/recents as supported. Typecheck or JavaScript export alone leaves these NOT VERIFIED. See final verification report for exactly which builds were executed.

## Verified development evidence
TypeScript, eight tests (four transport and four emergency-policy tests), both platform JavaScript exports, and a fresh npm audit with zero reported vulnerabilities passed. Native compilation, physical-device cookies/biometrics, signing/store distribution and native accessibility remain NOT VERIFIED. `apps/mobile/README.md` gives exact scripts and policy details.

## Native toolchain inspection
Xcode 16.3 (16E140) and iOS/Simulator 18.4 SDKs are installed, meeting React Native's stated Xcode 16.1 minimum. CocoaPods was absent from PATH/local gems. No Android SDK/adb/sdkmanager was found in checked standard/cache locations. Simulator enumeration failed with CoreSimulatorService connection refusal and sandbox log-access errors. No native compilation or device operation was performed; large platform installation was not attempted.

For current photo/menu behavior and exact verification boundaries, see [the illustrated guide](../README_USER_GUIDE.md) and [the parity matrix](PLATFORM_PARITY.md). Older test counts above describe earlier revisions.


## Organization ecosystem parity

`src/EcosystemWorkspace.tsx` implements the shared organization/workforce, tasks/orders, nursing, handoff, insurance, marketplace, billing/insurer and administration flows using React Native controls. The existing doctor and CareWorkspace screens remain. Patient Connections hosts insurance/hospitals/public booking; staff Hospital workspace opens role-adaptive tools. Staff invitation acceptance is available on sign-in. Both clients use `apps/shared/ecosystem-model.ts` and the same server permissions.

Insurance photo capture/library selection uses the existing background-photo activity guard; native authorized viewing renders image cards. PDF selection/rendering is not provided in the native insurance view. Session security, secure emergency storage, biometrics and dark/light mode remain from the existing client. Native live changes use a 60-second cursor check while mounted; OS background push is not implemented.

Both iOS/Android JavaScript exports, TypeScript checks and browser-harness workflows were executed. The harness substitutes camera, biometrics and secure-store APIs. Physical device permissions, biometric enforcement, actual hardware capture, APNs/FCM and signed device builds were NOT TESTED. See the illustrated [organization guide](ORGANIZATION_ECOSYSTEM.md) and current evidence.
