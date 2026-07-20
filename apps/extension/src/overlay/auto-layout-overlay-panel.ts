import type {
  AutoLayoutAlignCross,
  AutoLayoutAlignMain,
  AutoLayoutCommand,
  AutoLayoutContainerContext,
  AutoLayoutDirection,
  AutoLayoutWrap,
  PaddingMode,
} from "@vision-control/layout-engine";
import type { FlexGridAxis } from "@vision-control/overlay-ui";

import type { AutoLayoutElementRef } from "../components/inspector/auto-layout-operations.js";
import { deriveAutoLayoutContainerContext } from "../components/inspector/auto-layout-operations.js";
import { attachGapGesture, type GapGesture, readGapPx } from "./auto-layout-gap-gesture.js";
import {
  createApplyButton,
  createDirectionSelect,
  createField,
  createTextInput,
  HEADER_DRAGGING_CLASS,
  isAutoLayoutAlignCross,
  isAutoLayoutAlignMain,
  isAutoLayoutDirection,
  isAutoLayoutWrap,
} from "./auto-layout-overlay-dom.js";
import {
  appendChildSizingSection,
  appendFlexAlignSection,
  appendPaddingSection,
} from "./auto-layout-overlay-fields.js";
import { makeDraggableFixedPanel } from "./draggable-panel.js";

export interface OverlaySeed {
  readonly direction: AutoLayoutDirection;
  readonly gap: string;
  readonly padding: string;
  readonly paddingTop: string;
  readonly paddingRight: string;
  readonly paddingBottom: string;
  readonly paddingLeft: string;
  readonly alignMain: AutoLayoutAlignMain;
  readonly alignCross: AutoLayoutAlignCross;
  readonly wrap: AutoLayoutWrap;
  readonly previousValues: Readonly<Record<string, string>>;
  readonly gapPx: number;
}

export function seedFromComputed(computed: CSSStyleDeclaration): OverlaySeed {
  const directionRaw = computed.flexDirection || "row";
  const direction = isAutoLayoutDirection(directionRaw) ? directionRaw : "row";
  const alignMainRaw = computed.justifyContent || "flex-start";
  const alignMain = isAutoLayoutAlignMain(alignMainRaw) ? alignMainRaw : "flex-start";
  const alignCrossRaw = computed.alignItems || "stretch";
  const alignCross = isAutoLayoutAlignCross(alignCrossRaw) ? alignCrossRaw : "stretch";
  const wrapRaw = computed.flexWrap || "nowrap";
  const wrap = isAutoLayoutWrap(wrapRaw) ? wrapRaw : "nowrap";
  const gap = computed.gap || "0px";
  return {
    direction,
    gap,
    padding: computed.padding || "0px",
    paddingTop: computed.paddingTop || "0px",
    paddingRight: computed.paddingRight || "0px",
    paddingBottom: computed.paddingBottom || "0px",
    paddingLeft: computed.paddingLeft || "0px",
    alignMain,
    alignCross,
    wrap,
    gapPx: readGapPx(computed),
    previousValues: {
      "flex-direction": directionRaw,
      gap,
      padding: computed.padding || "0px",
      "padding-top": computed.paddingTop || "0px",
      "padding-right": computed.paddingRight || "0px",
      "padding-bottom": computed.paddingBottom || "0px",
      "padding-left": computed.paddingLeft || "0px",
      "justify-content": alignMainRaw,
      "align-items": alignCrossRaw,
      "flex-wrap": wrapRaw,
    },
  };
}

export type ApplyAutoLayoutCommand = (
  command: AutoLayoutCommand,
  container: AutoLayoutContainerContext,
  previousValues: Readonly<Record<string, string>>,
  childRef?: AutoLayoutElementRef,
) => void;

export interface RenderSupportedPanelInput {
  readonly document: Document;
  readonly root: HTMLElement;
  readonly element: Element;
  readonly axisHost: HTMLElement;
  readonly axis: FlexGridAxis;
  readonly applyCommand: ApplyAutoLayoutCommand;
  readonly childRefAt: (element: Element, index: number) => AutoLayoutElementRef | undefined;
  readonly trackCleanup: (cleanup: () => void) => void;
  readonly setGapGesture: (gesture: GapGesture | null) => void;
  readonly embedded?: boolean;
  readonly onRole?: (role: string) => void;
}

