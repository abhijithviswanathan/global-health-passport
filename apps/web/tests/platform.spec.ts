import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import crypto from "node:crypto";
const rootEnv = fs.existsSync("../../.env")
  ? Object.fromEntries(
      fs
        .readFileSync("../../.env", "utf8")
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1)];
        }),
    )
  : {};
const seedPassword = process.env.DEMO_PASSWORD || rootEnv.DEMO_PASSWORD;
async function signIn(page: Page, username: string, password = seedPassword) {
  expect(password, "Configure synthetic account password").toBeTruthy();
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}
async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).first().click();
}
async function pick(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function createPatient(page: Page) {
  const username = "qa" + crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    name = "Synthetic E2E " + username,
    password = Buffer.from(crypto.randomBytes(20)).toString("base64url");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a synthetic account", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Username", { exact: true }).fill(username);
  await dialog
    .getByLabel("Display name (synthetic)", { exact: true })
    .fill(name);
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Your synthetic account is ready",
  );
  await dialog.getByRole("button", { name: "Return to sign in" }).click();
  await signIn(page, username, password);
  const me = await (await page.request.get("/api/me")).json();
  return { username, name, password, id: me.id, healthId: me.healthId };
}
async function grant(page: Page, name: string) {
  await nav(page, "Sharing & permissions");
  await page
    .getByRole("button", { name: "Grant access", exact: true })
    .first()
    .click();
  await pick(page, "Provider", name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Grant access", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .locator(".consent-row")
      .filter({ hasText: name })
      .filter({
        has: page.getByRole("button", { name: "Revoke", exact: true }),
      }),
  ).toContainText("active");
}
async function addRecord(page: Page, title: string, details: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByLabel("Clinical details", { exact: true }).fill(details);
}
async function saveRecord(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("complete registration, consent, clinician, laboratory, pharmacy and audit journey", async ({
  page,
}) => {
  const patient = await createPatient(page);
  await signOut(page);
  await signIn(page, "doctor");
  await page
    .getByRole("button", { name: "Request access", exact: true })
    .click();
  await page
    .getByLabel("Patient Health ID", { exact: true })
    .fill(patient.healthId);
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await signOut(page);
  await signIn(page, patient.username, patient.password);
  await nav(page, "Sharing & permissions");
  await expect(
    page.getByText("Dr. Jordan Chen (Synthetic)", { exact: true }),
  ).toBeVisible();
  await grant(page, "Dr. Jordan Chen (Synthetic)");
  await grant(page, "Northstar Laboratory (Synthetic)");
  await grant(page, "Harbor Pharmacy (Synthetic)");
  await signOut(page);
  await signIn(page, "doctor");
  await pick(page, "Select authorized patient", patient.name + " (Synthetic)");
  await nav(page, "Medical timeline");
  await page.getByRole("button", { name: "Add record", exact: true }).click();
  await addRecord(
    page,
    "Synthetic outpatient review",
    "Synthetic encounter used only for automated workflow verification.",
  );
  await saveRecord(page);
  await expect(
    page.getByRole("button", { name: /Synthetic outpatient review/ }),
  ).toBeVisible();
  await nav(page, "Labs & imaging");
  await page.getByRole("button", { name: "Order a test", exact: true }).click();
  await addRecord(
    page,
    "Synthetic complete blood count",
    "Authorized test order for automated verification.",
  );
  await pick(page, "Assigned recipient", "Northstar Laboratory (Synthetic)");
  await saveRecord(page);
  await nav(page, "Medication Passport");
  await page
    .getByRole("button", { name: "New prescription", exact: true })
    .click();
  await addRecord(
    page,
    "Synthetic medication prescription",
    "Fictional prescription; not for clinical use.",
  );
  await pick(page, "Assigned recipient", "Harbor Pharmacy (Synthetic)");
  const d = page.getByRole("dialog");
  await d.getByLabel("Quantity", { exact: true }).fill("10");
  await d.getByLabel("Dosage", { exact: true }).fill("5 mg");
  await d.getByLabel("Frequency", { exact: true }).fill("Once daily");
  await d.getByLabel("Duration", { exact: true }).fill("10 days");
  await saveRecord(page);
  await signOut(page);
  await signIn(page, "lab");
  await pick(page, "Select authorized patient", patient.name + " (Synthetic)");
  await nav(page, "Labs & imaging");
  await page.getByRole("button", { name: "Add a record", exact: true }).click();
  await addRecord(
    page,
    "Synthetic CBC result",
    "Synthetic laboratory report: hemoglobin 14.2 g/dL.",
  );
  await pick(page, "Related order", "Synthetic complete blood count");
  await saveRecord(page);
  await signOut(page);
  await signIn(page, "pharmacy");
  await pick(page, "Select authorized patient", patient.name + " (Synthetic)");
  await nav(page, "Medication Passport");
  await page
    .getByRole("button", { name: "Record dispensing", exact: true })
    .click();
  await addRecord(
    page,
    "Synthetic dispensing",
    "Dispensed according to the authorized synthetic prescription.",
  );
  await pick(page, "Related order", "Synthetic medication prescription");
  await page
    .getByRole("dialog")
    .getByLabel("Quantity", { exact: true })
    .fill("10");
  await saveRecord(page);
  await expect(
    page.getByRole("button", { name: /Synthetic dispensing/ }),
  ).toBeVisible();
  await signOut(page);
  await signIn(page, patient.username, patient.password);
  await nav(page, "Labs & imaging");
  await expect(
    page.getByRole("button", { name: /Synthetic CBC result/ }),
  ).toBeVisible();
  await nav(page, "Access history");
  await expect(
    page.locator(".audit-row").filter({ hasText: "record created" }).first(),
  ).toBeVisible();
  await nav(page, "Sharing & permissions");
  const row = page
    .locator(".consent-row")
    .filter({ hasText: "Dr. Jordan Chen (Synthetic)" })
    .filter({ has: page.getByRole("button", { name: "Revoke", exact: true }) });
  await row.getByRole("button", { name: "Revoke", exact: true }).click();
  await page
    .getByRole("button", { name: "Revoke permission", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await signOut(page);
  await signIn(page, "doctor");
  const forbidden = await page.request.get(
    `/api/patients/${patient.id}/timeline`,
  );
  expect(forbidden.status()).toBe(403);
});

test("patient notes preserve source and amendments; unsafe markup remains text", async ({
  page,
}) => {
  await createPatient(page);
  await page.getByRole("button", { name: /Add a health note/ }).click();
  await addRecord(
    page,
    "Patient historical note",
    '<img src=x onerror="window.__unsafe=true"> Synthetic observation.',
  );
  await saveRecord(page);
  await page.getByRole("button", { name: /Patient historical note/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Patient entered");
  await expect(page.getByRole("dialog").locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Amend this record" }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Clinical details", exact: true })
    .fill("Corrected synthetic observation.");
  await saveRecord(page);
  await nav(page, "Medical timeline");
  expect(
    await page.getByRole("button", { name: /Patient historical note/ }).count(),
  ).toBe(2);
});

test("real browser WebAuthn enrollment and passkey sign-in", async ({
  page,
  context,
}) => {
  const patient = await createPatient(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await nav(page, "Account security");
  await page.getByRole("button", { name: "Add passkey", exact: true }).click();
  await page
    .getByLabel("Current password", { exact: true })
    .fill(patient.password);
  await page
    .getByRole("button", { name: "Create passkey", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/1 enrolled\./)).toBeVisible();
  await signOut(page);
  await page.getByLabel("Username", { exact: true }).fill(patient.username);
  await page
    .getByRole("button", { name: "Sign in with a passkey", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your health, in perspective" }),
  ).toBeVisible();
});

test("uploaded files stay quarantined without a scanner; signed QR has no direct health data", async ({
  page,
}) => {
  await createPatient(page);
  await nav(page, "Clinical documents");
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await page.getByLabel("Document file", { exact: true }).setInputFiles({
    name: "synthetic-report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n",
    ),
  });
  await page
    .getByRole("button", { name: "Upload securely", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".consent-row").filter({ hasText: "synthetic-report.pdf" }),
  ).toContainText("quarantined");
  await expect(
    page
      .locator(".consent-row")
      .filter({ hasText: "synthetic-report.pdf" })
      .getByRole("button", { name: "Download" }),
  ).toBeDisabled();
  await nav(page, "Medication Passport");
  await page.getByRole("button", { name: "Generate QR", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByAltText("Expiring medication passport reference"),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Expires");
});

test("responsive light/dark patient views meet automated WCAG checks", async ({
  page,
}) => {
  await signIn(page, "patient");
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important}",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const name of [
    "Overview",
    "Medical timeline",
    "Medication Passport",
    "Labs & imaging",
    "Clinical documents",
    "Sharing & permissions",
    "Access history",
    "Account security",
  ]) {
    await nav(page, name);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations, `${name} accessibility`).toEqual([]);
  }
  await nav(page, "Overview");
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow at ${width}px`,
    ).toBe(true);
    expect(
      await page
        .getByRole("button", { name: "Export records", exact: true })
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      `export button at ${width}px`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "200% text does not overflow",
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("administrators have useful organization metadata but cannot read clinical records", async ({
  page,
}) => {
  await signIn(page, "admin");
  await nav(page, "Organization");
  await expect(
    page.getByRole("heading", { name: "Organization practitioners" }),
  ).toBeVisible();
  await expect(
    page.getByText("Dr. Jordan Chen (Synthetic)", { exact: true }),
  ).toBeVisible();
  const patients = await (await page.request.get("/api/patients")).json();
  expect(patients).toEqual([]);
  expect(
    (await page.request.get("/api/patients/not-authorized/timeline")).status(),
  ).toBe(403);
});

test("patient FHIR export and source review; physician learning stays separate", async ({
  page,
}) => {
  await signIn(page, "patient");
  await page
    .getByRole("button", { name: "Review sources", exact: true })
    .click();
  await expect(page.locator(".summary-row").first()).toBeVisible();
  await page
    .locator(".summary-row")
    .first()
    .getByRole("button", { name: /View source/ })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await nav(page, "Medication Passport");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "FHIR export", exact: true }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  const bundle = JSON.parse(fs.readFileSync(file!, "utf8"));
  expect(bundle.resourceType).toBe("Bundle");
  expect(
    bundle.entry.some(
      (e: { resource: { resourceType: string } }) =>
        e.resource.resourceType === "Patient",
    ),
  ).toBe(true);
  await nav(page, "Overview");
  fs.mkdirSync("../../docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "../../docs/screenshots/patient-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../../docs/screenshots/patient-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signOut(page);
  await signIn(page, "doctor");
  await nav(page, "Clinical learning");
  await page
    .getByLabel("Symptoms, concepts, or laboratory patterns", { exact: true })
    .fill("fever");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Search fictional cases", exact: true })
    .click();
  await expect(page.locator(".case-card").first()).toBeVisible();
  await expect(page.locator(".case-card").first()).toContainText("Synthetic");
});
