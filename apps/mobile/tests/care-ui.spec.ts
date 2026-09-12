import {
  test,
  expect,
  request as contexts,
} from "../../web/node_modules/@playwright/test";
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
const demo = JSON.parse(
  fs.readFileSync(path.join(root, "docs/evidence/care-demo.json"), "utf8"),
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
test("mobile nurse acknowledges and completes a doctor-assigned task across clients", async ({
  page,
}) => {
  const doctor = await contexts.newContext({
    baseURL: "http://localhost:5174",
  });
  await post(doctor, "/auth/login", {
    username: "doctor",
    password: env.DEMO_PASSWORD,
  });
  const title = "Mobile verified task " + Date.now();
  const t = await post(doctor, "/care/tasks", {
    patientId: demo.patient.id,
    scope: "nursing_observation",
    assigneeId: demo.staff.nurse.id,
    title,
    details: "Synthetic mobile care coordination test",
    priority: "routine",
    requestKey: crypto.randomUUID(),
  });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("nurse");
  await page.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("nurse workspace", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button").filter({ hasText: title }).click();
  for (const [label, status] of [
    ["Accept task", "accepted"],
    ["Update task", "in_progress"],
    ["Update task", "completed"],
  ]) {
    await page
      .getByRole("button", { name: label, exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: status.replaceAll("_", " "), exact: true })
      .click();
    await page
      .getByLabel("Acknowledgment or progress", { exact: true })
      .fill("Synthetic mobile progress recorded");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("Saved on the server.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button").filter({ hasText: title }).click();
  }
  expect(
    (await (await doctor.get(`/api/care/tasks/${t.id}`)).json()).task.status,
  ).toBe("completed");
  const completed = page.getByText(/Task completed · Due/);
  await expect(completed).toBeVisible();
  await completed.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(root, "docs/images/care-mobile-task.png"),
    fullPage: true,
  });
  await doctor.dispose();
});
test("mobile clinician sees nurse provenance and historical labels", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("doctor");
  await page.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Care team workspace", exact: true })
    .click();
  await page.getByRole("button").filter({ hasText: "Casey Rivera" }).click();
  await page
    .getByRole("button")
    .filter({ hasText: "Previous intake vitals" })
    .click();
  await expect(page.getByText(/Role: nurse/)).toBeVisible();
  await expect(
    page.getByText("Historical data", { exact: true }).last(),
  ).toBeVisible();
  await page.getByText(/Role: nurse/).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(root, "docs/images/care-mobile-provenance.png"),
    fullPage: true,
  });
});
