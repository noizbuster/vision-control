import { inverseBase } from "./operation-inverse-base.js";
import type { Operation } from "./operations/index.js";

type StyleOperation = Extract<
  Operation,
  {
    kind:
      | "style-edit"
      | "remove-style"
      | "class-add"
      | "class-remove"
      | "class-replace"
      | "set-attribute"
      | "set-component-prop"
      | "text-edit"
      | "pseudo-style-edit"
      | "position-element"
      | "resize-element"
      | "resize-flex-pair";
  }
>;

export const invertStyleOperation = (operation: StyleOperation): Operation => {
  const base = inverseBase(operation);
  switch (operation.kind) {
    case "style-edit":
      return {
        ...base,
        kind: "style-edit",
        confidence: operation.confidence,
        target: operation.target,
        property: operation.property,
        value: operation.previousValue ?? "",
        important: operation.important,
        previousValue: operation.value,
      };
    case "remove-style":
      return {
        ...base,
        kind: "style-edit",
        confidence: operation.confidence,
        target: operation.target,
        property: operation.property,
        value: operation.previousValue ?? "",
        important: operation.important ?? false,
        previousValue: operation.previousValue ?? "",
      };
    case "class-add":
      return {
        ...base,
        kind: "class-remove",
        confidence: operation.confidence,
        target: operation.target,
        className: operation.className,
      };
    case "class-remove":
      return {
        ...base,
        kind: "class-add",
        confidence: operation.confidence,
        target: operation.target,
        className: operation.className,
      };
    case "class-replace":
      return {
        ...base,
        kind: "class-replace",
        confidence: operation.confidence,
        target: operation.target,
        oldClassName: operation.newClassName,
        newClassName: operation.oldClassName,
      };
    case "set-attribute":
      return {
        ...base,
        kind: "set-attribute",
        confidence: operation.confidence,
        target: operation.target,
        name: operation.name,
        value: operation.previousValue ?? "",
        previousValue: operation.value,
      };
    case "set-component-prop":
      return {
        ...base,
        kind: "set-component-prop",
        confidence: operation.confidence,
        target: operation.target,
        componentName: operation.componentName,
        propName: operation.propName,
        value: operation.previousValue ?? "",
        previousValue: operation.value,
        sourceRange: operation.sourceRange,
      };
    case "text-edit":
      return {
        ...base,
        kind: "text-edit",
        confidence: operation.confidence,
        target: operation.target,
        newText: operation.previousText ?? "",
        previousText: operation.newText,
      };
    case "pseudo-style-edit":
      return {
        ...base,
        kind: "pseudo-style-edit",
        confidence: operation.confidence,
        target: operation.target,
        pseudoTarget: operation.pseudoTarget,
        property: operation.property,
        value: operation.previousValue ?? "",
        important: operation.important,
        previousValue: operation.value,
      };
    case "position-element":
      return {
        ...base,
        kind: "position-element",
        confidence: operation.confidence,
        target: operation.target,
        property: operation.property,
        fromValue: operation.toValue,
        toValue: operation.fromValue,
      };
    case "resize-element":
      return {
        ...base,
        kind: "resize-element",
        confidence: operation.confidence,
        element: operation.element,
        property: operation.property,
        fromValue: operation.toValue,
        toValue: operation.fromValue,
        unit: operation.unit,
      };
    case "resize-flex-pair":
      return {
        ...base,
        kind: "resize-flex-pair",
        confidence: operation.confidence,
        target: operation.target,
        container: operation.container,
        members: [
          {
            ...operation.members[0],
            before: operation.members[0].after,
            after: operation.members[0].before,
          },
          {
            ...operation.members[1],
            before: operation.members[1].after,
            after: operation.members[1].before,
          },
        ],
        containerWitness: {
          before: operation.containerWitness.after,
          after: operation.containerWitness.before,
        },
        witnesses: operation.witnesses.map((witness) => ({
          ...witness,
          before: witness.after,
          after: witness.before,
        })),
        axis: operation.axis,
        delta: -operation.delta,
      };
    default: {
      const exhaustive: never = operation;
      throw new Error(`invertStyleOperation: unhandled kind ${JSON.stringify(exhaustive)}`);
    }
  }
};
