import { test, expect, request as contexts, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
const env = Object.fromEntries(
  fs
    .readFileSync("../../.env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const demo = JSON.parse(
  fs.readFileSync("../../docs/evidence/care-demo.json", "utf8"),
);
async function login(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `${name} workspace`, exact: true }),
  ).toBeVisible();
}
test("nurse enters dated vital values and doctor sees authorship, history, and freshness", async ({
  page,
}) => {
  await login(page, "nurse");
  await page.getByRole("button", { name: /Casey Rivera/ }).click();
  await page
    .getByRole("button", { name: "Add patient record", exact: true })
    .click();
  const form = page.locator(".care-form");
  await form.getByLabel("Record type", { exact: true }).selectOption("vital");
  const title = "Browser verified intake " + Date.now();
  await form.getByLabel("Title", { exact: true }).fill(title);
  await form
    .getByLabel("Observation, history or note", { exact: true })
    .fill("Synthetic browser test observation");
  await form.getByLabel(/When observed/).fill("2026-09-01T10:30:00-04:00");
  await form.getByLabel(/Timezone name/).fill("America/New_York");
  await form
    .getByLabel("Source type", { exact: true })
    .selectOption("nurse_observation");
  await form
    .getByLabel("Source details (optional)", { exact: true })
    .fill("Synthetic direct intake");
  await form.getByLabel("pulse bpm (optional)", { exact: true }).fill("74");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved successfully" }),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.locator(".care-detail")).toContainText("Role: nurse");
  await expect(page.locator(".care-detail")).toContainText("2026-09-01T10:30");
  await expect(page.locator(".care-detail")).toContainText("Historical data");
  await page
    .getByRole("button", { name: "View change history", exact: true })
    .click();
  await expect(page.locator(".care-history")).toContainText("created");
  await page.screenshot({
    path: "../../docs/images/care-nurse-web.png",
    fullPage: true,
  });
  const a11y = await new AxeBuilder({ page }).include(".care-space").analyze();
  expect(
    a11y.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  const doc = await contexts.newContext({ baseURL: "http://localhost:5173" });
  const csrf = await (await doc.get("/api/csrf")).json();
  await doc.post("/api/auth/login", {
    data: { username: "doctor", password: env.DEMO_PASSWORD },
    headers: { [csrf.headerName]: csrf.token },
  });
  const timeline = await (
    await doc.get(`/api/care/patients/${demo.patient.id}/timeline`)
  ).json();
  expect(
    timeline.find(
      (r: { title: string; author_role: string }) => r.title === title,
    ).author_role,
  ).toBe("nurse");
  await doc.dispose();
});
test("reception sees scheduling workspace without broad clinical records", async ({
  page,
}) => {
  await login(page, "reception");
  await page.getByRole("button", { name: /Casey Rivera/ }).click();
  await expect(
    page.getByText(
      "No clinical entries are available within your permissions.",
    ),
  ).toBeVisible();
  expect(
    (
      await page.request.get(`/api/patients/${demo.patient.id}/timeline`)
    ).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Book appointment", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "../../docs/images/care-reception-mobile-web.png",
    fullPage: true,
  });
});
