import { describe, expect, it } from "vitest";

import { OPERATION_KINDS, OperationSchema } from "./index.js";
import {
  flexPairOperation,
  reorderOperation,
  resizeOperation,
  styleEdit,
} from "./test-support/change-ir-fixtures.js";

const EXPECTED_OPERATION_KINDS = [
  "style-edit",
  "remove-style",
  "class-add",
  "class-remove",
  "class-replace",
  "set-attribute",
  "text-edit",
  "reorder-child",
  "reparent-element",
  "position-element",
  "resize-element",
  "resize-flex-pair",
  "multi-select-group",
  "group-reorder",
  "group-reparent",
  "align-elements",
  "distribute-elements",
  "set-container-layout",
  "set-child-sizing",
  "grid-reorder",
  "grid-span",
  "insert-element",
  "remove-element",
  "duplicate-element",
  "wrap-elements",
  "unwrap-element",
  "breakpoint-style-edit",
  "breakpoint-class-edit",
  "breakpoint-text-edit",
  "screenshot-crop-ref",
  "suggested-diff",
  "set-component-prop",
  "pseudo-style-edit",
] as const;

describe("operation kinds", () => {
  it("matches the literal public kind registry", () => {
    expect(OPERATION_KINDS).toEqual(EXPECTED_OPERATION_KINDS);
  });

  it.each([
    ["style-edit", styleEdit()],
    ["reorder-child", reorderOperation],
    ["resize-element", resizeOperation],
    ["resize-flex-pair", flexPairOperation()],
  ])("accepts a valid %s operation", (_kind, operation) => {
    expect(OperationSchema.safeParse(operation).success).toBe(true);
  });

  it.each([
    ["negative reorder index", { ...reorderOperation, fromIndex: -1 }],
    ["unknown kind", { ...styleEdit(), kind: "unknown-kind" }],
    ["malformed id", { ...styleEdit(), id: "x" }],
    ["missing runtime", { ...styleEdit(), runtime: undefined }],
    ["invalid resize property", { ...resizeOperation, property: "font-size" }],
  ])("rejects %s", (_name, operation) => {
    expect(OperationSchema.safeParse(operation).success).toBe(false);
  });
});
