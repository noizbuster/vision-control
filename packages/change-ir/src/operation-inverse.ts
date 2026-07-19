import { invertLayoutOperation } from "./operation-inverse-layout.js";
import { invertMetadataOperation } from "./operation-inverse-metadata.js";
import { invertStructuralOperation } from "./operation-inverse-structural.js";
import { invertStyleOperation } from "./operation-inverse-style.js";
import type { Operation } from "./operations/index.js";

export const computeInverse = (operation: Operation): Operation => {
  switch (operation.kind) {
    case "style-edit":
    case "remove-style":
    case "class-add":
    case "class-remove":
    case "class-replace":
    case "set-attribute":
    case "set-component-prop":
    case "text-edit":
    case "pseudo-style-edit":
    case "position-element":
    case "resize-element":
    case "resize-flex-pair":
      return invertStyleOperation(operation);
    case "reorder-child":
    case "reparent-element":
    case "multi-select-group":
    case "group-reorder":
    case "group-reparent":
    case "align-elements":
    case "distribute-elements":
    case "set-container-layout":
    case "set-child-sizing":
    case "grid-reorder":
    case "grid-span":
      return invertLayoutOperation(operation);
    case "breakpoint-style-edit":
    case "breakpoint-class-edit":
    case "breakpoint-text-edit":
    case "screenshot-crop-ref":
    case "suggested-diff":
      return invertMetadataOperation(operation);
    case "insert-element":
    case "remove-element":
    case "duplicate-element":
    case "wrap-elements":
    case "unwrap-element":
      return invertStructuralOperation(operation);
    default: {
      const exhaustive: never = operation;
      throw new Error(`computeInverse: unhandled operation kind ${JSON.stringify(exhaustive)}`);
    }
  }
};
