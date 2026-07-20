/**
 * DOM helpers for the Auto Layout overlay chrome (selects, fields, CSS).
 */

import {
  AUTO_LAYOUT_ALIGN_CROSS,
  AUTO_LAYOUT_ALIGN_MAIN,
  AUTO_LAYOUT_DIRECTIONS,
  AUTO_LAYOUT_WRAP,
  type AutoLayoutAlignCross,
  type AutoLayoutAlignMain,
  type AutoLayoutDirection,
  type AutoLayoutWrap,
  type PaddingMode,
} from "@vision-control/layout-engine";

export const OVERLAY_CLASS = "vc-auto-layout";
export const HEADER_DRAGGING_CLASS = "vc-auto-layout__header--dragging";

export function createField(doc: Document, labelText: string, control: HTMLElement): HTMLElement {
  const field = doc.createElement("div");
  field.className = "vc-auto-layout__field";
  const label = doc.createElement("span");
  label.className = "vc-auto-layout__label";
  label.textContent = labelText;
  const wrap = doc.createElement("div");
  wrap.className = "vc-auto-layout__control";
  wrap.appendChild(control);
  field.appendChild(label);
  field.appendChild(wrap);
  return field;
}

export function createSelect<T extends string>(
  doc: Document,
  options: readonly T[],
  value: T,
  testId: string,
  onChange: (value: T) => void,
): HTMLSelectElement {
  const select = doc.createElement("select");
  select.className = "vc-auto-layout__select";
  select.setAttribute("data-testid", testId);
  for (const opt of options) {
    const option = doc.createElement("option");
    option.value = opt;
    option.textContent = opt;
    if (opt === value) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    onChange(select.value as T);
  });
  return select;
}

export function createTextInput(
  doc: Document,
  value: string,
  placeholder: string,
  testId: string,
): HTMLInputElement {
  const input = doc.createElement("input");
  input.type = "text";
  input.className = "vc-auto-layout__input";
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute("data-testid", testId);
  return input;
}

export function createNumberInput(doc: Document, value: number, testId: string): HTMLInputElement {
  const input = doc.createElement("input");
  input.type = "number";
  input.min = "0";
  input.className = "vc-auto-layout__input";
  input.value = String(value);
  input.setAttribute("data-testid", testId);
  return input;
}

export function createApplyButton(
  doc: Document,
  testId: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "vc-auto-layout__btn";
  button.textContent = "Apply";
  button.setAttribute("data-testid", testId);
  button.addEventListener("click", onClick);
  return button;
}

export function createDirectionSelect(
  doc: Document,
  value: AutoLayoutDirection,
  onChange: (value: AutoLayoutDirection) => void,
): HTMLSelectElement {
  return createSelect(
    doc,
    AUTO_LAYOUT_DIRECTIONS,
    value,
    "auto-layout-overlay-direction",
    onChange,
  );
}

export function createAlignMainSelect(
  doc: Document,
  value: AutoLayoutAlignMain,
  onChange: (value: AutoLayoutAlignMain) => void,
): HTMLSelectElement {
  return createSelect(
    doc,
    AUTO_LAYOUT_ALIGN_MAIN,
    value,
    "auto-layout-overlay-align-main",
    onChange,
  );
}

export function createAlignCrossSelect(
  doc: Document,
  value: AutoLayoutAlignCross,
  onChange: (value: AutoLayoutAlignCross) => void,
): HTMLSelectElement {
  return createSelect(
    doc,
    AUTO_LAYOUT_ALIGN_CROSS,
    value,
    "auto-layout-overlay-align-cross",
    onChange,
  );
}

export function createWrapSelect(
  doc: Document,
  value: AutoLayoutWrap,
  onChange: (value: AutoLayoutWrap) => void,
): HTMLSelectElement {
  return createSelect(doc, AUTO_LAYOUT_WRAP, value, "auto-layout-overlay-wrap", onChange);
}

export function createPaddingModeSelect(
  doc: Document,
  value: PaddingMode,
  onChange: (value: PaddingMode) => void,
): HTMLSelectElement {
  return createSelect(
    doc,
    ["all", "horizontal", "vertical", "individual"] as const,
    value,
    "auto-layout-overlay-padding-mode",
    onChange,
  );
}

export function createChildIntentSelect(
  doc: Document,
  value: "hug" | "fill" | "fixed",
  onChange: (value: "hug" | "fill" | "fixed") => void,
): HTMLSelectElement {
  return createSelect(
    doc,
    ["hug", "fill", "fixed"] as const,
    value,
    "auto-layout-overlay-child-intent",
    onChange,
  );
}

export function isAutoLayoutDirection(value: string): value is AutoLayoutDirection {
  return (AUTO_LAYOUT_DIRECTIONS as readonly string[]).includes(value);
}

export function isAutoLayoutAlignMain(value: string): value is AutoLayoutAlignMain {
  return (AUTO_LAYOUT_ALIGN_MAIN as readonly string[]).includes(value);
}

export function isAutoLayoutAlignCross(value: string): value is AutoLayoutAlignCross {
  return (AUTO_LAYOUT_ALIGN_CROSS as readonly string[]).includes(value);
}

export function isAutoLayoutWrap(value: string): value is AutoLayoutWrap {
  return (AUTO_LAYOUT_WRAP as readonly string[]).includes(value);
}
