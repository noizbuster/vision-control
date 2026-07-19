import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { computeInverse, type Operation } from "./index.js";
import { arbByKind } from "./property-arbitraries/index.js";

type StateModel = {
  readonly styles: Readonly<Record<string, string>>;
  readonly classes: readonly string[];
  readonly text: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly position: string;
};

const emptyState = (): StateModel => ({
  styles: {},
  classes: [],
  text: "",
  attributes: {},
  position: "",
});

const initialState = (operation: Operation): StateModel => {
  const empty = emptyState();
  switch (operation.kind) {
    case "style-edit":
    case "remove-style":
      return { ...empty, styles: { [operation.property]: operation.previousValue ?? "" } };
    case "set-attribute":
      return { ...empty, attributes: { [operation.name]: operation.previousValue ?? "" } };
    case "set-component-prop":
      return { ...empty, attributes: { [operation.propName]: operation.previousValue ?? "" } };
    case "text-edit":
      return { ...empty, text: operation.previousText ?? "" };
    case "resize-element":
      return { ...empty, styles: { [operation.property]: operation.fromValue } };
    case "position-element":
      return { ...empty, position: operation.fromValue };
    case "class-add":
      return empty;
    case "class-remove":
      return { ...empty, classes: [operation.className] };
    case "class-replace":
      return { ...empty, classes: [operation.oldClassName] };
    default:
      return empty;
  }
};

const applyOperation = (state: StateModel, operation: Operation): StateModel => {
  switch (operation.kind) {
    case "style-edit":
      return { ...state, styles: { ...state.styles, [operation.property]: operation.value } };
    case "remove-style": {
      const styles = { ...state.styles };
      delete styles[operation.property];
      return { ...state, styles };
    }
    case "class-add":
      return { ...state, classes: [...new Set([...state.classes, operation.className])].sort() };
    case "class-remove":
      return { ...state, classes: state.classes.filter((name) => name !== operation.className) };
    case "class-replace":
      return {
        ...state,
        classes: [
          ...new Set([
            ...state.classes.filter((name) => name !== operation.oldClassName),
            operation.newClassName,
          ]),
        ].sort(),
      };
    case "set-attribute":
      return {
        ...state,
        attributes: { ...state.attributes, [operation.name]: operation.value },
      };
    case "set-component-prop":
      return {
        ...state,
        attributes: { ...state.attributes, [operation.propName]: operation.value },
      };
    case "text-edit":
      return { ...state, text: operation.newText };
    case "resize-element":
      return { ...state, styles: { ...state.styles, [operation.property]: operation.toValue } };
    case "position-element":
      return { ...state, position: operation.toValue };
    default:
      return state;
  }
};

const STATEFUL_KINDS = [
  "style-edit",
  "remove-style",
  "class-add",
  "class-remove",
  "class-replace",
  "set-attribute",
  "set-component-prop",
  "text-edit",
  "resize-element",
  "position-element",
] as const;

describe("operation state restoration", () => {
  it.each(STATEFUL_KINDS)("restores generated %s state after its inverse", (kind) => {
    fc.assert(
      fc.property(arbByKind[kind], (operation) => {
        const initial = initialState(operation);
        const after = applyOperation(initial, operation);
        expect(applyOperation(after, computeInverse(operation))).toEqual(initial);
      }),
      { numRuns: 100 },
    );
  });
});
