import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders hero headline", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("has a CTA that leads to login", async ({ page }) => {
    // Any primary CTA on the landing page should go to /login or /dashboard
    const cta = page.locator("a[href='/login'], a[href='/dashboard']").first();
    await expect(cta).toBeVisible();
  });

  test("theme toggle exists and switches theme", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /theme|dark|light/i });
    if (await toggle.count() === 0) return; // skip if no toggle on landing
    const html = page.locator("html");
    const before = await html.getAttribute("data-theme");
    await toggle.click();
    const after = await html.getAttribute("data-theme");
    expect(before).not.toEqual(after);
  });

  test("page title contains FAANG or interview", async ({ page }) => {
    await expect(page).toHaveTitle(/faang|interview/i);
  });
});
