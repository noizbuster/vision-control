import type { Operation } from "@vision-control/change-ir";

import { assertClass, type ExpectedClass } from "./assertions/class.js";
import { assertComputedStyle } from "./assertions/computed-style.js";
import { assertText } from "./assertions/text.js";
import { contextDependentNote } from "./context-dependent-assertion.js";
import type { AssertionEntry } from "./types.js";

type MetadataOperation = Extract<
  Operation,
  {
    kind:
      | "breakpoint-style-edit"
      | "breakpoint-class-edit"
      | "breakpoint-text-edit"
      | "set-component-prop"
      | "pseudo-style-edit";
  }
>;

export const buildMetadataOperationAssertions = (
  operation: MetadataOperation,
): AssertionEntry[] => {
  switch (operation.kind) {
    case "breakpoint-style-edit":
      return [
        {
          name: "breakpoint-style-edit:value",
          run: (target) =>
            assertComputedStyle(target, [{ property: operation.property, value: operation.value }]),
        },
      ];
    case "breakpoint-class-edit": {
      const expected: ExpectedClass[] = [
        { name: operation.oldClassName, present: false },
        { name: operation.newClassName, present: true },
      ];
      return [
        {
          name: "breakpoint-class-edit",
          run: (target) => assertClass(target, expected),
        },
      ];
    }
    case "breakpoint-text-edit":
      return [
        {
          name: "breakpoint-text-edit:newText",
          run: (target) => assertText(target, operation.newText),
        },
      ];
    case "set-component-prop":
      return [
        {
          name: "set-component-prop:context-dependent",
          run: () =>
            contextDependentNote(
              `set-component-prop (${operation.componentName}.${operation.propName})`,
              "Component prop is a source-only edit; verify the rendered component reflects the new prop value.",
            ),
        },
      ];
    case "pseudo-style-edit":
      return [
        {
          name: `pseudo-style-edit:${operation.pseudoTarget}`,
          run: () =>
            contextDependentNote(
              `pseudo-style-edit (${operation.pseudoTarget} ${operation.property})`,
              "Pseudo-element/state edit; verify the pseudo computed style reflects the new declaration after HMR.",
            ),
        },
      ];
    default: {
      const exhaustive: never = operation;
      throw new Error(`Unhandled metadata verification operation: ${JSON.stringify(exhaustive)}`);
    }
  }
};
