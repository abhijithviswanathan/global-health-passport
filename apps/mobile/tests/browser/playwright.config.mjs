export default {
  testDir: "..",
  testMatch: "**/*-ui.spec.ts",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: new URL(
          "../../../../docs/evidence/mobile-clinician-ui.json",
          import.meta.url,
        ).pathname,
      },
    ],
  ],
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:5174",
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
};
