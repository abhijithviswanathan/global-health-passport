import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import crypto from "node:crypto";
const env = Object.fromEntries(
  fs
    .readFileSync("../../.env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
async function post(c: APIRequestContext, path: string, data: unknown) {
  const csrf = await (await c.get("/api/csrf")).json();
  const response = await c.post(`/api${path}`, {
    data,
    headers: { [csrf.headerName]: csrf.token },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function doctor(page: Page) {
  await page.goto("/?portal=doctor");
  await expect(
    page.getByRole("heading", { name: "Staff sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a synthetic account" }),
  ).toHaveCount(0);
  await page.getByLabel("Username", { exact: true }).fill("doctor");
  await page.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your day, with room for care." }),
  ).toBeVisible();
}
async function choose(page: Page, label: string, value: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}

test("doctor books, reschedules, resumes a draft and files one encounter", async ({
  page,
}) => {
  await doctor(page);
  const me = await (await page.request.get("/api/me")).json();
  const p = await request.newContext({
    baseURL: process.env.PASSPORT_TEST_WEB_URL || "http://localhost:5173",
  });
  const username =
      "docui" + crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    name = "Synthetic visit " + username;
  try {
    await post(p, "/auth/register", {
      username,
      displayName: name,
      password: "synthetic-ui-password-483!",
    });
    const patient = await post(p, "/auth/login", {
      username,
      password: "synthetic-ui-password-483!",
    });
    await post(p, "/consents", {
      patientId: patient.id,
      granteeId: me.id,
      purpose: "treatment",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      scopes: [
        "encounter",
        "allergy",
        "condition",
        "medication",
        "prescription",
        "lab_result",
        "document",
      ],
    });
    await page.reload();
    await page.getByRole("button", { name: "Patients", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Search patients" })
      .fill(patient.healthId);
    await expect(page.locator(".patient-directory-list article")).toHaveCount(
      1,
    );
    await expect(page.locator(".patient-directory-list article")).toContainText(
      name,
    );
    await page.getByRole("button", { name: "Open chart", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Patient workspace", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Go back", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your patients", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Appointments", exact: true })
      .click();
    const at = new Date();
    at.setDate(at.getDate() + 50 + crypto.randomInt(25));
    at.setHours(9 + crypto.randomInt(7), crypto.randomInt(4) * 15, 0, 0);
    const local = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
    const time = `${local}T${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    await page.getByLabel("Schedule date").fill(local);
    await page
      .getByRole("button", { name: "Book appointment", exact: true })
      .first()
      .click();
    await choose(
      page,
      "Appointment patient",
      `${name} (Synthetic) · ${patient.healthId}`.replace(" (Synthetic)", ""),
    );
    await page.getByLabel("Appointment time", { exact: true }).fill(time);
    await page
      .getByLabel("Visit reason", { exact: true })
      .fill("Synthetic continuity review " + username);
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const row = page.locator(".schedule-row").filter({ hasText: username });
    await expect(row).toContainText("Scheduled");
    await row.getByText("More", { exact: true }).click();
    await row.getByRole("button", { name: "Reschedule", exact: true }).click();
    at.setMinutes(at.getMinutes() + 30);
    const revised = `${local}T${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    await page.getByLabel("Appointment time", { exact: true }).fill(revised);
    await page.getByRole("button", { name: "Save new time" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await row.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(row).toContainText("Checked in");
    await expect(
      page.getByRole("region", { name: "Visual day schedule" }),
    ).toContainText("Your day at a glance");
    await expect(
      page.locator(".agenda-visit").filter({ hasText: username }),
    ).toBeVisible();
    await page.screenshot({
      path: "../../docs/screenshots/doctor-agenda.png",
      fullPage: true,
    });
    await row.getByRole("button", { name: "Prepare visit" }).click();
    await page
      .getByLabel("History / subjective", { exact: true })
      .fill("Synthetic concern for continuity testing.");
    await page
      .getByLabel("Assessment", { exact: true })
      .fill("Synthetic assessment entered by the clinician.");
    await page
      .getByLabel("Plan & follow-up", { exact: true })
      .fill("Synthetic plan: review at next scheduled visit.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page.getByText("Unsaved changes", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Draft saved to this visit" }),
    ).toHaveCSS("opacity", "1");
    const visitAccessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(visitAccessibility.violations).toEqual([]);
    await page.screenshot({ path: "../../docs/screenshots/doctor-visit.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: "../../docs/screenshots/doctor-visit-mobile.png",
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Back to schedule" }).click();
    await page.reload();
    await row.getByRole("button", { name: "Prepare visit" }).click();
    await expect(page.getByLabel("Assessment", { exact: true })).toHaveValue(
      "Synthetic assessment entered by the clinician.",
    );
    await page
      .getByRole("button", { name: "Start visit", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: /I confirmed this patient/ })
      .check();
    await page
      .getByRole("button", { name: "File note & complete visit" })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Filed once to the patient’s timeline.",
    );
    await page.getByRole("button", { name: "Back to schedule" }).click();
    await expect(row).toContainText("Completed");
    const timeline = await (
      await p.get(`/api/patients/${patient.id}/timeline`)
    ).json();
    expect(
      timeline.filter((r: { kind: string }) => r.kind === "encounter"),
    ).toHaveLength(1);
    expect(timeline[0].details).toContain("Synthetic assessment");
    await page.getByRole("link", { name: "Health Passport home" }).click();
    await expect(
      page.getByRole("heading", { name: "Your day, with room for care." }),
    ).toBeVisible();
  } finally {
    await p.dispose();
  }
});

test("doctor entry, navigation and responsive accessibility", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Doctor / care team" }).click();
  await expect(
    page.getByRole("heading", { name: "Staff sign in" }),
  ).toBeVisible();
  await doctor(page);
  await page.getByRole("button", { name: "Patients", exact: true }).click();
  await page.getByRole("button", { name: "Appointments", exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Your patients" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Health Passport home" }).click();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole("heading", { name: "Your day, with room for care." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBeTruthy();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "../../docs/screenshots/doctor-today.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Patients", exact: true }).click();
  await page.screenshot({
    path: "../../docs/screenshots/doctor-patients.png",
    fullPage: true,
  });
});
