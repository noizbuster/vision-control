import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, createChangedBadge } from "./index.js";

describe("changed-badge", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the label next to the changed element inside the shadow root", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const badge = createChangedBadge(root);

    badge.showChangedBadge({
      rect: { x: 40, y: 20, width: 100, height: 30 },
      label: "changed",
    });

    const el = overlay.shadowRoot.querySelector(".vc-changed-badge") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.display).toBe("inline-flex");
    expect(el.textContent).toBe("changed");
    expect(el.style.left).toBe("142px");
    expect(el.style.top).toBe("20px");
    expect(el.style.pointerEvents).toBe("none");
    overlay.unmount();
  });

  it("does not leak markup into the page DOM", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const badge = createChangedBadge(root);

    badge.showChangedBadge({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      label: "x",
    });

    expect(document.body.querySelector(".vc-changed-badge")).toBeNull();
    overlay.unmount();
  });

  it("clear() hides the badge and removes its label", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const badge = createChangedBadge(root);

    badge.showChangedBadge({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      label: "changed",
    });
    badge.clear();

    const el = overlay.shadowRoot.querySelector(".vc-changed-badge") as HTMLElement;
    expect(el.style.display).toBe("none");
    expect(el.textContent).toBe("");
    overlay.unmount();
  });
});
