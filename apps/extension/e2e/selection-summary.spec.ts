import { test } from "@playwright/test";

/**
 * @selection-summary — AC-002 prerequisite: inspector summary.
 *
 * Verifies the panel shows: breadcrumb path, computed style, box model, class
 * list, role/name, and parent layout context after selecting an element.
 * Requires the built extension in Chromium.
 */

test.describe("@selection-summary", () => {
  test.fixme("breadcrumb displays the ancestry path from root to target", async ({ page }) => {
    // Given: a nested element (e.g., main > section > article > h1) is selected.
    // When: the inspector panel renders.
    // Then: the breadcrumb shows [html, body, main, section, article, h1].
    // Assert: breadcrumb item count matches the DOM depth (capped at 10).
  });

  test.fixme("computed style shows display, position, and flex properties", async ({ page }) => {
    // Given: a flex item is selected.
    // When: the computed style section renders.
    // Then: display: flex, flex-direction: row, and the item's flex-basis appear.
    // Assert: the computed style values match window.getComputedStyle(element).
  });

  test.fixme("box model shows content, padding, border, and margin dimensions", async ({
    page,
  }) => {
    // Given: an element with known padding/border is selected.
    // When: the box model section renders.
    // Then: content width/height, padding edges, border, and margin are shown.
    // Assert: values match the element's getBoundingClientRect + computed style.
  });

  test.fixme("class list shows all classes with Tailwind utility tagging", async ({ page }) => {
    // Given: an element with mixed classes (Tailwind + custom) is selected.
    // When: the class list section renders.
    // Then: each class appears with a source tag (tailwind/util/custom).
    // Assert: the class count matches element.classList.length.
  });

  test.fixme("role and accessible name are displayed", async ({ page }) => {
    // Given: a <button> with aria-label is selected.
    // When: the semantic summary section renders.
    // Then: role="button" and the accessible name are shown.
    // Assert: role and name match getComputedStyle / aria-label.
  });

  test.fixme("parent layout context shows parent display mode", async ({ page }) => {
    // Given: an element inside a flex container is selected.
    // When: the parent layout section renders.
    // Then: parentDisplay: flex, parentMode, and sibling count/index appear.
    // Assert: values match the parent element's computed style.
  });
});
