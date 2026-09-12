import {
  test,
  expect,
  request as contexts,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(__dirname, "../../..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
async function post(api: any, url: string, data: any, method = "POST") {
  const csrf = await (await api.get("/api/csrf")).json();
  const r = await api.fetch("/api" + url, {
    method,
    data,
    headers: { [csrf.headerName]: csrf.token },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function login(page: Page, username: string) {
  await page.goto("/");
  if (username === "doctor")
    await page.getByRole("tab", { name: "Doctor", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("tab", {
      name: username === "doctor" ? "Today" : "Overview",
      exact: true,
    })
    .waitFor();
}
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
test("mobile clinician booking, cross-client draft conflict and filing", async ({
  page,
  browser,
}) => {
  page.on("dialog", (d) => d.accept());
  const patient = await contexts.newContext({
    baseURL: "http://localhost:5174",
  });
  const webDoctor = await contexts.newContext({
    baseURL: "http://localhost:5174",
  });
  try {
    await post(patient, "/auth/login", {
      username: "patient",
      password: env.DEMO_PASSWORD,
    });
    const p = await (await patient.get("/api/me")).json();
    await post(webDoctor, "/auth/login", {
      username: "doctor",
      password: env.DEMO_PASSWORD,
    });
    const d = await (await webDoctor.get("/api/me")).json();
    await post(patient, "/consents", {
      patientId: p.id,
      granteeId: d.id,
      scopes: [
        "encounter",
        "allergy",
        "condition",
        "medication",
        "prescription",
        "lab_result",
        "document",
      ],
      purpose: "treatment",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await login(page, "doctor");
    await expect(
      page.getByRole("heading", { name: "Your day, with room for care." }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Patients", exact: true }).click();
    await page
      .getByLabel("Search patients by name or Health ID")
      .fill(p.healthId);
    const backBox = await button(page, "Back").boundingBox();
    expect(backBox?.width).toBeLessThan(110);
    await page.screenshot({
      path: path.join(
        root,
        "docs/screenshots/native-doctor-patients-browser.png",
      ),
    });
    await button(page, "Open chart").click();
    await expect(page.getByText(p.healthId, { exact: true })).toBeVisible();
    await button(page, "Back").click();
    await button(page, "Book visit").click();
    const at = new Date();
    at.setDate(at.getDate() + 60 + Math.floor(Math.random() * 20));
    at.setHours(
      8 + Math.floor(Math.random() * 9),
      Math.floor(Math.random() * 4) * 15,
      0,
      0,
    );
    const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
    const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    const reason = "Mobile continuity " + Date.now();
    await page.getByLabel("Appointment date (YYYY-MM-DD)").fill(day);
    await page.getByLabel("Appointment time (HH:MM, 24-hour)").fill(time);
    await page.getByLabel("Visit reason").fill(reason);
    await button(page, "Confirm booking").click();
    await expect(
      page.getByText("Appointment saved.", { exact: false }),
    ).toBeVisible();
    const next = new Date(at);
    next.setHours(0, 0, 0, 0);
    const end = new Date(next);
    end.setDate(end.getDate() + 1);
    const all = await (
      await webDoctor.get(
        `/api/clinician/appointments?from=${next.toISOString()}&to=${end.toISOString()}`,
      )
    ).json();
    const a = all.find((a: any) => a.reason === reason);
    expect(a).toBeTruthy();
    await page
      .getByTestId(a.id)
      .getByRole("button", { name: "More options", exact: true })
      .click();
    await page
      .getByTestId(a.id)
      .getByRole("button", { name: "Reschedule", exact: true })
      .click();
    at.setMinutes(at.getMinutes() + 15);
    const revisedTime = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    await page
      .getByLabel("Appointment time (HH:MM, 24-hour)")
      .fill(revisedTime);
    await button(page, "Save new time").click();
    await page
      .getByTestId(a.id)
      .getByRole("button", { name: "Check in", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your day at a glance", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("heading", { name: "Your day at a glance", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(
        root,
        "docs/screenshots/native-doctor-agenda-browser.png",
      ),
    });
    await page
      .getByTestId(a.id)
      .getByRole("button", { name: "Prepare visit", exact: true })
      .click();
    await page
      .getByLabel("Assessment", { exact: true })
      .fill("Synthetic mobile assessment");
    await page
      .getByLabel("Plan & follow-up", { exact: true })
      .fill("Synthetic follow-up plan");
    await button(page, "Save draft").click();
    await expect(
      page.getByText("Draft saved. You can continue it on web or mobile."),
    ).toBeVisible();
    const saved = await (
      await webDoctor.get(`/api/clinician/appointments/${a.id}/draft`)
    ).json();
    expect(saved.assessment).toBe("Synthetic mobile assessment");
    const web = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      await web.goto("http://localhost:5173/?portal=doctor");
      await web.getByLabel("Username", { exact: true }).fill("doctor");
      await web.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
      await web
        .getByRole("button", { name: "Sign in securely", exact: true })
        .click();
      await web
        .getByRole("button", { name: "Appointments", exact: true })
        .click();
      await web.getByLabel("Schedule date").fill(day);
      await web
        .locator(".schedule-row")
        .filter({ hasText: reason })
        .getByRole("button", { name: "Prepare visit", exact: true })
        .click();
      await expect(web.getByLabel("Assessment", { exact: true })).toHaveValue(
        "Synthetic mobile assessment",
      );
      await web
        .getByLabel("Assessment", { exact: true })
        .fill("Synthetic web clinician update");
      await web
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await expect(
        web.getByText("Unsaved changes", { exact: true }),
      ).toHaveCount(0);
    } finally {
      await web.close();
    }
    await page
      .getByLabel("Assessment", { exact: true })
      .fill("Unsaved stale mobile edit");
    await button(page, "Save draft").click();
    await expect(page.getByRole("alert")).toContainText(
      /changed|another|reload|refresh/i,
    );
    await button(page, "Reload visit").click();
    await expect(page.getByLabel("Assessment", { exact: true })).toHaveValue(
      "Synthetic web clinician update",
    );
    await page
      .getByLabel("Assessment", { exact: true })
      .fill("Unsaved guard check");
    await button(page, "Back").click();
    await page
      .getByTestId(a.id)
      .getByRole("button", { name: "Prepare visit", exact: true })
      .click();
    await expect(page.getByLabel("Assessment", { exact: true })).toHaveValue(
      "Synthetic web clinician update",
    );
    await button(page, "Start visit").click();
    await page
      .getByRole("switch", { name: "Confirm patient and reviewed note" })
      .check();
    await button(page, "File note & complete visit").click();
    await expect(
      page
        .getByText("Filed once to the patient timeline. Visit complete.")
        .first(),
    ).toBeVisible();
    const ended = await (
      await webDoctor.get(`/api/clinician/appointments/${a.id}`)
    ).json();
    expect(ended.status).toBe("completed");
    const timeline = await (
      await patient.get(`/api/patients/${p.id}/timeline`)
    ).json();
    expect(
      timeline.filter((r: any) => r.id === ended.completed_record_id),
    ).toHaveLength(1);
    await page.screenshot({
      path: path.join(root, "docs/screenshots/native-doctor-visit-browser.png"),
    });
    await button(page, "Health Passport home").click();
    await expect(
      page.getByRole("heading", { name: "Your day, with room for care." }),
    ).toBeVisible();
    for (const width of [390, 320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBeTruthy();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(result.violations).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(root, "docs/screenshots/native-doctor-today-browser.png"),
    });
  } finally {
    await patient.dispose();
    await webDoctor.dispose();
  }
});
test("mobile patient navigation, short ID and doctor entry are preserved", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Doctor", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Doctor sign in" }),
  ).toBeVisible();
  await expect(button(page, "Create patient account")).toHaveCount(0);
  await login(page, "patient");
  const me = await (await page.request.get("/api/me")).json();
  expect(me.healthId).toMatch(/^[A-Z0-9]{9}$/);
  await expect(page.getByText(me.healthId, { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Timeline", exact: true }).click();
  await page.getByRole("tab", { name: "Medicines", exact: true }).click();
  await button(page, "Back").click();
  await expect(
    page.getByRole("heading", { name: "Timeline", exact: true }),
  ).toBeVisible();
  await button(page, "Health Passport home").click();
  await expect(page.getByText(me.healthId, { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.join(root, "docs/screenshots/native-patient-browser.png"),
  });
});
test("revoked permission removes a mobile chart and prevents reopening it", async ({
  page,
}) => {
  const patient = await contexts.newContext({
    baseURL: "http://localhost:5174",
  });
  const doctor = await contexts.newContext({
    baseURL: "http://localhost:5174",
  });
  const username = "mob" + Date.now();
  const password = env.DEMO_PASSWORD;
  try {
    await post(patient, "/auth/register", {
      username,
      displayName: "Synthetic mobile permission test",
      password,
    });
    await post(patient, "/auth/login", { username, password });
    const p = await (await patient.get("/api/me")).json();
    await post(doctor, "/auth/login", { username: "doctor", password });
    const d = await (await doctor.get("/api/me")).json();
    const grant = await post(patient, "/consents", {
      patientId: p.id,
      granteeId: d.id,
      scopes: ["encounter", "note"],
      purpose: "treatment",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await login(page, "doctor");
    await page.getByRole("tab", { name: "Patients", exact: true }).click();
    await page
      .getByLabel("Search patients by name or Health ID")
      .fill(p.healthId);
    await button(page, "Open chart").click();
    await expect(page.getByText(p.healthId, { exact: true })).toBeVisible();
    await post(patient, `/consents/${grant.id}/revoke`, {});
    await button(page, "Refresh").click();
    await expect(
      page.getByRole("heading", { name: "Patients", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(p.healthId, { exact: true })).toHaveCount(0);
    await expect(button(page, "Open chart")).toHaveCount(0);
  } finally {
    await patient.dispose();
    await doctor.dispose();
  }
});
