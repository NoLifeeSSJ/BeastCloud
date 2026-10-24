import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const password = "a browser fixture password";
test.beforeAll(async ({ request }) => {
  const root = readFileSync(resolve("../../.local/browser/root.txt"), "utf8");
  const key = readFileSync(root + "/config/setup.key", "utf8");
  const r = await request.post("/api/setup", {
    data: { key, name: "Alex", password, timezone: "UTC" },
  });
  expect(r.ok()).toBeTruthy();
});
async function login(page: any) {
  await page.goto("/");
  await page.getByLabel("Account name").fill("Alex");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Unlock BeastCloud" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome home, Alex." }),
  ).toBeVisible();
}
test("desktop real workflows use only local assets", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5090") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.screenshot({
    path: "../../test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .locator("nav")
    .getByRole("button", { name: "Files", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "browser-test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("My local browser file"),
    });
  await expect(page.getByText("Committed", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "browser-test.txt", exact: true })
    .click();
  await expect(
    page.getByText("My local browser file", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Notes", exact: true })
    .click();
  await page.getByRole("button", { name: "New note" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Browser note");
  await page.getByLabel("Markdown", { exact: true }).fill("Autosaved locally.");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser note", exact: true }),
  ).toBeVisible();
  for (const name of [
    "Tasks",
    "Calendar",
    "Shared items",
    "Devices",
    "Backups",
    "Activity",
    "Settings",
  ]) {
    await page
      .locator("nav")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test("mobile navigation and light theme fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.screenshot({
    path: "../../test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  for (const name of [
    "Files",
    "Photos",
    "Notes",
    "Tasks",
    "Calendar",
    "Devices",
    "Backups",
    "Settings",
  ]) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .locator("nav")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: "../../test-results/settings-mobile.png",
    fullPage: true,
  });
});
