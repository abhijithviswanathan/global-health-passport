import { test, expect } from "../../web/node_modules/@playwright/test";
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
test("native hospital nurse uses structured nursing and work grid with shared persisted data", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("hospitalnurse");
  await page.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Hospital workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Work grid", exact: true }).click();
  await expect(
    page.getByText("Alice · intake and handoff", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nursing", exact: true }).click();
  await page
    .getByRole("button", { name: "Document nursing care", exact: true })
    .click();
  await expect(
    page.getByLabel("Observation and context", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: path.join(root, "docs/images/ecosystem-native-nursing.png"),
    fullPage: true,
  });
});
test("native patient can read web-created insurance profiles and approved marketplace plans", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("hospitalalice");
  await page.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("tab", { name: "Connections", exact: true }).click();
  await expect(
    page.getByText("Synthetic Example Insurance", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Marketplace", exact: true }).click();
  await expect(
    page.getByText("Synthetic Clear Plan", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(root, "docs/images/ecosystem-native-marketplace.png"),
    fullPage: true,
  });
});
