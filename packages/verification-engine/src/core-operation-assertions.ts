import type { Operation } from "@vision-control/change-ir";

import { assertClass, type ExpectedClass } from "./assertions/class.js";
import { assertComputedStyle } from "./assertions/computed-style.js";
import { assertSiblingOrder } from "./assertions/sibling-order.js";
import { assertText } from "./assertions/text.js";
import type { AssertionEntry } from "./types.js";

type CoreOperation = Extract<
  Operation,
  {
    kind:
      | "style-edit"
      | "text-edit"
      | "class-add"
      | "class-remove"
      | "class-replace"
      | "resize-element"
      | "reorder-child";
  }
>;

export const buildCoreOperationAssertions = (operation: CoreOperation): AssertionEntry[] => {
  switch (operation.kind) {
    case "style-edit":
      return [
        {
          name: "style-edit:value",
          run: (target) =>
            assertComputedStyle(target, [{ property: operation.property, value: operation.value }]),
        },
      ];
    case "text-edit":
      return [
        { name: "text-edit:newText", run: (target) => assertText(target, operation.newText) },
      ];
    case "class-add":
      return [
        {
          name: "class-add",
          run: (target) => assertClass(target, [{ name: operation.className, present: true }]),
        },
      ];
    case "class-remove":
      return [
        {
          name: "class-remove",
          run: (target) => assertClass(target, [{ name: operation.className, present: false }]),
        },
      ];
    case "class-replace": {
      const expected: ExpectedClass[] = [
        { name: operation.oldClassName, present: false },
        { name: operation.newClassName, present: true },
      ];
      return [{ name: "class-replace", run: (target) => assertClass(target, expected) }];
    }
    case "resize-element":
      return [
        {
          name: "resize-element:value",
          run: (target) =>
            assertComputedStyle(target, [
              { property: operation.property, value: `${operation.toValue}${operation.unit}` },
            ]),
        },
      ];
    case "reorder-child":
      return [
        {
          name: "reorder-child:toIndex",
          run: (target) => assertSiblingOrder(target, operation.toIndex),
        },
      ];
    default: {
      const exhaustive: never = operation;
      throw new Error(`Unhandled core verification operation: ${JSON.stringify(exhaustive)}`);
    }
  }
};
