import { describe, expect, it } from "vitest";
import {
  clearHighlight,
  createDropTargetHighlighter,
  highlightDropTarget,
} from "./drop-target-highlight.js";
import { attachOverlayRoot } from "./index.js";

describe("createDropTargetHighlighter", () => {
  it("shows green highlight for valid target", () => {
    const { shadowRoot } = attachOverlayRoot(document);
    const highlighter = createDropTargetHighlighter(shadowRoot);

    highlighter.highlight({ rect: { x: 10, y: 20, width: 100, height: 80 }, validity: "valid" });

    const highlight = shadowRoot.querySelector(".vc-drop-target-highlight");
    expect(highlight).not.toBeNull();
    expect(highlight?.classList.contains("vc-drop-target-highlight--invalid")).toBe(false);
    expect((highlight as HTMLElement).style.display).toBe("block");
    expect((highlight as HTMLElement).style.width).toBe("100px");
  });

  it("shows red highlight and warning icon for invalid target", () => {
    const { shadowRoot } = attachOverlayRoot(document);
    const highlighter = createDropTargetHighlighter(shadowRoot);

    highlighter.highlight({
      rect: { x: 10, y: 20, width: 100, height: 80 },
      validity: "invalid",
      warning: "INVALID_DROP_TARGET",
    });

    const highlight = shadowRoot.querySelector(".vc-drop-target-highlight");
    expect(highlight?.classList.contains("vc-drop-target-highlight--invalid")).toBe(true);

    const warning = shadowRoot.querySelector(".vc-drop-warning");
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain("INVALID_DROP_TARGET");
    expect((warning as HTMLElement).style.display).toBe("inline-flex");

    const icon = warning?.querySelector("svg");
    expect(icon).not.toBeNull();
  });

  it("clears highlight and warning", () => {
    const { shadowRoot } = attachOverlayRoot(document);
    const highlighter = createDropTargetHighlighter(shadowRoot);

    highlighter.highlight({
      rect: { x: 10, y: 20, width: 100, height: 80 },
      validity: "invalid",
      warning: "blocked",
    });
    highlighter.clear();

    const highlight = shadowRoot.querySelector(".vc-drop-target-highlight") as HTMLElement;
    const warning = shadowRoot.querySelector(".vc-drop-warning") as HTMLElement;
    expect(highlight.style.display).toBe("none");
    expect(warning.style.display).toBe("none");
    expect(warning.children).toHaveLength(0);
  });

  it("escapes warning text", () => {
    const { shadowRoot } = attachOverlayRoot(document);
    const highlighter = createDropTargetHighlighter(shadowRoot);

    highlighter.highlight({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      validity: "invalid",
      warning: "<script>alert(1)</script>",
    });

    const warning = shadowRoot.querySelector(".vc-drop-warning");
    expect(warning?.innerHTML).not.toContain("<script>");
  });
});

describe("highlightDropTarget / clearHighlight", () => {
  it("shares a singleton highlighter per shadow root", () => {
    const { shadowRoot } = attachOverlayRoot(document);

    highlightDropTarget(shadowRoot, { x: 5, y: 5, width: 50, height: 50 }, "valid");
    clearHighlight(shadowRoot);

    const highlight = shadowRoot.querySelector(".vc-drop-target-highlight") as HTMLElement;
    expect(highlight.style.display).toBe("none");
  });
});
