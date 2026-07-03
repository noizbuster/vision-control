import { createMultiSelectGroup } from "@vision-control/editor-core";
import type { MultiSelectMember } from "@vision-control/element-identity";
import { createMultiSelectGroupId } from "@vision-control/element-identity";
import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, createMultiSelectOverlay, type MultiSelectOverlay } from "./index.js";

const member = (
  runtimeId: string,
  additions: Partial<Omit<MultiSelectMember, "runtimeId">> = {},
): MultiSelectMember => ({
  runtimeId,
  tagName: "div",
  frameId: "main",
  frameKind: "top",
  shadowKind: "light-dom",
  ...additions,
});

const buildGroup = () => {
  const result = createMultiSelectGroup({
    id: createMultiSelectGroupId("grp-overlay-1"),
    members: [member("r1"), member("r2"), member("r3")],
    memberRects: [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 120, y: 0, width: 100, height: 50 },
      { x: 240, y: 0, width: 100, height: 50 },
    ],
    parentChains: [
      [{ runtimeId: "body", tagName: "body" }],
      [{ runtimeId: "body", tagName: "body" }],
      [{ runtimeId: "body", tagName: "body" }],
    ],
  });
  if (!result.ok) throw new Error("expected group to build");
  return result.group;
};

describe("multi-select overlay rendering", () => {
  let overlay: ReturnType<typeof attachOverlayRoot>;
  let multi: MultiSelectOverlay;

  afterEach(() => {
    multi?.clear();
    overlay?.unmount();
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "";
  });

  it("renders one member outline per member at its rect", () => {
    overlay = attachOverlayRoot();
    multi = createMultiSelectOverlay(overlay.shadowRoot);
    const group = buildGroup();

    multi.setGroup(group, [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 120, y: 0, width: 100, height: 50 },
      { x: 240, y: 0, width: 100, height: 50 },
    ]);

    const outlines = overlay.shadowRoot.querySelectorAll(".vc-multi-member-outline");
    expect(outlines.length).toBe(3);
    const first = outlines[0] as HTMLElement;
    expect(first.style.left).toBe("0px");
    expect(first.style.width).toBe("100px");
  });

  it("renders a group bounding outline at the computed bounding rect", () => {
    overlay = attachOverlayRoot();
    multi = createMultiSelectOverlay(overlay.shadowRoot);
    const group = buildGroup();

    multi.setGroup(group, [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 120, y: 0, width: 100, height: 50 },
      { x: 240, y: 0, width: 100, height: 50 },
    ]);

    const bounding = overlay.shadowRoot.querySelector(".vc-multi-group-outline") as HTMLElement;
    expect(bounding).not.toBeNull();
    // bounding box: x=0,y=0,w=340,h=50
    expect(bounding.style.left).toBe("0px");
    expect(bounding.style.width).toBe("340px");
  });

  it("renders resize handles around the group bounding rect", () => {
    overlay = attachOverlayRoot();
    multi = createMultiSelectOverlay(overlay.shadowRoot);
    const group = buildGroup();

    multi.setGroup(group, [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 120, y: 0, width: 100, height: 50 },
    ]);

    const handles = overlay.shadowRoot.querySelectorAll(".vc-handle");
    expect(handles.length).toBe(8);
  });

  it("clear removes all member outlines, the group outline, and handles", () => {
    overlay = attachOverlayRoot();
    multi = createMultiSelectOverlay(overlay.shadowRoot);
    const group = buildGroup();
    multi.setGroup(group, [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 120, y: 0, width: 100, height: 50 },
    ]);

    multi.clear();

    expect(overlay.shadowRoot.querySelectorAll(".vc-multi-member-outline").length).toBe(0);
    const groupOutline = overlay.shadowRoot.querySelector(".vc-multi-group-outline") as HTMLElement;
    expect(groupOutline.style.display).toBe("none");
    expect(overlay.shadowRoot.querySelectorAll(".vc-handle").length).toBe(0);
  });

  it("setGroup with null hides everything", () => {
    overlay = attachOverlayRoot();
    multi = createMultiSelectOverlay(overlay.shadowRoot);
    const group = buildGroup();
    multi.setGroup(group, [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 120, y: 0, width: 100, height: 50 },
    ]);

    multi.setGroup(null, []);

    expect(overlay.shadowRoot.querySelectorAll(".vc-multi-member-outline").length).toBe(0);
    expect(overlay.shadowRoot.querySelectorAll(".vc-handle").length).toBe(0);
  });

  it("re-renders when the member set changes (replaces outlines)", () => {
    overlay = attachOverlayRoot();
    multi = createMultiSelectOverlay(overlay.shadowRoot);
    multi.setGroup(buildGroup(), [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 120, y: 0, width: 100, height: 50 },
      { x: 240, y: 0, width: 100, height: 50 },
    ]);
    expect(overlay.shadowRoot.querySelectorAll(".vc-multi-member-outline").length).toBe(3);

    const twoResult = createMultiSelectGroup({
      id: createMultiSelectGroupId("grp-overlay-2"),
      members: [member("a"), member("b")],
      memberRects: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 0, width: 10, height: 10 },
      ],
      parentChains: [[{ runtimeId: "p", tagName: "div" }], [{ runtimeId: "p", tagName: "div" }]],
    });
    if (!twoResult.ok) throw new Error("expected group");
    multi.setGroup(twoResult.group, [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 0, width: 10, height: 10 },
    ]);

    expect(overlay.shadowRoot.querySelectorAll(".vc-multi-member-outline").length).toBe(2);
  });
});
