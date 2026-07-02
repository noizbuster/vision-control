import { describe, expect, it } from "vitest";

import { setHandlePointerEvents, setHostPointerEvents } from "./index.js";

describe("pointer-events policy", () => {
  it("sets the host to pointer-events none in pass-through mode", () => {
    const host = document.createElement("div");
    setHostPointerEvents(host, "pass-through");
    expect(host.style.pointerEvents).toBe("none");
  });

  it("sets the host to pointer-events auto in handles mode", () => {
    const host = document.createElement("div");
    setHostPointerEvents(host, "handles");
    expect(host.style.pointerEvents).toBe("auto");
  });

  it("toggles pointer-events on a handle", () => {
    const handle = document.createElement("div");
    setHandlePointerEvents(handle, true);
    expect(handle.style.pointerEvents).toBe("auto");
    setHandlePointerEvents(handle, false);
    expect(handle.style.pointerEvents).toBe("none");
  });
});
