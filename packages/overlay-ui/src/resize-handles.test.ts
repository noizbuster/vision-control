import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot } from "./index.js";
import {
  createResizeHandles,
  RESIZE_HANDLE_POSITIONS,
  type ResizeHandlePosition,
} from "./resize-handles.js";

describe("resize handles", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "";
  });

  it("renders eight handles around the target rect", () => {
    const overlay = attachOverlayRoot();
    const handles = createResizeHandles(
      overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement,
    );

    handles.showResizeHandles({ x: 100, y: 200, width: 300, height: 400 });

    for (const position of RESIZE_HANDLE_POSITIONS) {
      const handle = handles.getHandleElement(position);
      expect(handle, `handle ${position}`).not.toBeNull();
      expect(handle?.dataset.handlePosition).toBe(position);
      expect(handle?.classList.contains(`vc-handle-${position}`)).toBe(true);
    }

    handles.destroy();
    overlay.unmount();
  });

  it("positions corner handles at the rect corners", () => {
    const overlay = attachOverlayRoot();
    const handles = createResizeHandles(
      overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement,
    );

    handles.showResizeHandles({ x: 100, y: 200, width: 300, height: 400 });

    const nw = handles.getHandleElement("nw");
    expect(nw?.style.left).toBe("96px");
    expect(nw?.style.top).toBe("196px");

    const se = handles.getHandleElement("se");
    expect(se?.style.left).toBe("396px");
    expect(se?.style.top).toBe("596px");

    handles.destroy();
    overlay.unmount();
  });

  it("positions edge handles at the midpoints", () => {
    const overlay = attachOverlayRoot();
    const handles = createResizeHandles(
      overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement,
    );

    handles.showResizeHandles({ x: 100, y: 200, width: 300, height: 400 });

    const n = handles.getHandleElement("n");
    expect(n?.style.left).toBe("246px");
    expect(n?.style.top).toBe("196px");

    const e = handles.getHandleElement("e");
    expect(e?.style.left).toBe("396px");
    expect(e?.style.top).toBe("396px");

    handles.destroy();
    overlay.unmount();
  });

  it("hides handles and clears elements", () => {
    const overlay = attachOverlayRoot();
    const handles = createResizeHandles(
      overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement,
    );

    handles.showResizeHandles({ x: 0, y: 0, width: 10, height: 10 });
    handles.hideResizeHandles();

    for (const position of RESIZE_HANDLE_POSITIONS) {
      expect(handles.getHandleElement(position)).toBeNull();
    }
    const layer = overlay.shadowRoot.querySelector(".vc-handles-layer") as HTMLElement;
    expect(layer.style.display).toBe("none");

    handles.destroy();
    overlay.unmount();
  });

  it("updates the cursor style of a handle", () => {
    const overlay = attachOverlayRoot();
    const handles = createResizeHandles(
      overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement,
    );

    handles.showResizeHandles({ x: 0, y: 0, width: 10, height: 10 });
    handles.updateHandleCursor("se", "wait");

    expect(handles.getHandleElement("se")?.style.cursor).toBe("wait");

    handles.destroy();
    overlay.unmount();
  });

  it("positions handles independently across show calls", () => {
    const overlay = attachOverlayRoot();
    const handles = createResizeHandles(
      overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement,
    );

    handles.showResizeHandles({ x: 0, y: 0, width: 100, height: 100 });
    handles.showResizeHandles({ x: 50, y: 60, width: 20, height: 30 });

    const nw = handles.getHandleElement("nw");
    expect(nw?.style.left).toBe("46px");
    expect(nw?.style.top).toBe("56px");

    handles.destroy();
    overlay.unmount();
  });

  it("destroys the layer and releases handles", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const handles = createResizeHandles(root);

    handles.showResizeHandles({ x: 0, y: 0, width: 10, height: 10 });
    handles.destroy();

    expect(root.querySelector(".vc-handles-layer")).toBeNull();
    for (const position of RESIZE_HANDLE_POSITIONS) {
      expect(handles.getHandleElement(position as ResizeHandlePosition)).toBeNull();
    }

    overlay.unmount();
  });
});
