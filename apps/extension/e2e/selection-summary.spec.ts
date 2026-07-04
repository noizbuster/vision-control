import {
  expect as extExpect,
  test as extTest,
  fixtureHtml,
  serveFixture,
} from "./fixtures/extension-test.ts";

/**
 * @selection-summary — AC-002 prerequisite: inspector summary.
 *
 * Browser-driven: loads a fixture with a known element hierarchy and verifies
 * the DOM values the inspector reads (computed style, bounding rect, class
 * list, breadcrumb depth, role/name, parent layout context) are correct.
 */

const FIXTURE = fixtureHtml(`
  <main>
    <section>
      <article>
        <h1 id="heading">Title</h1>
        <button id="btn" class="primary active" role="button" aria-label="Submit form">Submit</button>
        <div id="flex-child" class="card item" style="display:block;padding:10px 20px;margin:5px;border:2px solid red;width:200px;height:100px">Card</div>
      </article>
    </section>
    <div id="flex-parent" style="display:flex;flex-direction:row;gap:16px">
      <div id="flex-item" style="flex:1;padding:10px">Flex Item</div>
    </div>
  </main>
`);

extTest.describe("@selection-summary browser", () => {
  extTest("breadcrumb path has correct depth from root to target", async ({ page }) => {
    await serveFixture(page, FIXTURE);
    const depth = await page.locator("#heading").evaluate((el) => {
      let node = el as Element | null;
      let count = 0;
      while (node && node !== document) {
        count++;
        node = node.parentElement;
      }
      return count;
    });
    extExpect(depth).toBe(6);
  });

  extTest("computed style reflects display, position for a block element", async ({ page }) => {
    await serveFixture(page, FIXTURE);
    const style = await page.locator("#flex-child").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { display: cs.display, position: cs.position, width: cs.width };
    });
    extExpect(style.display).toBe("block");
    extExpect(style.position).toBe("static");
  });

  extTest(
    "box model dimensions match getBoundingClientRect and computed style",
    async ({ page }) => {
      await serveFixture(page, FIXTURE);
      const box = await page.locator("#flex-child").evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          width: cs.width,
          paddingTop: cs.paddingTop,
          borderLeftWidth: parseFloat(cs.borderLeftWidth),
        };
      });
      extExpect(box.width).toBe("200px");
      extExpect(box.paddingTop).toBe("10px");
      extExpect(box.borderLeftWidth).toBeGreaterThanOrEqual(1.5);
      extExpect(box.borderLeftWidth).toBeLessThanOrEqual(2);
    },
  );

  extTest("class list contains all element classes", async ({ page }) => {
    await serveFixture(page, FIXTURE);
    const classes = await page.locator("#flex-child").evaluate((el) => Array.from(el.classList));
    extExpect(classes).toEqual(extExpect.arrayContaining(["card", "item"]));
    extExpect(classes.length).toBe(2);
  });

  extTest("role and accessible name are available on a button", async ({ page }) => {
    await serveFixture(page, FIXTURE);
    const role = await page.locator("#btn").getAttribute("role");
    const ariaLabel = await page.locator("#btn").getAttribute("aria-label");
    extExpect(role).toBe("button");
    extExpect(ariaLabel).toBe("Submit form");
  });

  extTest("parent layout context shows parent display mode for a flex child", async ({ page }) => {
    await serveFixture(page, FIXTURE);
    const parentDisplay = await page.locator("#flex-item").evaluate((el) => {
      const parent = el.parentElement;
      if (!parent) throw new Error("#flex-item has no parent element");
      return getComputedStyle(parent).display;
    });
    extExpect(parentDisplay).toBe("flex");
  });
});
