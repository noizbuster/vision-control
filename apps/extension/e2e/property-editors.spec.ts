import { test } from "@playwright/test";

/**
 * @property-editors — AC-002 style editing.
 *
 * Verifies: edit padding/background/class/text creates a pending operation,
 * invalid CSS is rejected, and the preview updates immediately.
 */

test.describe("@property-editors", () => {
  test.fixme("editing padding creates a style-edit operation and previews immediately", async ({
    page,
  }) => {
    // Given: an element is selected and the style editor is open.
    // When: the user changes padding from "10px" to "24px".
    // Then: a pending style-edit operation is created (property: "padding",
    //       value: "24px", previousValue: "10px").
    // And: the element visually updates to the new padding before commit.
    // Assert: pending operation payload has correct property/value pair.
  });

  test.fixme("editing background-color creates a style-edit operation", async ({ page }) => {
    // Given: an element is selected.
    // When: the user sets background-color to "#ff0000".
    // Then: a pending style-edit operation with property "background-color" is created.
    // Assert: the element's computed background-color reflects the new value.
  });

  test.fixme("adding a class creates a class-add operation", async ({ page }) => {
    // Given: an element is selected and the class editor is open.
    // When: the user adds class "highlight".
    // Then: a pending class-add operation (className: "highlight") is created.
    // Assert: element.classList contains "highlight" in the preview layer.
  });

  test.fixme("editing text creates a text-edit operation", async ({ page }) => {
    // Given: an element with text content is selected.
    // When: the user edits the text from "Hello" to "World".
    // Then: a pending text-edit operation (newText: "World", previousText: "Hello") is created.
    // Assert: the element's textContent in the preview reflects "World".
  });

  test.fixme("invalid CSS value is rejected and no operation is created", async ({ page }) => {
    // Given: the style editor is open for a selected element.
    // When: the user enters "abc" as a padding value.
    // Then: the CSS validation rejects the input.
    // Assert: NO pending operation is created; an inline error is shown.
    // Assert: the element's style is unchanged.
  });

  test.fixme("invalid display value is rejected", async ({ page }) => {
    // Given: the style editor display field is focused.
    // When: the user enters "blocky" (not a valid display keyword).
    // Then: validation rejects the value.
    // Assert: no operation is created; the error message explains valid values.
  });
});
