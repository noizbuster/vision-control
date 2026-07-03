import { test } from "@playwright/test";

/**
 * @multi-select — VC-V1V2-05 multi-select model, marquee selection, and overlay.
 *
 * Verifies: Shift+Click add/remove, marquee drag selection, common-parent /
 * bounding-rect display, and the constraint rejections (cross-frame, cross
 * shadow root, closed shadow root). These require the built extension loaded in
 * Chromium with a playground fixture page that renders at least three sibling
 * cards in the same flex container.
 *
 * Browser binary: `pnpm playwright install chromium` first.
 */

test.describe("@multi-select", () => {
  // OUT: V1 (PRD §7.2 — multi-select deferred to V1; marquee group model not in MVP scope)
  test.fixme("Shift+Click three cards forms a group of three", async ({ page }) => {
    // Given: inspect mode active and a row of three sibling `.card` elements.
    // When: the user clicks card 1, then Shift+Clicks card 2 and card 3.
    // Then: a multi-select group of three members forms; the overlay renders
    //       three member outlines plus one group bounding outline.
    // Assert: overlay `.vc-multi-member-outline` count === 3 and a
    //         `.vc-multi-group-outline` is present.
  });

  // OUT: V1 (PRD §7.2 — multi-select deferred to V1; marquee group model not in MVP scope)
  test.fixme("Shift+Click a selected card removes it from the group (toggle)", async ({ page }) => {
    // Given: a group of three cards is active.
    // When: the user Shift+Clicks card 2 again.
    // Then: the group shrinks to two members; the overlay re-renders with two
    //       member outlines.
    // Assert: overlay `.vc-multi-member-outline` count === 2.
  });

  // OUT: V1 (PRD §7.2 — multi-select deferred to V1; marquee group model not in MVP scope)
  test.fixme("marquee drag selects all elements intersecting the rectangle", async ({ page }) => {
    // Given: inspect mode active over a grid of six cards.
    // When: the user drags a marquee rectangle enclosing four of them.
    // Then: a multi-select group of four members forms in one gesture.
    // Assert: overlay `.vc-multi-member-outline` count === 4 and the group
    //         bounding rect equals the enclosing box of the four rects.
  });

  // OUT: V1 (PRD §7.2 — multi-select deferred to V1; marquee group model not in MVP scope)
  test.fixme("Shift+Click across two frames is rejected with a diagnostic", async ({ page }) => {
    // Given: a same-origin iframe is present alongside a top-frame card, and a
    //        one-member group is started on the top-frame card.
    // When: the user Shift+Clicks an element inside the iframe.
    // Then: the machine rejects the transition with a `cross-frame` diagnostic;
    //       the group is NOT extended; the inspector shows the violation.
    // Assert: overlay member count unchanged; a `.inspector-multi-select__violation`
    //         lists code `cross-frame`.
  });

  // OUT: V1 (PRD §7.2 — multi-select deferred to V1; marquee group model not in MVP scope)
  test.fixme("Shift+Click on a closed shadow root element is rejected", async ({ page }) => {
    // Given: a web component with a closed shadow root renders a button.
    // When: the user Shift+Clicks the button inside the closed root.
    // Then: the element is not selectable (closed roots are opaque); no group
    //       member is added.
    // Assert: overlay member count unchanged (closed-shadow-root is excluded by
    //         construction — the element never reaches the reducer).
  });

  // OUT: V1 (PRD §7.2 — multi-select deferred to V1; marquee group model not in MVP scope)
  test.fixme("group inspector section shows common parent and bounding rect", async ({ page }) => {
    // Given: a multi-select group of three sibling cards is active.
    // Then: the panel renders the Multi-Select Group section.
    // Assert: the section shows member count 3, the shared common parent
    //         (the cards' flex container), and bounding-rect dimensions.
  });
});
