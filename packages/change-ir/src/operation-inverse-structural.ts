import { inverseBase } from "./operation-inverse-base.js";
import type { Operation } from "./operations/index.js";

type StructuralOperation = Extract<
  Operation,
  {
    kind:
      | "insert-element"
      | "remove-element"
      | "duplicate-element"
      | "wrap-elements"
      | "unwrap-element";
  }
>;

export const invertStructuralOperation = (operation: StructuralOperation): Operation => {
  const base = inverseBase(operation);
  switch (operation.kind) {
    case "insert-element":
      return {
        ...base,
        kind: "remove-element",
        confidence: operation.confidence,
        element: operation.element,
        parent: operation.parent,
        index: operation.index,
        tagName: operation.tagName,
        ...(operation.attributes !== undefined ? { attributes: operation.attributes } : {}),
      };
    case "remove-element":
      return {
        ...base,
        kind: "insert-element",
        confidence: operation.confidence,
        element: operation.element,
        parent: operation.parent,
        index: operation.index,
        tagName: operation.tagName,
        ...(operation.attributes !== undefined ? { attributes: operation.attributes } : {}),
      };
    case "duplicate-element":
      return {
        ...base,
        kind: "remove-element",
        confidence: operation.confidence,
        element: operation.duplicate,
        parent: operation.parent,
        index: operation.index,
        tagName: operation.tagName,
      };
    case "wrap-elements":
      return {
        ...base,
        kind: "unwrap-element",
        confidence: operation.confidence,
        wrapper: operation.wrapper,
        parent: operation.parent,
        tagName: operation.tagName,
        targets: operation.targets,
      };
    case "unwrap-element":
      return {
        ...base,
        kind: "wrap-elements",
        confidence: operation.confidence,
        targets: operation.targets,
        wrapper: operation.wrapper,
        parent: operation.parent,
        tagName: operation.tagName,
      };
    default: {
      const exhaustive: never = operation;
      throw new Error(`invertStructuralOperation: unhandled kind ${JSON.stringify(exhaustive)}`);
    }
  }
};
