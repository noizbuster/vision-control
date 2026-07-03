/**
 * Component props orchestration tests (VC-V1V2-21).
 *
 * The load-bearing end-to-end contracts:
 *   1. A safe static literal prop edit (`variant="secondary"` -> `variant="primary"`)
 *      produces a `StaticEditIntent` with `kind: "component-prop-edit"`.
 *   2. A dynamic prop (`variant={computeVariant(user)}`) produces agent-required.
 *   3. A cross-boundary prop without opt-in produces a blocking warning.
 */

import { describe, expect, it } from "vitest";

import { buildComponentPropEdit, discoverProps } from "./index.js";
import type { DiscoveredProp } from "./prop-discovery.js";

const discover = (source: string, componentName = "Button"): readonly DiscoveredProp[] =>
  discoverProps({
    framework: "jsx",
    componentName,
    filePath: "src/Button.tsx",
    sourceText: source,
  }).props;

const literalVariantProp: DiscoveredProp = {
  name: "variant",
  kind: "literal-string",
  rawValue: "secondary",
  literalValue: "secondary",
  sourceRange: { startLine: 5, startColumn: 16, endLine: 5, endColumn: 26 },
};

const dynamicVariantProp: DiscoveredProp = {
  name: "variant",
  kind: "dynamic-expression",
  rawValue: "computeVariant(user)",
};

describe("buildComponentPropEdit — literal prop produces deterministic intent", () => {
  it("produces an intent with kind component-prop-edit for a literal prop", () => {
    const result = buildComponentPropEdit({
      prop: literalVariantProp,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "same-component",
      typeMetadata: { type: "string-literal-union", literals: ["primary", "secondary", "danger"] },
    });
    expect(result.kind).toBe("intent");
    if (result.kind !== "intent") throw new Error("expected intent");
    expect(result.intent.kind).toBe("component-prop-edit");
    expect(result.intent.componentName).toBe("Button");
    expect(result.intent.propName).toBe("variant");
    expect(result.intent.oldValue).toBe("secondary");
    expect(result.intent.newValue).toBe("primary");
    expect(result.intent.sourceRange).toBeDefined();
    expect(result.risk.risk).toBe("high");
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("uses unambiguous ownership for HIGH-risk same-component edits", () => {
    const result = buildComponentPropEdit({
      prop: literalVariantProp,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "same-component",
    });
    if (result.kind !== "intent") throw new Error("expected intent");
    expect(result.intent.ownership).toBe("unambiguous");
  });

  it("uses text-backed ownership for MEDIUM-risk reparented edits", () => {
    const result = buildComponentPropEdit({
      prop: literalVariantProp,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "reparented-or-moved",
    });
    if (result.kind !== "intent") throw new Error("expected intent");
    expect(result.risk.risk).toBe("medium");
    expect(result.intent.ownership).toBe("text-backed");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("buildComponentPropEdit — dynamic prop produces agent-required", () => {
  it("produces agent-required for a dynamic-expression prop", () => {
    const result = buildComponentPropEdit({
      prop: dynamicVariantProp,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "same-component",
    });
    expect(result.kind).toBe("agent-required");
    if (result.kind !== "agent-required") throw new Error("expected agent-required");
    expect(result.reason).toContain("dynamic");
    expect(result.reason).toContain("variant");
  });

  it("produces agent-required for a member-access prop", () => {
    const prop: DiscoveredProp = {
      name: "variant",
      kind: "member-access",
      rawValue: "config.variant",
    };
    const result = buildComponentPropEdit({
      prop,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "same-component",
    });
    expect(result.kind).toBe("agent-required");
  });

  it("produces agent-required for a computed prop", () => {
    const prop: DiscoveredProp = {
      name: "variant",
      kind: "computed",
      rawValue: "cond ? 'a' : 'b'",
    };
    const result = buildComponentPropEdit({
      prop,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "same-component",
    });
    expect(result.kind).toBe("agent-required");
  });
});

describe("buildComponentPropEdit — cross-boundary without opt-in blocks", () => {
  it("produces agent-required for cross-boundary without opt-in", () => {
    const result = buildComponentPropEdit({
      prop: literalVariantProp,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "cross-boundary",
      boundary: "server-to-client",
    });
    expect(result.kind).toBe("agent-required");
    if (result.kind !== "agent-required") throw new Error("expected agent-required");
    expect(result.reason).toContain("boundary");
  });

  it("produces agent-required for context-provider boundary", () => {
    const result = buildComponentPropEdit({
      prop: literalVariantProp,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "cross-boundary",
      boundary: "context-provider",
    });
    expect(result.kind).toBe("agent-required");
  });

  it("allows cross-boundary WITH opt-in", () => {
    const result = buildComponentPropEdit({
      prop: literalVariantProp,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "cross-boundary",
      boundary: "server-to-client",
      boundaryOptIn: true,
      typeMetadata: { type: "string-literal-union", literals: ["primary", "secondary"] },
    });
    expect(result.kind).toBe("intent");
    if (result.kind !== "intent") throw new Error("expected intent");
    expect(result.risk.risk).toBe("medium");
  });
});

describe("buildComponentPropEdit — candidate validation", () => {
  it("blocks when the desired value is not in the constrained candidate set", () => {
    const result = buildComponentPropEdit({
      prop: literalVariantProp,
      desiredValue: "tertiary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "same-component",
      typeMetadata: { type: "string-literal-union", literals: ["primary", "secondary"] },
    });
    expect(result.kind).toBe("agent-required");
    if (result.kind !== "agent-required") throw new Error("expected agent-required");
    expect(result.reason).toContain("not a valid candidate");
  });

  it("allows any value for free-form-string props", () => {
    const result = buildComponentPropEdit({
      prop: literalVariantProp,
      desiredValue: "anything-goes",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "same-component",
    });
    expect(result.kind).toBe("intent");
  });
});

describe("buildComponentPropEdit — end-to-end with discoverProps", () => {
  it("discovers a literal prop from source and builds a deterministic intent", () => {
    const source = 'const x = <Button variant="secondary">Save</Button>;';
    const props = discover(source);
    const variant = props.find((p) => p.name === "variant");
    if (variant === undefined) throw new Error("variant not found");

    const result = buildComponentPropEdit({
      prop: variant,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "same-component",
      typeMetadata: { type: "string-literal-union", literals: ["primary", "secondary"] },
    });
    expect(result.kind).toBe("intent");
    if (result.kind !== "intent") throw new Error("expected intent");
    expect(result.intent.oldValue).toBe("secondary");
    expect(result.intent.newValue).toBe("primary");
  });

  it("discovers a dynamic prop from source and produces agent-required", () => {
    const source = "const x = <Button variant={computeVariant(user)}>Save</Button>;";
    const props = discover(source);
    const variant = props.find((p) => p.name === "variant");
    if (variant === undefined) throw new Error("variant not found");

    const result = buildComponentPropEdit({
      prop: variant,
      desiredValue: "primary",
      componentName: "Button",
      filePath: "src/Button.tsx",
      framework: "jsx",
      ownershipContext: "same-component",
    });
    expect(result.kind).toBe("agent-required");
  });
});
