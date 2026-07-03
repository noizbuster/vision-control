import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, createFlexGridAxis } from "./index.js";

describe("flex-grid-axis", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a horizontal axis for a flex-row container", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const axis = createFlexGridAxis(root);

    axis.setAxis({
      rect: { x: 20, y: 30, width: 200, height: 60 },
      kind: "flex",
      direction: "horizontal",
    });

    const indicator = overlay.shadowRoot.querySelector(".vc-axis-indicator") as HTMLElement;
    expect(indicator.style.display).toBe("block");
    expect(indicator.classList.contains("vc-axis-indicator--flex")).toBe(true);

    const line = overlay.shadowRoot.querySelector(".vc-axis-indicator__line") as HTMLElement;
    expect(line.style.width).toBe("200px");
    expect(line.style.height).toBe("2px");

    axis.setAxis(null);
    expect(indicator.style.display).toBe("none");
    overlay.unmount();
  });

  it("renders a vertical axis for a flex-column container", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const axis = createFlexGridAxis(root);

    axis.setAxis({
      rect: { x: 0, y: 0, width: 60, height: 300 },
      kind: "flex",
      direction: "vertical",
    });

    const line = overlay.shadowRoot.querySelector(".vc-axis-indicator__line") as HTMLElement;
    expect(line.style.height).toBe("300px");
    expect(line.style.width).toBe("2px");
    overlay.unmount();
  });

  it("stamps the grid kind on the indicator", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const axis = createFlexGridAxis(root);

    axis.setAxis({
      rect: { x: 0, y: 0, width: 100, height: 100 },
      kind: "grid",
      direction: "horizontal",
    });

    const indicator = overlay.shadowRoot.querySelector(".vc-axis-indicator") as HTMLElement;
    expect(indicator.classList.contains("vc-axis-indicator--grid")).toBe(true);
    overlay.unmount();
  });

  it("does not leak markup into the page DOM", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const axis = createFlexGridAxis(root);

    axis.setAxis({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      kind: "flex",
      direction: "horizontal",
    });

    expect(document.body.querySelector(".vc-axis-indicator")).toBeNull();
    overlay.unmount();
  });

  it("clear() hides the indicator", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const axis = createFlexGridAxis(root);

    axis.setAxis({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      kind: "flex",
      direction: "horizontal",
    });
    axis.clear();

    const indicator = overlay.shadowRoot.querySelector(".vc-axis-indicator") as HTMLElement;
    expect(indicator.style.display).toBe("none");
    overlay.unmount();
  });
});
