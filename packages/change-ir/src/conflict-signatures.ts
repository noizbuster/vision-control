import type { Operation } from "./operations/index.js";

export const FLEX_PAIR_CSS_PROPERTIES = ["flex-grow", "flex-shrink", "flex-basis"] as const;

const cssSignature = (runtimeId: string, property: string): string =>
  `css:${runtimeId}:${property}`;

export const conflictSignatures = (operation: Operation): readonly string[] => {
  switch (operation.kind) {
    case "style-edit":
    case "remove-style":
      return [cssSignature(operation.target.runtimeId, operation.property)];
    case "resize-element":
      return [cssSignature(operation.element.runtimeId, operation.property)];
    case "resize-flex-pair":
      return operation.members.flatMap((member) =>
        FLEX_PAIR_CSS_PROPERTIES.map((property) =>
          cssSignature(member.element.runtimeId, property),
        ),
      );
    case "text-edit":
      return [`text:${operation.target.runtimeId}`];
    case "class-add":
    case "class-remove":
      return [`class:${operation.target.runtimeId}:${operation.className}`];
    case "class-replace":
      return [`class:${operation.target.runtimeId}:${operation.oldClassName}`];
    case "set-attribute":
      return [`attribute:${operation.target.runtimeId}:${operation.name}`];
    case "set-component-prop":
      return [
        `component-prop:${operation.target.runtimeId}:${operation.componentName}:${operation.propName}`,
      ];
    case "position-element":
      return [`position:${operation.target.runtimeId}:${operation.property}`];
    case "reorder-child":
      return [`reorder:${operation.parent.runtimeId}:${operation.child.runtimeId}`];
    case "reparent-element":
      return [`reparent:${operation.element.runtimeId}`];
    case "set-container-layout":
      return [`container-layout:${operation.container.runtimeId}:${operation.property}`];
    case "set-child-sizing":
      return [
        `child-sizing:${operation.container.runtimeId}:${operation.childIndex}:${operation.sizing}`,
      ];
    case "grid-reorder":
      return [`grid-reorder:${operation.grid.runtimeId}:${operation.child.runtimeId}`];
    case "grid-span":
      return [
        `grid-span:${operation.grid.runtimeId}:${operation.child.runtimeId}:${operation.axis}`,
      ];
    case "breakpoint-style-edit":
      return [
        `bp-style:${operation.target.runtimeId}:${operation.breakpoint}:${operation.property}`,
      ];
    case "breakpoint-class-edit":
      return [
        `bp-class:${operation.target.runtimeId}:${operation.breakpoint}:${operation.oldClassName}`,
      ];
    case "breakpoint-text-edit":
      return [`bp-text:${operation.target.runtimeId}:${operation.breakpoint}`];
    case "group-reorder":
      return [`group-reorder:${operation.parent.runtimeId}`];
    case "group-reparent":
      return [`group-reparent:${operation.elements[0]?.runtimeId ?? ""}`];
    case "insert-element":
    case "remove-element":
      return [`structural-element:${operation.element.runtimeId}`];
    case "duplicate-element":
      return [`structural-element:${operation.duplicate.runtimeId}`];
    case "wrap-elements":
    case "unwrap-element":
      return [`structural-wrapper:${operation.wrapper.runtimeId}`];
    case "multi-select-group":
    case "align-elements":
    case "distribute-elements":
    case "screenshot-crop-ref":
    case "suggested-diff":
    case "pseudo-style-edit":
      return [];
    default: {
      const exhaustive: never = operation;
      throw new Error(`conflictSignatures: unhandled operation ${JSON.stringify(exhaustive)}`);
    }
  }
};
