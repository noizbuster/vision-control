import type { AutoLayoutContainerContext, PaddingMode } from "@vision-control/layout-engine";

import type { AutoLayoutElementRef } from "../components/inspector/auto-layout-operations.js";
import {
  createAlignCrossSelect,
  createAlignMainSelect,
  createApplyButton,
  createChildIntentSelect,
  createField,
  createNumberInput,
  createPaddingModeSelect,
  createTextInput,
  createWrapSelect,
} from "./auto-layout-overlay-dom.js";
import type { ApplyAutoLayoutCommand, OverlaySeed } from "./auto-layout-overlay-panel.js";

export function appendPaddingSection(
  doc: Document,
  root: HTMLElement,
  seed: OverlaySeed,
  getMode: () => PaddingMode,
  setMode: (mode: PaddingMode) => void,
  applyCommand: ApplyAutoLayoutCommand,
  container: AutoLayoutContainerContext,
): void {
  const paddingInput = createTextInput(
    doc,
    seed.padding,
    "e.g. 8px",
    "auto-layout-overlay-padding",
  );
  const padTop = createTextInput(doc, seed.paddingTop, "top", "auto-layout-overlay-padding-top");
  const padRight = createTextInput(
    doc,
    seed.paddingRight,
    "right",
    "auto-layout-overlay-padding-right",
  );
  const padBottom = createTextInput(
    doc,
    seed.paddingBottom,
    "bottom",
    "auto-layout-overlay-padding-bottom",
  );
  const padLeft = createTextInput(
    doc,
    seed.paddingLeft,
    "left",
    "auto-layout-overlay-padding-left",
  );
  const individualHost = doc.createElement("div");
  individualHost.className = "vc-auto-layout__control";
  individualHost.style.display = "none";
  individualHost.append(padTop, padRight, padBottom, padLeft);

  const paddingModeSelect = createPaddingModeSelect(doc, getMode(), (mode) => {
    setMode(mode);
    individualHost.style.display = mode === "individual" ? "" : "none";
    paddingInput.style.display = mode === "individual" ? "none" : "";
  });
  const paddingRow = doc.createElement("div");
  paddingRow.className = "vc-auto-layout__control";
  paddingRow.append(
    paddingModeSelect,
    paddingInput,
    individualHost,
    createApplyButton(doc, "auto-layout-overlay-padding-apply", () => {
      const paddingMode = getMode();
      if (paddingMode === "individual") {
        const sides: Partial<Record<"top" | "right" | "bottom" | "left", string>> = {};
        if (padTop.value.trim() !== "") sides.top = padTop.value.trim();
        if (padRight.value.trim() !== "") sides.right = padRight.value.trim();
        if (padBottom.value.trim() !== "") sides.bottom = padBottom.value.trim();
        if (padLeft.value.trim() !== "") sides.left = padLeft.value.trim();
        applyCommand(
          { kind: "set-padding", mode: "individual", value: "", sides },
          container,
          seed.previousValues,
        );
        return;
      }
      applyCommand(
        { kind: "set-padding", mode: paddingMode, value: paddingInput.value },
        container,
        seed.previousValues,
      );
    }),
  );
  root.appendChild(createField(doc, "Padding", paddingRow));
}

export function appendFlexAlignSection(
  doc: Document,
  root: HTMLElement,
  seed: OverlaySeed,
  isFlex: boolean,
  applyCommand: ApplyAutoLayoutCommand,
  container: AutoLayoutContainerContext,
): void {
  if (!isFlex) return;
  root.appendChild(
    createField(
      doc,
      "Main Align",
      createAlignMainSelect(doc, seed.alignMain, (value) => {
        applyCommand({ kind: "set-align-main", value }, container, seed.previousValues);
      }),
    ),
  );
  root.appendChild(
    createField(
      doc,
      "Cross Align",
      createAlignCrossSelect(doc, seed.alignCross, (value) => {
        applyCommand({ kind: "set-align-cross", value }, container, seed.previousValues);
      }),
    ),
  );
  root.appendChild(
    createField(
      doc,
      "Wrap",
      createWrapSelect(doc, seed.wrap, (value) => {
        applyCommand({ kind: "set-wrap", value }, container, seed.previousValues);
      }),
    ),
  );
}

export function appendChildSizingSection(
  doc: Document,
  root: HTMLElement,
  element: Element,
  getIntent: () => "hug" | "fill" | "fixed",
  setIntent: (intent: "hug" | "fill" | "fixed") => void,
  applyCommand: ApplyAutoLayoutCommand,
  container: AutoLayoutContainerContext,
  childRefAt: (element: Element, index: number) => AutoLayoutElementRef | undefined,
  previousValues: Readonly<Record<string, string>>,
): void {
  const childIndexInput = createNumberInput(doc, 0, "auto-layout-overlay-child-index");
  const childValueInput = createTextInput(doc, "", "e.g. 200px", "auto-layout-overlay-child-value");
  childValueInput.style.display = "none";
  const childIntentSelect = createChildIntentSelect(doc, getIntent(), (intent) => {
    setIntent(intent);
    childValueInput.style.display = intent === "fixed" ? "" : "none";
  });
  const childRow = doc.createElement("div");
  childRow.className = "vc-auto-layout__control";
  childRow.append(
    childIndexInput,
    childIntentSelect,
    childValueInput,
    createApplyButton(doc, "auto-layout-overlay-child-apply", () => {
      const childIndex = Number(childIndexInput.value) || 0;
      const childIntent = getIntent();
      applyCommand(
        {
          kind: "set-child-sizing",
          childIndex,
          intent: childIntent,
          ...(childIntent === "fixed" && childValueInput.value.trim() !== ""
            ? { value: childValueInput.value.trim() }
            : {}),
        },
        container,
        previousValues,
        childRefAt(element, childIndex),
      );
    }),
  );
  root.appendChild(createField(doc, "Child Sizing", childRow));
}
