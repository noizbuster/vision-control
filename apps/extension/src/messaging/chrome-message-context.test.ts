import { describe, expect, it } from "vitest";

import { createChromeMessageContext } from "./chrome-message-context.js";

describe("createChromeMessageContext", () => {
  it("classifies a same-extension panel page with tab metadata as panel", () => {
    // Given: an extension panel opened in a regular Chromium tab.
    const sender = {
      frameId: 0,
      tab: { id: 91 },
      url: "chrome-extension://vision-control/panel.html",
    };

    // When: it claims the panel route for an inspected content target.
    const context = createChromeMessageContext(sender, "panel");

    // Then: it is not misclassified as a content script by its tab metadata.
    expect(context).toEqual({ route: "panel", tabId: 91, frameId: 0, sessionId: undefined });
  });

  it("keeps a web-tab sender as content when it claims the panel route", () => {
    // Given: a content script running in a web tab.
    const sender = {
      frameId: 0,
      tab: { id: 92 },
      url: "http://localhost:9973/fixture",
    };

    // When: it claims the panel route.
    const context = createChromeMessageContext(sender, "panel");

    // Then: tab-isolation protection remains bound to the actual content sender.
    expect(context).toEqual({ route: "content", tabId: 92, frameId: 0, sessionId: undefined });
  });
});
