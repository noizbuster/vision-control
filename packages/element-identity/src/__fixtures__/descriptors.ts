import type { ElementDescriptor } from "../selectors.js";

/**
 * Element backed by a source marker (data-vc-source). Selector strategy #1.
 */
export const sourceMarkedDescriptor: ElementDescriptor = {
  tagName: "button",
  id: "submit",
  className: "btn btn-primary",
  attributes: { "data-vc-source": "s_button_submit" },
  ancestry: [{ tagName: "div", id: "form" }],
};

/** Element with an id but no source marker. Selector strategy #2. */
export const idOnlyDescriptor: ElementDescriptor = {
  tagName: "input",
  id: "email-field",
  className: "",
  ancestry: [{ tagName: "form" }],
};

/** Element with stable classes but no id/marker. Selector strategy #3. */
export const stableClassDescriptor: ElementDescriptor = {
  tagName: "span",
  className: "badge badge-pill",
  ancestry: [{ tagName: "div" }],
};

/**
 * Element whose only classes are volatile (CSS-modules hash, emotion). Falls
 * through to the nth-child ancestry path. Selector strategy #4.
 */
export const volatileOnlyDescriptor: ElementDescriptor = {
  tagName: "li",
  className: "card__abc12345 css-1xyz9",
  nthChild: 3,
  ancestry: [
    { tagName: "section", nthChild: 2 },
    { tagName: "ul", nthChild: 1 },
  ],
};

/** Repeated list-item descriptor (two instances, same source id). */
export const listItemDescriptor = (runtimeSuffix: string): ElementDescriptor => ({
  tagName: "li",
  className: "todo-item",
  attributes: { "data-vc-source": "s_todo_item" },
  ancestry: [{ tagName: "ul", id: "todo-list" }],
  nthChild: runtimeSuffix === "a" ? 1 : 2,
});
