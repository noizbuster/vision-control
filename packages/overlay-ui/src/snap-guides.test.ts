import type { SnapCandidate } from "@vision-control/layout-engine";
import { beforeEach, describe, expect, it } from "vitest";

import { createSnapGuides, type SnapGuides } from "./snap-guides.js";

const xEdge = (value: number, distance = 1): SnapCandidate => ({
  kind: "edge",
  axis: "x",
  value,
  distance,
});

const yGrid = (value: number, distance = 1): SnapCandidate => ({
  kind: "grid",
  axis: "y",
  value,
  distance,
});

const tokenCandidate = (value: number): SnapCandidate => ({
  kind: "spacing-token",
  axis: "x",
  value,
  token: "space-4",
  distance: 2,
});

const BOUNDS = { x: 0, y: 0, width: 800, height: 600 };

describe("snap-guides", () => {
  let container: HTMLElement;
  let guides: SnapGuides;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    guides = createSnapGuides(container);
  });

  it("creates a hidden guide layer inside the container", () => {
    const layer = container.querySelector(".vc-snap-guide-layer");
    expect(layer).not.toBeNull();
    if (!(layer instanceof HTMLElement)) return;
    expect(layer.style.display).toBe("none");
  });

  it("renders one guide line per candidate", () => {
    guides.setSnapGuides([xEdge(100), xEdge(200), yGrid(50)], { bounds: BOUNDS });
    const lines = container.querySelectorAll(".vc-snap-guide");
    expect(lines.length).toBe(3);
    const layer = container.querySelector(".vc-snap-guide-layer");
    if (layer instanceof HTMLElement) expect(layer.style.display).toBe("block");
  });

  it("renders a vertical line for an x-axis candidate sized to the bounds height", () => {
    guides.setSnapGuides([xEdge(120)], { bounds: { x: 0, y: 10, width: 800, height: 600 } });
    const line = container.querySelector(".vc-snap-guide");
    if (!(line instanceof HTMLElement)) throw new Error("guide not rendered");
    expect(line.style.left).toBe("120px");
    expect(line.style.top).toBe("10px");
    expect(line.style.width).toBe("1px");
    expect(line.style.height).toBe("600px");
    expect(line.getAttribute("data-snap-axis")).toBe("x");
  });

  it("renders a horizontal line for a y-axis candidate sized to the bounds width", () => {
    guides.setSnapGuides([yGrid(80)], { bounds: { x: 20, y: 0, width: 800, height: 600 } });
    const line = container.querySelector(".vc-snap-guide");
    if (!(line instanceof HTMLElement)) throw new Error("guide not rendered");
    expect(line.style.top).toBe("80px");
    expect(line.style.left).toBe("20px");
    expect(line.style.height).toBe("1px");
    expect(line.style.width).toBe("800px");
    expect(line.getAttribute("data-snap-axis")).toBe("y");
  });

  it("stamps the kind as a CSS class and data attribute", () => {
    guides.setSnapGuides([xEdge(100)], { bounds: BOUNDS });
    const line = container.querySelector(".vc-snap-guide");
    if (!(line instanceof HTMLElement)) throw new Error("guide not rendered");
    expect(line.classList.contains("vc-snap-guide--edge")).toBe(true);
    expect(line.getAttribute("data-snap-kind")).toBe("edge");
  });

  it("stamps the token name only for spacing-token candidates", () => {
    guides.setSnapGuides([tokenCandidate(116), xEdge(100)], { bounds: BOUNDS });
    const lines = container.querySelectorAll(".vc-snap-guide");
    const tokenLine = lines[0];
    const edgeLine = lines[1];
    if (!(tokenLine instanceof HTMLElement) || !(edgeLine instanceof HTMLElement)) {
      throw new Error("guides not rendered");
    }
    expect(tokenLine.getAttribute("data-snap-token")).toBe("space-4");
    expect(edgeLine.getAttribute("data-snap-token")).toBeNull();
  });

  it("replaces previous guides on each setSnapGuides call (no accumulation)", () => {
    guides.setSnapGuides([xEdge(1), xEdge(2), xEdge(3)], { bounds: BOUNDS });
    guides.setSnapGuides([xEdge(10)], { bounds: BOUNDS });
    expect(container.querySelectorAll(".vc-snap-guide").length).toBe(1);
  });

  it("hides the layer when the candidate list is empty", () => {
    guides.setSnapGuides([xEdge(100)], { bounds: BOUNDS });
    guides.setSnapGuides([], { bounds: BOUNDS });
    const layer = container.querySelector(".vc-snap-guide-layer");
    if (!(layer instanceof HTMLElement)) throw new Error("layer missing");
    expect(layer.style.display).toBe("none");
    expect(container.querySelectorAll(".vc-snap-guide").length).toBe(0);
  });

  it("clear() removes all guides and hides the layer", () => {
    guides.setSnapGuides([xEdge(100), yGrid(50)], { bounds: BOUNDS });
    guides.clear();
    const layer = container.querySelector(".vc-snap-guide-layer");
    if (!(layer instanceof HTMLElement)) throw new Error("layer missing");
    expect(layer.style.display).toBe("none");
    expect(container.querySelectorAll(".vc-snap-guide").length).toBe(0);
  });

  it("never sets pointer-events to auto on guide lines (advisory visuals only)", () => {
    guides.setSnapGuides([xEdge(100)], { bounds: BOUNDS });
    const line = container.querySelector(".vc-snap-guide");
    if (!(line instanceof HTMLElement)) throw new Error("guide not rendered");
    expect(line.style.pointerEvents).toBe("none");
  });
});
