import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, createDragGhost } from "./index.js";

describe("drag-ghost", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "";
  });

  it("renders a ghost element following the pointer rect", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const ghost = createDragGhost(root);

    ghost.showDragGhost({
      rect: { x: 300, y: 220, width: 120, height: 60 },
      kind: "ghost",
    });

    const el = overlay.shadowRoot.querySelector(".vc-drag-ghost") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.display).toBe("block");
    expect(el.style.left).toBe("300px");
    expect(el.style.top).toBe("220px");
    expect(el.style.width).toBe("120px");
    expect(el.style.height).toBe("60px");
    expect(el.style.pointerEvents).toBe("none");
    overlay.unmount();
  });

  it("switches to the placeholder class when kind is placeholder", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const ghost = createDragGhost(root);

    ghost.showDragGhost({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      kind: "placeholder",
    });

    const placeholder = overlay.shadowRoot.querySelector(".vc-drag-placeholder") as HTMLElement;
    expect(placeholder).not.toBeNull();
    expect(overlay.shadowRoot.querySelector(".vc-drag-ghost")).toBeNull();
    overlay.unmount();
  });

  it("does not leak markup into the page DOM", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const ghost = createDragGhost(root);

    ghost.showDragGhost({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      kind: "ghost",
    });

    expect(document.body.querySelector(".vc-drag-ghost")).toBeNull();
    overlay.unmount();
  });

  it("clear() hides the element", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const ghost = createDragGhost(root);

    ghost.showDragGhost({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      kind: "ghost",
    });
    ghost.clear();

    const el = overlay.shadowRoot.querySelector(".vc-drag-ghost") as HTMLElement;
    expect(el.style.display).toBe("none");
    overlay.unmount();
  });
});
