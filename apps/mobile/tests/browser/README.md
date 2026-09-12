# Mobile browser QA harness

This renders the real mobile source with React Native Web, isolated from the native dependency graph. Native storage, biometric, status bar and confirmation implementations are explicit test substitutes. This is a test preview, not a third deployed patient portal and not native-device verification.

With the Java API on 8080 and web app on 5173, from `apps/mobile`:

```sh
npm ci --prefix tests/browser
node ../web/node_modules/vite/bin/vite.js --config tests/browser/vite.config.mjs
# In another terminal:
npx playwright test --config tests/browser/playwright.config.mjs
```

Install both mobile and web workspace dependencies and a Playwright Chromium browser first (`npx playwright install chromium` from apps/mobile). The mobile package declares its own Playwright and axe test dependencies; normal mobile type checks do not require a web node_modules directory. The optional rendering harness still uses the web workspace's Vite installation. The harness runs on port 5174 and proxies API requests to the same local backend. Tests use only synthetic accounts. They create synthetic appointments, encounters and consent fixtures. Repeat runs can legitimately reach registration throttling; use a clean isolated local test service or allow the existing throttle window to expire. Do not weaken application rate limits for tests.

The clinician journey uses both the mobile screen and the actual web portal to save, resume, reject stale changes and file a note once. Additional journeys check patient navigation and revoked chart access. Native BackHandler and secure-storage behavior require separate device tests.
