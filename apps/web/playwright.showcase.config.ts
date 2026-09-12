import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig(base, {
  testMatch: "**/showcase.spec.ts",
  reporter: [
    ["list"],
    ["json", { outputFile: "../../docs/evidence/showcase-ui.json" }],
  ],
});
