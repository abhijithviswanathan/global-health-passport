import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root = path.resolve("../..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const portrait = path.join(root, "docs/images/synthetic-profile-example.png");
async function post(api: APIRequestContext, url: string, data: unknown) {
  const csrf = await (await api.get("/api/csrf")).json();
  const r = await api.post("/api" + url, {
    data,
    headers: { [csrf.headerName]: csrf.token },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function webLogin(page: Page, username: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await page.getByRole("button", { name: "Open account menu" }).waitFor();
}
async function webProfile(page: Page) {
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Profile & photo" }).click();
  await page.getByText("Who can see your photo?", { exact: true }).waitFor();
}
async function mobileProfile(page: Page) {
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page
    .getByRole("button", { name: "Profile & photo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close menu", exact: true }),
  ).toHaveCount(0);
  await page.getByText("Who can see your photo?", { exact: true }).waitFor();
}

test("onboarding, cross-client photo privacy and private clinical holder workflow", async ({
  page,
  browser,
}) => {
  const username =
      "photo" + crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    password = "synthetic-photo-password-483!";
  const mobileContext = await browser.newContext({
    baseURL: "http://localhost:5174",
    viewport: { width: 390, height: 844 },
  });
  const doctorContext = await browser.newContext({
    baseURL: "http://localhost:5173",
    viewport: { width: 1440, height: 1000 },
  });
  const mobile = await mobileContext.newPage(),
    doctor = await doctorContext.newPage();
  try {
    // A controlled browser video source exercises capture without claiming hardware-camera verification.
    await page.addInitScript(
      (portraitUri) => {
        navigator.mediaDevices.getUserMedia = async () => {
          const img = new Image();
          img.src = portraitUri;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 512;
          canvas.getContext("2d")!.drawImage(img, 0, 0, 512, 512);
          const stream = canvas.captureStream(5);
          const draw = () => {
            if (stream.getTracks().every((t) => t.readyState === "ended"))
              return;
            canvas.getContext("2d")!.drawImage(img, 0, 0, 512, 512);
            requestAnimationFrame(draw);
          };
          requestAnimationFrame(draw);
          (
            window as unknown as { photoTestStream: MediaStream }
          ).photoTestStream = stream;
          return stream;
        };
      },
      "data:image/png;base64," + fs.readFileSync(portrait, "base64"),
    );
    await page.goto("/");
    await page
      .getByRole("button", { name: "Create a synthetic account" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Username", { exact: true }).fill(username);
    await dialog
      .getByLabel("Display name (synthetic)", { exact: true })
      .fill("Jordan Ellis");
    await dialog.getByLabel("Password", { exact: true }).fill(password);
    await dialog
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      dialog.getByText("Add a profile photo (optional)", { exact: true }),
    ).toBeVisible();
    await dialog.getByLabel("Upload profile photo").setInputFiles(portrait);
    await expect(
      dialog.getByText("Photo saved locally. Face presence checked.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(root, "docs/screenshots/photo-onboarding-web.png"),
    });
    await dialog.getByRole("button", { name: "Return to sign in" }).click();
    await webLogin(page, username, password);
    await webProfile(page);
    const beforeCapture = await (await page.request.get("/api/profile")).json();
    await page.getByRole("button", { name: "Take photo", exact: true }).click();
    await expect
      .poll(() =>
        page.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth),
      )
      .toBe(512);
    await page
      .getByRole("button", { name: "Use this photo", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/profile")).json()).photo.id,
      )
      .not.toBe(beforeCapture.photo.id);
    expect(
      await page.evaluate(() =>
        (window as unknown as { photoTestStream: MediaStream }).photoTestStream
          .getTracks()
          .every((t) => t.readyState === "ended"),
      ),
    ).toBeTruthy();
    const p = await (await page.request.get("/api/me")).json();
    const self = await (await page.request.get("/api/profile")).json();
    expect(self.visibility).toBe("none");
    expect(self.photo.id).toBeTruthy();
    await expect(
      page.locator(".profile-panel .profile-avatar img"),
    ).toBeVisible();
    await page.getByLabel("Profile visibility").selectOption("selected");
    await page.getByLabel("Selected account usernames").fill("doctor");
    await page
      .getByRole("button", { name: "Save visibility", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Profile visibility saved" }),
    ).toBeVisible();
    await webLogin(doctor, "doctor", env.DEMO_PASSWORD);
    const d = await (await doctor.request.get("/api/me")).json();
    expect(
      (await doctor.request.get("/api/photos/" + self.photo.id)).ok(),
    ).toBeTruthy();
    await page.screenshot({
      path: path.join(root, "docs/screenshots/photo-profile-web.png"),
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mobile.goto("/");
    await mobile.getByLabel("Username", { exact: true }).fill(username);
    await mobile.getByLabel("Password", { exact: true }).fill(password);
    await mobile.getByRole("button", { name: "Sign in", exact: true }).click();
    await mobile.getByRole("tab", { name: "Overview", exact: true }).waitFor();
    await mobileProfile(mobile);
    await expect(
      mobile.getByRole("radio", { name: /Selected people/ }),
    ).toBeChecked();
    await expect(mobile.getByLabel("Selected account usernames")).toHaveValue(
      "doctor",
    );
    await mobile.getByRole("radio", { name: /Nobody/ }).click();
    await mobile
      .getByRole("button", { name: "Save visibility", exact: true })
      .click();
    await expect(
      mobile.getByText("Photo visibility saved. Medical sharing is separate.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await doctor.request.get("/api/photos/" + self.photo.id)).status(),
    ).toBe(404);
    const chooser = mobile.waitForEvent("filechooser");
    await mobile
      .getByRole("button", { name: "Choose photo", exact: true })
      .click();
    await (await chooser).setFiles(portrait);
    await expect
      .poll(
        async () =>
          (await (await mobile.request.get("/api/profile")).json()).photo.id,
      )
      .not.toBe(self.photo.id);
    await expect(
      mobile.getByRole("img", { name: "Your profile photo", exact: true }),
    ).toBeVisible();
    await mobile.screenshot({
      path: path.join(root, "docs/screenshots/photo-profile-mobile.png"),
    });
    expect(
      (await new AxeBuilder({ page: mobile }).analyze()).violations.filter(
        (v) => ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await post(page.request, "/consents", {
      patientId: p.id,
      granteeId: d.id,
      purpose: "treatment",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      scopes: ["document", "encounter"],
    });
    await doctor.reload();
    await doctor.getByRole("button", { name: "Patients", exact: true }).click();
    await doctor
      .getByLabel("Search patients", { exact: true })
      .fill(p.healthId);
    await doctor
      .getByRole("button", { name: "Open chart", exact: true })
      .click();
    await doctor.locator(".clinical-photo-disclosure summary").click();
    await doctor
      .getByLabel("Identification photo purpose")
      .fill("Identification at the clinic reception");
    await doctor
      .getByLabel("Clinical photo holder")
      .selectOption("organization");
    await doctor.getByRole("checkbox").filter({ visible: true }).check();
    await doctor.getByLabel("Upload profile photo").setInputFiles(portrait);
    await expect(
      doctor.getByRole("img", {
        name: "Clinical identification reference",
        exact: true,
      }),
    ).toBeVisible();
    const held = await (
      await doctor.request.get(`/api/patients/${p.id}/identification-photos`)
    ).json();
    expect(held).toHaveLength(1);
    expect((await page.request.get("/api/photos/" + held[0].id)).status()).toBe(
      404,
    );
    await doctor.screenshot({
      path: path.join(root, "docs/screenshots/photo-clinical-web.png"),
      fullPage: true,
    });
    await mobile.getByRole("button", { name: "Health Passport home" }).click();
    await mobileProfile(mobile);
    await expect(
      mobile.getByText("Identification at the clinic reception", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      mobile.getByRole("img", { name: "Clinical identification reference" }),
    ).toHaveCount(0);
    await mobile
      .getByText("Clinical photos held for you")
      .scrollIntoViewIfNeeded();
    await mobile.screenshot({
      path: path.join(root, "docs/screenshots/photo-holder-mobile.png"),
    });
    await page.reload();
    await webProfile(page);
    await expect(
      page.getByText("Identification at the clinic reception", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Clinical identification reference" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.screenshot({
      path: path.join(root, "docs/screenshots/account-menu-web.png"),
    });
    await page.keyboard.press("Escape");
    const mobileDoctor = await doctorContext.newPage();
    await mobileDoctor.goto("http://localhost:5174/");
    await mobileDoctor
      .getByRole("tab", { name: "Doctor", exact: true })
      .click();
    await mobileDoctor.getByLabel("Username", { exact: true }).fill("doctor");
    await mobileDoctor
      .getByLabel("Password", { exact: true })
      .fill(env.DEMO_PASSWORD);
    await mobileDoctor
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await mobileDoctor
      .getByRole("tab", { name: "Today", exact: true })
      .waitFor();
    await mobileDoctor
      .getByRole("tab", { name: "Patients", exact: true })
      .click();
    await mobileDoctor
      .getByLabel("Search patients by name or Health ID")
      .fill(p.healthId);
    await mobileDoctor
      .getByRole("button", { name: "Open chart", exact: true })
      .click();
    await mobileDoctor
      .getByRole("button", { name: /Identification photos/ })
      .click();
    await expect(
      mobileDoctor.getByRole("img", {
        name: "Clinical identification reference",
      }),
    ).toBeVisible();
    mobileDoctor.on("dialog", (d) => d.accept());
    await mobileDoctor
      .getByRole("button", { name: "Remove identification photo" })
      .click();
    await expect(
      mobileDoctor.getByRole("img", {
        name: "Clinical identification reference",
      }),
    ).toHaveCount(0);
    expect(
      (await doctor.request.get("/api/photos/" + held[0].id)).status(),
    ).toBe(404);
    await mobileDoctor.close();
  } finally {
    await mobileContext.close();
    await doctorContext.close();
  }
});

test("mobile registration can skip its optional photo and add one through Settings", async ({
  browser,
}) => {
  const context = await browser.newContext({
      baseURL: "http://localhost:5174",
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  const username = "mph" + crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    password = "synthetic-mobile-photo-483!";
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Create patient account", exact: true })
      .click();
    await page.getByLabel("Your name", { exact: true }).fill("Morgan Lane");
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByText("Add a profile photo", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(root, "docs/screenshots/photo-onboarding-mobile.png"),
    });
    await page
      .getByRole("button", { name: "Skip for now", exact: true })
      .click();
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("tab", { name: "Overview", exact: true }).waitFor();
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Manage profile photo", exact: true })
      .click();
    await expect(
      page.getByText("Who can see your photo?", { exact: true }),
    ).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Take photo", exact: true }).click();
    await (await chooser).setFiles(portrait);
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/profile")).json()).photo?.id,
      )
      .toBeTruthy();
    await expect(
      page.getByRole("img", { name: "Your profile photo", exact: true }),
    ).toBeVisible();
    await page.getByRole("radio", { name: /Public/ }).click();
    await page
      .getByRole("button", { name: "Save visibility", exact: true })
      .click();
    await expect(
      page.getByText("Photo visibility saved. Medical sharing is separate."),
    ).toBeVisible();
    const profile = await (await page.request.get("/api/profile")).json();
    expect(profile.visibility).toBe("signed_in");
    page.on("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Remove profile photo", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/profile")).json()).photo,
      )
      .toBeNull();
    await page.getByRole("button", { name: "Open account menu" }).click();
    await expect(
      page.getByRole("button", { name: "Close menu", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Account menu" }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: path.join(root, "docs/screenshots/account-menu-mobile.png"),
    });
  } finally {
    await context.close();
  }
});
