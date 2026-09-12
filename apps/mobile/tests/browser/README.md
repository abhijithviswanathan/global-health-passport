# Mobile browser QA harness

This renders the real mobile source with React Native Web, isolated from the native dependency graph. Native storage, biometric, status bar and confirmation implementations are explicit test substitutes. This is a test preview, not a third deployed patient portal and not native-device verification.

With the Java API on 8080 and web app on 5173, from `apps/mobile`:

```sh
npm ci --prefix tests/browser
node ../web/node_modules/vite/bin/vite.js --config tests/browser/vite.config.mjs
# In another terminal:
node ../web/node_modules/@playwright/test/cli.js test --config tests/browser/playwright.config.mjs
```

Install the web workspace dependencies and a Playwright Chromium browser first. The harness runs on port 5174 and proxies API requests to the same local backend. Tests use only synthetic accounts. They create synthetic appointments, encounters and consent fixtures. Repeat runs can legitimately reach registration throttling; use a clean isolated local test service or allow the existing throttle window to expire. Do not weaken application rate limits for tests.

The clinician journey uses both the mobile screen and the actual web portal to save, resume, reject stale changes and file a note once. Additional journeys check patient navigation and revoked chart access. Native BackHandler and secure-storage behavior require separate device tests.
