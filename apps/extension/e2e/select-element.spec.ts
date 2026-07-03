import { test } from "@playwright/test";

/**
 * @select-element — AC-001 element selection.
 *
 * Verifies: hover outline, click selection, scroll/resize tracking, same-origin
 * iframe selection, cross-origin opaque blocking. These require the built
 * extension loaded in Chromium with the playground fixture page open.
 *
 * Browser binary: `pnpm playwright install chromium` first.
 */

test.describe("@select-element", () => {
  test.fixme("hover shows an outline around the target element", async ({ page }) => {
    // Given: the extension is loaded and inspect mode is active on the playground.
    // When: the pointer hovers over a card element.
    // Then: a visible outline (data-vc-hover) appears at the element's bounding rect.
    // Assert: outline rect matches element.getBoundingClientRect() within 1px tolerance.
  });

  test.fixme("click selects the element and it appears in the panel", async ({ page }) => {
    // Given: inspect mode active.
    // When: the user clicks a button element.
    // Then: the panel displays the element's tag name, role, and text preview.
    // Assert: panel text content includes "button" and the element's label.
  });

  test.fixme("outline follows the element after scroll", async ({ page }) => {
    // Given: an element is selected (outline visible).
    // When: the page is scrolled vertically by 200px.
    // Then: the selection outline moves to match the new element position.
    // Assert: outline top offset decreases by ~200px relative to the viewport.
  });

  test.fixme("outline follows the element after window resize", async ({ page }) => {
    // Given: an element is selected.
    // When: the viewport is resized from 1280x720 to 800x600.
    // Then: the outline recomputes position via ResizeObserver.
    // Assert: outline rect matches the resized element's bounding rect.
  });

  test.fixme("selection works inside a same-origin iframe", async ({ page }) => {
    // Given: the SameOriginIframe fixture route is loaded.
    // When: the user clicks an element inside the iframe.
    // Then: the content script bridges the rect to the top frame and the
    //       element is selectable.
    // Assert: the panel shows the iframe element's tag name.
  });

  test.fixme("cross-origin iframe selection is blocked (opaque)", async ({ page }) => {
    // Given: the CrossOriginIframe fixture route is loaded.
    // When: the user attempts to select an element inside the cross-origin iframe.
    // Then: the frame is reported as opaque (contentDocument === null).
    // Assert: no selection occurs; no edit messages are routed into the frame.
  });
});
