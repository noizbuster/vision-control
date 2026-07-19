import { afterEach, describe, expect, it } from "vitest";

import { measureReorderContainer } from "./reorder-dom-context.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("measureReorderContainer", () => {
  it("captures the browser logical-axis triple for flex Move", () => {
    const parent = document.createElement("div");
    parent.style.cssText =
      "display:flex;flex-direction:row-reverse;direction:rtl;writing-mode:vertical-rl";
    parent.append(document.createElement("div"), document.createElement("div"));
    document.body.appendChild(parent);

    const result = measureReorderContainer(parent, null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.measurement.flow).toEqual({
      kind: "flex",
      axis: { writingMode: "vertical-rl", direction: "rtl", flexDirection: "row-reverse" },
    });
  });

  it("rejects unsupported writing-mode metadata with a surfaced diagnostic", () => {
    const parent = document.createElement("div");
    parent.style.cssText = "display:flex;flex-direction:row;writing-mode:sideways-rl";
    parent.appendChild(document.createElement("div"));
    document.body.appendChild(parent);

    const result = measureReorderContainer(parent, null);

    expect(result).toMatchObject({
      ok: false,
      diagnostic: { kind: "unsupported-context" },
    });
  });

  it("rejects wrapped flex placement instead of inventing a single-line index", () => {
    const parent = document.createElement("div");
    parent.style.cssText = "display:flex;flex-direction:row;flex-wrap:wrap";
    parent.append(document.createElement("div"), document.createElement("div"));
    document.body.appendChild(parent);

    const result = measureReorderContainer(parent, null);

    expect(result).toMatchObject({
      ok: false,
      diagnostic: { kind: "unsupported-context" },
    });
  });
});
