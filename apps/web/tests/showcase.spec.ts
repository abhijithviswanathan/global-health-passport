import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
const env = Object.fromEntries(
  fs
    .readFileSync("../../.env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const manifest = JSON.parse(
  fs.readFileSync("../../docs/evidence/showcase-demo.json", "utf8"),
);
async function login(page: Page, username: string, native = false) {
  await page.goto(native ? "http://localhost:5174/" : "/");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
  await page
    .getByRole("button", {
      name: native ? "Sign in" : "Sign in securely",
      exact: true,
    })
    .click();
}
test("fictional doctor directory and request queue show all four stories", async ({
  page,
}) => {
  await login(page, "hospitaldoctor");
  await page.getByRole("button", { name: "Patients", exact: true }).click();
  for (const name of [
    "Alice Morgan",
    "Noah Bennett",
    "Fatima Rahman",
    "Leo Fernandes",
  ])
    await expect(page.locator(".patient-directory-list")).toContainText(name);
  await page.screenshot({
    path: "../../docs/images/showcase-patients-web.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Hospital workspace", exact: true })
    .first()
    .click();
  await page
    .locator(".eco-tabs")
    .getByRole("button", { name: "Orders", exact: true })
    .click();
  for (const name of [
    "Alice CBC report",
    "Alice chest report",
    "Noah wellness panel",
    "Leo left ankle request",
    "Fatima follow-up review",
  ])
    await expect(page.locator(".eco-grid")).toContainText(name);
  await page.screenshot({
    path: "../../docs/images/showcase-orders-web.png",
    fullPage: true,
  });
});
test("fictional nurse work grid presents varied tasks and ownership", async ({
  page,
}) => {
  await login(page, "hospitalnurse");
  await page
    .getByRole("button", { name: "Hospital workspace", exact: true })
    .first()
    .click();
  await page
    .locator(".eco-tabs")
    .getByRole("button", { name: "Work grid", exact: true })
    .click();
  for (const name of [
    "Alice · confirm report discussion",
    "Noah · specimen handoff",
    "Fatima · arrange follow-up",
    "Leo · coordinate imaging slot",
  ])
    await expect(page.locator(".eco-grid")).toContainText(name);
  await page.screenshot({
    path: "../../docs/images/showcase-nurse-web.png",
    fullPage: true,
  });
});
test("native patient reads the same completed reports and fictional insurance comparisons", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await login(page, "hospitalalice", true);
  await page.getByRole("tab", { name: "Timeline", exact: true }).click();
  const title = page.getByText(/Showcase.*Alice CBC report/).first();
  await expect(title).toBeVisible();
  await title.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../../docs/images/showcase-native-timeline.png",
    fullPage: true,
  });
  const rows = await (
    await page.request.get(
      "http://localhost:5174/api/patients/" +
        manifest.patients.hospitalalice.id +
        "/timeline",
    )
  ).json();
  for (const key of ["alice-cbc", "alice-xray"])
    expect(
      rows.some((r: { id: string }) => r.id === manifest.orders[key].result_id),
    ).toBeTruthy();
  await page.getByRole("tab", { name: "Connections", exact: true }).click();
  await page.getByRole("button", { name: "Marketplace", exact: true }).click();
  await expect(
    page.getByText("Showcase · Harbor Starter", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../../docs/images/showcase-native-marketplace.png",
    fullPage: true,
  });
});
test("native nurse sees the same fictional work grid", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await login(page, "hospitalnurse", true);
  await page
    .getByRole("button", { name: "Hospital workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Work grid", exact: true }).click();
  for (const name of [
    "Showcase · Alice · confirm report discussion",
    "Showcase · Noah · specimen handoff",
    "Showcase · Fatima · arrange follow-up",
    "Showcase · Leo · coordinate imaging slot",
  ])
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page
    .getByText("Showcase · Leo · coordinate imaging slot", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../../docs/images/showcase-native-nurse.png",
    fullPage: true,
  });
});
