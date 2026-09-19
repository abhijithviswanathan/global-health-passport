/**
 * Browser regression for the public presentation. Start a static server first:
 * python3 -m http.server 5181 --bind 127.0.0.1 --directory docs
 * Then run: node scripts/tests/demo-ui.mjs
 * Uses the web app's existing Playwright dependency; no real login or API is used.
 * DEMO_BASE_URL can point at the deployed Pages URL. DEMO_SCREENSHOTS is optional.
 */
import {
  chromium,
  expect,
} from "../../apps/web/node_modules/@playwright/test/index.mjs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const browser = await chromium.launch({ headless: true });
const base = process.env.DEMO_BASE_URL || "http://127.0.0.1:5181/";
const output = process.env.DEMO_SCREENSHOTS;
if (output) await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 390, 360]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
    });
    const page = await context.newPage(),
      errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    page.on("request", (r) => requests.push(r.url()));
    const b = (name) => page.getByRole("button", { name, exact: true });
    const nav = (name) =>
      page.getByRole("navigation").getByRole("button", { name, exact: false });
    const selectRole = async (r) =>
      page.getByLabel("Demo perspective").selectOption(r);
    const next = async () => b("Continue story").click();
    const audit = async () => {
      const violations = await page.evaluate(async () =>
        (
          await axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      );
      expect(violations).toEqual([]);
    };
    const shot = async (name) => {
      await audit();
      if (output)
        await page.screenshot({
          path: path.join(output, `${name}-${width}.png`),
          fullPage: true,
          style: "#toast { visibility: hidden !important; }",
        });
    };
    const noOverflow = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    await page.goto(base);
    await page.addScriptTag({
      path: new URL(
        "../../apps/web/node_modules/axe-core/axe.min.js",
        import.meta.url,
      ).pathname,
    });
    await expect(
      page.getByRole("heading", { name: "A clearer day, Dr Smith." }),
    ).toBeVisible();
    await noOverflow();
    await shot("doctor-today");
    await b("Start guided story").click();
    await b("Request patient access").click();
    await expect(page.getByRole("status")).toContainText("Request delivered");
    await next();
    await expect(
      page.getByRole("heading", {
        name: "Dr Smith would like to access your care information",
      }),
    ).toBeVisible();
    await shot("patient-request");
    await b("Approve selected sharing").click();
    await expect(
      page.getByRole("heading", { name: "Active sharing with your care team" }),
    ).toBeVisible();
    await noOverflow();
    await next();
    await b("Create vitals request").click();
    await b("Send request to nurse").click();
    await next();
    let task = page
      .locator(".work-card")
      .filter({ hasText: "Alice Morgan" })
      .filter({ hasText: "Record pre-visit observations" });
    await expect(task).toContainText("Requested");
    await shot("nurse-queue");
    await noOverflow();
    await task
      .getByRole("button", { name: "Accept request", exact: true })
      .click();
    await task.getByRole("button", { name: "Start task", exact: true }).click();
    await task
      .getByRole("button", { name: "Review & file result", exact: true })
      .click();
    await b("Confirm & file sample result").click();
    await expect(task).toContainText("Completed");
    await next();
    await b("Review new prescription").click();
    await audit();
    await page.getByRole("checkbox").check();
    await b("Send sample prescription").click();
    await next();
    await expect(page.locator(".prescription")).toContainText("DemoCare A");
    await noOverflow();
    await shot("patient-prescription");
    await b("I have read the directions").click();
    await next();
    let rx = page.locator(".prescription").filter({ hasText: "Alice Morgan" });
    for (const name of [
      "Review prescription",
      "Mark ready for collection",
      "Record collection",
    ]) {
      await rx.getByRole("button", { name, exact: true }).click();
      await b("Confirm pharmacy update").click();
    }
    await expect(rx).toContainText("Collection recorded");
    await next();
    await b("Invite patient to follow-up").click();
    await next();
    await b("Confirm appointment").click();
    await expect(
      page.getByRole("heading", {
        name: "Story complete — the whole team is connected",
      }),
    ).toBeVisible();
    await b("See Alice’s timeline").click();
    await expect(page.locator(".care-timeline")).toContainText(
      "Nursing task completed",
    );
    await expect(page.locator(".care-timeline")).toContainText(
      "Follow-up confirmed",
    );
    // Messages stay in the same fictional record and arrive in the receiving inbox.
    await nav("Messages").click();
    await b("Send example question").click();
    await selectRole("doctor");
    await nav("Messages").click();
    await expect(page.locator(".conversation")).toContainText(
      "Can we discuss it at my follow-up?",
    );
    await b("Send example reply").click();
    await selectRole("patient");
    await nav("Inbox").click();
    await expect(page.locator(".notice-list")).toContainText(
      "New message from Dr Smith",
    );
    // An independent lab handoff ends in a reviewable result, not an automatic diagnosis.
    await selectRole("doctor");
    await nav("Care requests").click();
    await b("Create specimen request").click();
    await b("Send request to nurse").click();
    await selectRole("nurse");
    task = page
      .locator(".work-card")
      .filter({ hasText: "Alice Morgan" })
      .filter({ hasText: "Collect the requested blood sample" });
    await task
      .getByRole("button", { name: "Accept request", exact: true })
      .click();
    await task.getByRole("button", { name: "Start task", exact: true }).click();
    await task
      .getByRole("button", { name: "Review & file result", exact: true })
      .click();
    await b("Confirm & file sample result").click();
    await selectRole("lab");
    await b("Start processing").click();
    await b("Review & release sample report").click();
    await b("Confirm release").click();
    await selectRole("doctor");
    await nav("Reports").click();
    await b("Record my review").click();
    await selectRole("patient");
    await nav("My reports").click();
    await expect(page.locator(".report")).toHaveCount(2);
    await noOverflow();
    // New notifications are linked, marked read, and navigate to the intended feature.
    await nav("Inbox").click();
    await page
      .locator(".notice")
      .filter({ hasText: "Dr Smith reviewed your report" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your reports, in one place." }),
    ).toBeVisible();
    // Historical prescriptions remain with the patient after a sharing revocation.
    await nav("Requests & sharing").click();
    await b("Revoke sharing").click();
    await b("Confirm revoke").click();
    await selectRole("doctor");
    await nav("Patients").click();
    await expect(
      page.getByRole("heading", {
        name: "Let the patient decide what to share",
      }),
    ).toBeVisible();
    await b("Request patient access").click();
    await b("Explore patient response").click();
    await b("Decline request").click();
    await expect(
      page.getByText("No sharing is active", { exact: true }),
    ).toBeVisible();
    // Partial grants block unrelated views. Empty approval is rejected visibly.
    await selectRole("doctor");
    await nav("Patients").click();
    await b("Request patient access").click();
    await selectRole("patient");
    await nav("Requests & sharing").click();
    for (const checkbox of await page.getByRole("checkbox").all())
      await checkbox.uncheck();
    await b("Approve selected sharing").click();
    await expect(page.getByRole("status")).toContainText("Select at least one");
    await page.locator('input[value="care"]').check();
    await b("Approve selected sharing").click();
    await selectRole("doctor");
    await nav("Prescriptions").click();
    await expect(
      page.getByRole("heading", {
        name: "This information has not been shared",
      }),
    ).toBeVisible();
    // Compact back and logo navigation work on desktop and narrow layouts.
    await b("Go back").click();
    await b("Health Passport home").click();
    await expect(
      page.getByRole("heading", { name: "A clearer day, Dr Smith." }),
    ).toBeVisible();
    await b("Open demo menu").click();
    await page.keyboard.press("Escape");
    await expect(b("Open demo menu")).toBeFocused();
    await b("Open demo menu").click();
    await b("Restart with fresh examples").click();
    await b("Reset demo").click();
    await expect(b("Start guided story")).toBeVisible();
    await b("Start guided story").click();
    await expect(b("Request patient access")).toBeVisible();
    // Switching fictional patients must also change the timeline actor, not just its heading.
    await selectRole("patient");
    await page.locator("#patient-select").selectOption("1");
    await nav("Requests & sharing").click();
    await b("Approve selected sharing").click();
    await nav("My timeline").click();
    await expect(page.locator(".care-timeline")).toContainText("Noah Bennett");
    await page.reload();
    await expect(b("Start guided story")).toBeVisible();
    await noOverflow();
    // Public presentation loads static assets only and leaves no browser storage behind.
    expect(
      await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
      })),
    ).toEqual({ local: 0, session: 0 });
    expect(errors).toEqual([]);
    expect(requests.every((url) => url.startsWith(base))).toBe(true);
    console.log(
      `PASS ${width}px: full journey, lab, messages, inbox, decline/revoke/partial scopes, reset, layout, sampled WCAG scans; zero page errors.`,
    );
    await context.close();
  }
  // The static guide is also checked; lazy screenshot assets must load before publishing.
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    await page.goto(new URL("demo-guide.html", base).href);
    await page.addScriptTag({
      path: new URL(
        "../../apps/web/node_modules/axe-core/axe.min.js",
        import.meta.url,
      ).pathname,
    });
    for (const img of await page.locator("img").all()) {
      await img.scrollIntoViewIfNeeded();
      await expect
        .poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0))
        .toBe(true);
    }
    const violations = await page.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations.map((v) => v.id),
    );
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    console.log(
      `PASS guide ${width}px: images, layout and sampled accessibility.`,
    );
    await page.close();
  }
  const printPage = await browser.newPage();
  await printPage.goto(base);
  await printPage.getByLabel("Demo perspective").selectOption("pharmacy");
  await printPage
    .getByRole("button", { name: "Print sample", exact: true })
    .click();
  await printPage.emulateMedia({ media: "print" });
  await expect(printPage.locator("#app")).toBeHidden();
  await expect(printPage.locator("dialog .print-warning")).toBeVisible();
  await expect(
    printPage.getByRole("button", { name: "Print this fictional sample" }),
  ).toBeHidden();
  console.log("PASS print: application hidden, marked sample visible.");
} finally {
  await browser.close();
}
