import { beforeEach, describe, expect, it } from "vitest";

import { createDropIndicator, type DropIndicatorApi } from "./drop-indicator.js";

describe("drop-indicator", () => {
  let container: HTMLElement;
  let indicator: DropIndicatorApi;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    indicator = createDropIndicator(container);
  });

  it("creates a hidden indicator element inside the container", () => {
    const element = container.querySelector(".vc-drop-indicator");
    expect(element).not.toBeNull();
    expect(element instanceof HTMLElement).toBe(true);
    if (!(element instanceof HTMLElement)) return;
    expect(element.style.display).toBe("none");
  });

  it("shows the indicator with a rect and orientation", () => {
    indicator.showDropIndicator({ x: 10, y: 20, width: 2, height: 100 }, "vertical");
    const element = container.querySelector(".vc-drop-indicator");
    if (!(element instanceof HTMLElement)) return;
    expect(element.style.display).toBe("block");
    expect(element.style.left).toBe("10px");
    expect(element.style.top).toBe("20px");
    expect(element.style.width).toBe("2px");
    expect(element.style.height).toBe("100px");
    expect(element.getAttribute("data-orientation")).toBe("vertical");
  });

  it("updates the indicator rect while preserving orientation", () => {
    indicator.showDropIndicator({ x: 0, y: 0, width: 100, height: 2 }, "horizontal");
    indicator.updateDropIndicator({ x: 5, y: 15, width: 120, height: 2 });
    const element = container.querySelector(".vc-drop-indicator");
    if (!(element instanceof HTMLElement)) return;
    expect(element.style.left).toBe("5px");
    expect(element.style.top).toBe("15px");
    expect(element.style.width).toBe("120px");
    expect(element.getAttribute("data-orientation")).toBe("horizontal");
  });

  it("hides the indicator", () => {
    indicator.showDropIndicator({ x: 0, y: 0, width: 2, height: 50 }, "vertical");
    indicator.hideDropIndicator();
    const element = container.querySelector(".vc-drop-indicator");
    if (!(element instanceof HTMLElement)) return;
    expect(element.style.display).toBe("none");
  });
});
