import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Run against a fresh isolated synthetic service, or after its registration window expires.
// The core suite deliberately uses the full five registrations permitted per 15 minutes.
export default defineConfig({
  ...base,
  outputDir: "test-results-photos",
  testIgnore: [],
  testMatch: "**/profile-photos.spec.ts",
  reporter: [
    ["list"],
    ["json", { outputFile: "../../docs/evidence/profile-photo-ui.json" }],
  ],
});
