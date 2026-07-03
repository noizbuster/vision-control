import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, createMarqueeOverlay, type MarqueeOverlay } from "./index.js";

describe("marquee overlay drag-rectangle", () => {
  let overlay: ReturnType<typeof attachOverlayRoot>;
  let marquee: MarqueeOverlay;

  afterEach(() => {
    marquee?.hideMarquee();
    overlay?.unmount();
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "";
  });

  it("showMarquee renders a zero-size rect at the start point", () => {
    overlay = attachOverlayRoot();
    marquee = createMarqueeOverlay(overlay.shadowRoot);

    marquee.showMarquee({ x: 100, y: 200 });

    const rect = overlay.shadowRoot.querySelector(".vc-marquee-rect") as HTMLElement;
    expect(rect).not.toBeNull();
    expect(rect.style.display).toBe("block");
    expect(rect.style.left).toBe("100px");
    expect(rect.style.top).toBe("200px");
  });

  it("updateMarquee grows the rectangle toward the current point", () => {
    overlay = attachOverlayRoot();
    marquee = createMarqueeOverlay(overlay.shadowRoot);

    marquee.showMarquee({ x: 10, y: 10 });
    marquee.updateMarquee({ x: 110, y: 60 });

    const rect = overlay.shadowRoot.querySelector(".vc-marquee-rect") as HTMLElement;
    expect(rect.style.left).toBe("10px");
    expect(rect.style.top).toBe("10px");
    expect(rect.style.width).toBe("100px");
    expect(rect.style.height).toBe("50px");
  });

  it("updateMarquee normalizes when dragging up-left (negative delta)", () => {
    overlay = attachOverlayRoot();
    marquee = createMarqueeOverlay(overlay.shadowRoot);

    marquee.showMarquee({ x: 100, y: 100 });
    marquee.updateMarquee({ x: 20, y: 30 });

    const rect = overlay.shadowRoot.querySelector(".vc-marquee-rect") as HTMLElement;
    expect(rect.style.left).toBe("20px");
    expect(rect.style.top).toBe("30px");
    expect(rect.style.width).toBe("80px");
    expect(rect.style.height).toBe("70px");
  });

  it("getRect returns the normalized rect during a drag and null when idle", () => {
    overlay = attachOverlayRoot();
    marquee = createMarqueeOverlay(overlay.shadowRoot);

    expect(marquee.getRect()).toBeNull();

    marquee.showMarquee({ x: 0, y: 0 });
    marquee.updateMarquee({ x: 50, y: 80 });
    expect(marquee.getRect()).toEqual({ x: 0, y: 0, width: 50, height: 80 });

    marquee.hideMarquee();
    expect(marquee.getRect()).toBeNull();
  });

  it("hideMarquee hides the rectangle element", () => {
    overlay = attachOverlayRoot();
    marquee = createMarqueeOverlay(overlay.shadowRoot);

    marquee.showMarquee({ x: 0, y: 0 });
    marquee.updateMarquee({ x: 100, y: 100 });
    marquee.hideMarquee();

    const rect = overlay.shadowRoot.querySelector(".vc-marquee-rect") as HTMLElement;
    expect(rect.style.display).toBe("none");
  });

  it("the rectangle is pointer-events none so it never steals the drag", () => {
    overlay = attachOverlayRoot();
    marquee = createMarqueeOverlay(overlay.shadowRoot);

    marquee.showMarquee({ x: 0, y: 0 });
    marquee.updateMarquee({ x: 100, y: 100 });

    const rect = overlay.shadowRoot.querySelector(".vc-marquee-rect") as HTMLElement;
    expect(rect.style.pointerEvents).toBe("none");
  });
});
