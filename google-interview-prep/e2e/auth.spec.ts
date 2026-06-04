import { test, expect } from "@playwright/test";

test.describe("Auth guards", () => {
  test("dashboard redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("interview page redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/interview");
    await expect(page).toHaveURL(/\/login/);
  });

  test("feedback page redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/interview/feedback");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("shows Google sign-in button", async ({ page }) => {
    const btn = page.getByRole("button", { name: /google/i });
    await expect(btn).toBeVisible();
  });

  test("has no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });
});
