import { expect, type Page, test } from "@playwright/test";

/**
 * @fixture-health — playground fixture app health check.
 *
 * Verifies every fixture route renders without errors and seeded edge cases
 * (identical buttons, private fields, shadow DOM, iframes) exist in the DOM.
 * The webServer in playwright.config.ts auto-starts the vite dev server.
 */

interface RouteSpec {
  readonly path: string;
  readonly label: string;
  readonly selector: string;
  /**
   * When true the route embeds an external resource (e.g. a cross-origin
   * iframe) whose load result is environment-dependent; the health check
   * asserts only that no uncaught exception fires, not that zero console
   * errors are logged (a failed external fetch is not a fixture bug).
   */
  readonly externalResource?: boolean;
}

const ROUTES: readonly RouteSpec[] = [
  { path: "/", label: "MVP Board", selector: "main" },
  { path: "/reparent", label: "Reparent", selector: "aside" },
  { path: "/text-edit", label: "Text Edit", selector: "main" },
  { path: "/style-edit", label: "Style Edit", selector: "main" },
  { path: "/resize-flex", label: "Resize Flex", selector: "main" },
  { path: "/nested-layout", label: "Nested Layout", selector: "main" },
  { path: "/transformed-ancestor", label: "Transformed Ancestor", selector: "main" },
  { path: "/scroll-container", label: "Scroll Container", selector: "main" },
  { path: "/repeated-list", label: "Repeated List", selector: "main" },
  { path: "/identical-buttons", label: "Identical Buttons", selector: "button" },
  { path: "/conditional-class", label: "Conditional Class", selector: "main" },
  { path: "/portal-case", label: "Portal Case", selector: "main" },
  { path: "/same-origin-iframe", label: "Same-Origin Iframe", selector: "iframe" },
  {
    path: "/cross-origin-iframe",
    label: "Cross-Origin Iframe",
    selector: "iframe",
    externalResource: true,
  },
  { path: "/shadow-dom-open", label: "Shadow DOM Open", selector: "main" },
  { path: "/shadow-dom-closed", label: "Shadow DOM Closed", selector: "main" },
  { path: "/private-fields", label: "Private Fields", selector: "form" },
  { path: "/css-modules", label: "CSS Modules", selector: "main" },
  { path: "/css-grid", label: "CSS Grid", selector: "main" },
  { path: "/responsive-breakpoints", label: "Responsive Breakpoints", selector: "main" },
  { path: "/hmr-demo", label: "HMR Demo", selector: "main" },
];

/**
 * Attaches listeners that record uncaught exceptions and error-level console
 * messages. Returns a accessor for the accumulated list. Must be called BEFORE
 * navigating so listeners are in place before the page renders.
 */
function collectErrors(page: Page): () => readonly string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  return () => errors;
}

test.describe("@fixture-health", () => {
  test("all 20 fixture routes are defined", () => {
    expect(ROUTES.length).toBe(21);
    const paths = ROUTES.map((r) => r.path);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });

  for (const route of ROUTES) {
    test(`${route.label} (${route.path}) renders without console errors`, async ({ page }) => {
      const getErrors = collectErrors(page);
      await page.goto(route.path);
      await expect(page.locator(route.selector).first()).toBeVisible();
      const errors = getErrors();
      if (route.externalResource) {
        // External resource: only an uncaught exception counts as a fixture bug.
        const pageErrors = errors.filter((e) => e.startsWith("pageerror"));
        expect(pageErrors, "fixture route threw an uncaught exception").toEqual([]);
      } else {
        expect(errors, "fixture route emitted unexpected errors").toEqual([]);
      }
    });
  }

  test("identical buttons route has two visually identical buttons", async ({ page }) => {
    await page.goto("/identical-buttons");
    const buttons = page.locator("button");
    await expect(buttons).toHaveCount(2);
    const texts = await buttons.allTextContents();
    expect(texts).toEqual(["Identical button", "Identical button"]);
    const classNames = await buttons.evaluateAll((els) => els.map((el) => el.className));
    expect(classNames[0]).toBe(classNames[1]);
  });

  test("private fields route seeds secrets for adversarial tests", async ({ page }) => {
    await page.goto("/private-fields");
    await expect(page.locator("form")).toBeVisible();
    const cookie = await page.evaluate(() => document.cookie);
    expect(cookie).toContain("session=VC_SECRET_COOKIE");
    const apiKey = await page.evaluate(() => localStorage.getItem("api_key"));
    expect(apiKey).toBe("sk_test_VC_SECRET");
    const passwordValue = await page.locator('input[type="password"]').inputValue();
    expect(passwordValue).toBe("VC_SECRET_SHOULD_NOT_EXPORT");
  });

  test("same-origin iframe renders with accessible content", async ({ page }) => {
    await page.goto("/same-origin-iframe");
    const iframe = page.locator("iframe").first();
    await expect(iframe).toBeVisible();
    // Wait for the iframe document to load its seeded content.
    await expect(
      page.frameLocator("iframe").getByRole("button", { name: "Inside same-origin iframe" }),
    ).toBeVisible();
    // Same-origin: contentDocument is non-null and inspectable.
    const contentAccessible = await iframe.evaluate(
      (el) => (el as HTMLIFrameElement).contentDocument !== null,
    );
    expect(contentAccessible).toBe(true);
  });

  test("cross-origin iframe renders but content is opaque", async ({ page }) => {
    await page.goto("/cross-origin-iframe");
    const iframe = page.locator("iframe").first();
    await expect(iframe).toBeVisible();
    // The iframe's initial document is a same-origin about:blank; opacity only
    // holds once the cross-origin navigation completes. Wait for the frame to
    // reach example.com before asserting contentDocument is null.
    await expect
      .poll(async () => page.frames().some((f) => f.url().startsWith("https://example.com")))
      .toBe(true);
    // Cross-origin: contentDocument is null (opaque). The try/catch guards the
    // rare SecurityException shape some engines emit on cross-origin access.
    const isOpaque = await iframe.evaluate((el) => {
      const frame = el as HTMLIFrameElement;
      try {
        return frame.contentDocument === null;
      } catch {
        return true;
      }
    });
    expect(isOpaque).toBe(true);
  });

  test("nav bar lists all 20 routes", async ({ page }) => {
    await page.goto("/");
    const navLinks = page.locator("nav a");
    await expect(navLinks).toHaveCount(21);
  });
});