export type AppendAutoLayoutControlsInput = RenderSupportedPanelInput;

export function appendAutoLayoutControls(input: AppendAutoLayoutControlsInput): boolean {
  return renderSupportedPanel(input);
}

export function renderSupportedPanel(input: RenderSupportedPanelInput): boolean {
  const {
    document: doc,
    root,
    element,
    axisHost,
    axis,
    applyCommand,
    childRefAt,
    trackCleanup,
    setGapGesture,
    embedded = false,
    onRole,
  } = input;
  const computed = doc.defaultView?.getComputedStyle(element);
  if (computed === undefined) return false;

  const container = deriveAutoLayoutContainerContext(computed.display, computed.flexDirection);
  const seed = seedFromComputed(computed);
  const isFlex = container.layoutRole === "flex-container";
  onRole?.(container.layoutRole);

  if (!embedded) {
    const header = doc.createElement("div");
    header.className = "vc-auto-layout__header";
    const title = doc.createElement("span");
    title.className = "vc-auto-layout__title";
    title.textContent = "Auto Layout";
    const role = doc.createElement("span");
    role.className = "vc-auto-layout__role";
    role.textContent = container.layoutRole;
    header.append(title, role);
    trackCleanup(
      makeDraggableFixedPanel({
        panel: root,
        handle: header,
        draggingClassName: HEADER_DRAGGING_CLASS,
      }).dispose,
    );
    root.appendChild(header);
  }

  let paddingMode: PaddingMode = "all";
  let childIntent: "hug" | "fill" | "fixed" = "hug";

  if (isFlex) {
    root.appendChild(
      createField(
        doc,
        "Direction",
        createDirectionSelect(doc, seed.direction, (direction) => {
          applyCommand({ kind: "set-direction", direction }, container, seed.previousValues);
        }),
      ),
    );
  }

  const gapInput = createTextInput(doc, seed.gap, "e.g. 12px", "auto-layout-overlay-gap");
  const gapRow = doc.createElement("div");
  gapRow.className = "vc-auto-layout__control";
  gapRow.append(
    gapInput,
    createApplyButton(doc, "auto-layout-overlay-gap-apply", () => {
      applyCommand({ kind: "set-gap", value: gapInput.value }, container, seed.previousValues);
    }),
  );
  root.appendChild(createField(doc, "Gap", gapRow));
  appendPaddingSection(
    doc,
    root,
    seed,
    () => paddingMode,
    (mode) => {
      paddingMode = mode;
    },
    applyCommand,
    container,
  );
  appendFlexAlignSection(doc, root, seed, isFlex, applyCommand, container);
  appendChildSizingSection(
    doc,
    root,
    element,
    () => childIntent,
    (intent) => {
      childIntent = intent;
    },
    applyCommand,
    container,
    childRefAt,
    seed.previousValues,
  );

  const rect = element.getBoundingClientRect();
  axis.setAxis({
    rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    kind: isFlex ? "flex" : "grid",
    direction: seed.direction.startsWith("column") ? "vertical" : "horizontal",
  });

  const htmlEl = element instanceof HTMLElement ? element : null;
  setGapGesture(
    attachGapGesture({
      document: doc,
      container: element,
      host: axisHost,
      initialGapPx: seed.gapPx,
      onPreview: (gapPx) => {
        gapInput.value = `${gapPx}px`;
        if (htmlEl !== null) htmlEl.style.gap = `${gapPx}px`;
      },
      onCommit: (gapPx) => {
        if (htmlEl !== null) htmlEl.style.gap = "";
        gapInput.value = `${gapPx}px`;
        applyCommand({ kind: "set-gap", value: `${gapPx}px` }, container, seed.previousValues);
      },
    }),
  );

  if (!embedded) {
    root.style.display = "";
  }
  return true;
}
