import { test } from "@playwright/test";

/**
 * @routing-isolation — PRD constraint: tab/frame/session isolation.
 *
 * Verifies the extension's message router enforces isolation: two tabs cannot
 * read or mutate each other's state, same-origin iframes are routeable,
 * cross-origin iframes are opaque, reload preserves session, and DevTools
 * reopen restores the connection.
 *
 * All scenarios require the built extension loaded in Chromium with multiple
 * tabs/iframes.
 */

test.describe("@routing-isolation", () => {
  test.fixme("two tabs are isolated: tab A messages do not reach tab B", async ({ browser }) => {
    // Given: two tabs are open on different playground routes.
    // When: the user selects an element in tab A.
    // Then: the selection message is routed ONLY to tab A's content script.
    // Assert: tab B's panel does not show the selection; tab B's DOM is untouched.
  });

  test.fixme("same-origin iframe is routeable for selection and edits", async ({ browser }) => {
    // Given: tab A has a same-origin iframe.
    // When: the user selects an element inside the iframe.
    // Then: the frame-hello handshake registers the frame; the router allows
    //       routing into it by frameId.
    // Assert: the panel shows the iframe element's identity.
  });

  test.fixme("cross-origin iframe is opaque and cannot be routed into", async ({ browser }) => {
    // Given: tab A has a cross-origin iframe.
    // When: the router discovers frames via webNavigation.getAllFrames.
    // Then: the cross-origin frame is reported with routeable: false.
    // Assert: no edit message can be sent into the cross-origin frame;
    //         the frame's contentDocument is null.
  });

  test.fixme("page reload preserves the tab session id", async ({ page }) => {
    // Given: a tab has an active session with a selected element.
    // When: the page reloads (location.reload).
    // Then: TabSessionStore preserves the sessionId across the reload (it
    //       survives via chrome.storage.session).
    // Assert: after reload, the panel reconnects with the same sessionId.
  });

  test.fixme("DevTools reopen restores the current session and connection state", async ({
    page,
  }) => {
    // Given: DevTools is open with a connected daemon session.
    // When: the user closes and reopens DevTools.
    // Then: the panel port reconnects; the background pushes the current
    //       session + connection state to the new panel instance.
    // Assert: the panel shows "connected" status and the existing changeset.
  });
});
