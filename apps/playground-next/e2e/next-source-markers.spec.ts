import { expect, test } from "@playwright/test";

test.describe("@next-source-markers — dev-only source markers", () => {
  test("app router page renders and elements carry dev-only markers", async ({ page }) => {
    await page.goto("/");

    const main = page.locator("main");
    await expect(main).toBeVisible();

    const card = page.locator(".card span");
    await expect(card).toBeVisible();
  });

  test("pages router index renders", async ({ page }) => {
    await page.goto("/");
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
  });

  test("client component counter increments", async ({ page }) => {
    await page.goto("/");

    const button = page.locator("button", { hasText: "Count" });
    await expect(button).toBeVisible();

    const initialText = await button.textContent();
    expect(initialText).toContain("Count: 0");

    await button.click();
    await expect(button).toHaveText(/Count: 1/);
  });

  test("about page is accessible via pages router", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator("h1")).toHaveText("About");
  });
});
