import { test, expect, type Page } from "@playwright/test";
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
  fs.readFileSync("../../docs/evidence/ecosystem-demo.json", "utf8"),
);
async function login(page: Page, user: string) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(user);
  await page.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hospital workspace", exact: true })
    .first()
    .click();
  await expect(page.locator(".eco-space")).toBeVisible();
  await expect(page.locator(".eco-space")).not.toContainText("Work ID loading");
}
test("hospital admin manages hierarchy with responsive accessible organization workspace", async ({
  page,
}) => {
  await login(page, "hospitaladmin");
  await page
    .locator(".eco-tabs")
    .getByRole("button", { name: "Organization", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add organization detail", exact: true })
    .click();
  const form = page.locator(".eco-form");
  await form.getByLabel("Item type", { exact: true }).selectOption("unit");
  const name = "Browser unit " + Date.now();
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form
    .getByLabel("Configuration details", { exact: true })
    .fill("Synthetic browser verified care unit");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page
    .locator(".eco-tabs")
    .getByRole("button", { name: "Workforce", exact: true })
    .click();
  await expect(page.locator(".eco-grid")).toContainText("Dr Smith");
  const a11y = await new AxeBuilder({ page }).include(".eco-space").analyze();
  expect(
    a11y.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "../../docs/images/ecosystem-workforce-web.png",
    fullPage: true,
  });
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: "../../docs/images/ecosystem-workforce-phone.png",
    fullPage: true,
  });
});
test("patient insurance and published booking screens persist through shared APIs", async ({
  page,
}) => {
  await login(page, "hospitalalice");
  await expect(page.locator(".eco-grid")).toContainText(
    "Synthetic Example Insurance",
  );
  await page
    .getByRole("button", { name: "Add insurance", exact: true })
    .click();
  const form = page.locator(".eco-form");
  const company = "Synthetic browser insurer " + Date.now();
  await form.getByLabel("Insurance company", { exact: true }).fill(company);
  await form
    .getByLabel("Plan name", { exact: true })
    .fill("Synthetic browser plan");
  await form
    .getByLabel("Member ID", { exact: true })
    .fill("SYNTHETIC-PRIVATE-MEMBER");
  await form
    .getByLabel("Policyholder", { exact: true })
    .fill("Synthetic Alice");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".eco-grid")).toContainText(company);
  const profiles = await (
    await page.request.get("/api/insurance/profiles")
  ).json();
  expect(profiles.some((p: {company:string}) => p.company === company)).toBeTruthy();
  expect(JSON.stringify(profiles)).not.toContain("SYNTHETIC-PRIVATE-MEMBER");
  await page
    .locator(".eco-tabs")
    .getByRole("button", { name: "Book appointment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Find public appointment times", exact: true })
    .click();
  await form
    .getByLabel("Hospital or clinic", { exact: true })
    .selectOption(demo.organization.id);
  await form
    .getByLabel("Date (YYYY-MM-DD)", { exact: true })
    .fill(new Date(demo.appointment.starts_at).toISOString().slice(0, 10));
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".eco-notice")).toContainText(
    /Choose an appointment time|No public slots/,
  );
  await page
    .locator(".eco-tabs")
    .getByRole("button", { name: "Marketplace", exact: true })
    .click();
  await expect(page.locator(".eco-grid")).toContainText("Synthetic Clear Plan");
  await page.screenshot({
    path: "../../docs/images/ecosystem-insurance-web.png",
    fullPage: true,
  });
});
test("nurse work grid and laboratory orders use different scoped workspaces", async ({
  page,
}) => {
  await login(page, "hospitalnurse");
  await page
    .locator(".eco-tabs")
    .getByRole("button", { name: "Work grid", exact: true })
    .click();
  await expect(page.locator(".eco-grid")).toContainText(
    "Alice · intake and handoff",
  );
  await page.screenshot({
    path: "../../docs/images/ecosystem-nurse-grid.png",
    fullPage: true,
  });
  expect(
    (await page.request.post("/api/ecosystem/orders", { data: {} })).status(),
  ).toBe(403);
});
