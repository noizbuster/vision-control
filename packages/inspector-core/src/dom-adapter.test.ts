import { afterEach, describe, expect, it } from "vitest";

import { createBrowserDomAdapter } from "./index.js";

describe("browser DOM adapter", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads tagName, attributes, and bounding rect from a real element", () => {
    const el = document.createElement("div");
    el.id = "test";
    el.setAttribute("data-vc-source", "src/App.tsx:5");
    document.body.appendChild(el);

    const adapter = createBrowserDomAdapter();
    const data = adapter.getElementData(el);

    expect(data.tagName).toBe("div");
    expect(data.attributes["data-vc-source"]).toBe("src/App.tsx:5");
    expect(data.boundingRect.width).toBe(0);
    expect(data.boundingRect.height).toBe(0);
  });
});
