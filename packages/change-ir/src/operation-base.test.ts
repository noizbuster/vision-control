import { describe, expect, it } from "vitest";

import { createOperationId, OPERATION_ID_PATTERN } from "./operation-base.js";
import { OperationSchema } from "./operations/index.js";

const el = (runtimeId: string) => ({ runtimeId });

type TestCrypto = {
  readonly randomUUID?: () => string;
  readonly getRandomValues?: (bytes: Uint8Array) => Uint8Array;
};

function withCrypto<T>(cryptoValue: TestCrypto | undefined, action: () => T): T {
  const originalCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: cryptoValue,
  });
  try {
    return action();
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  }
}

describe("createOperationId", () => {
  it("uses native randomUUID when available", () => {
    const id = withCrypto({ randomUUID: () => "native-id-0001" }, () => createOperationId());

    expect(id).toBe("native-id-0001");
  });

  it("uses getRandomValues when randomUUID is unavailable", () => {
    const id = withCrypto(
      {
        getRandomValues: (bytes) => {
          for (let i = 0; i < bytes.length; i += 1) {
            bytes[i] = i;
          }
          return bytes;
        },
      },
      () => createOperationId(),
    );

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(OPERATION_ID_PATTERN.test(id)).toBe(true);
  });

  it("still creates an operation-compatible id without crypto", () => {
    const id = withCrypto(undefined, () => createOperationId());

    expect(OPERATION_ID_PATTERN.test(id)).toBe(true);
  });
});

describe("PRD §12.4 OperationBase fields", () => {
  describe("origin and confidence defaults", () => {
    it("fills origin='property-panel' and confidence=1 when omitted on parse", () => {
      const parsed = OperationSchema.parse({
        id: "op-defaults-001",
        timestamp: 0,
        runtime: false,
        kind: "style-edit",
        target: el("btn"),
        property: "color",
        value: "red",
        important: false,
      });
      expect(parsed.origin).toBe("property-panel");
      expect(parsed.confidence).toBe(1);
    });

    it("preserves an explicit origin when provided", () => {
      const parsed = OperationSchema.parse({
        id: "op-origin-ex-001",
        timestamp: 0,
        runtime: false,
        origin: "canvas-drag",
        confidence: 0.5,
        kind: "style-edit",
        target: el("btn"),
        property: "color",
        value: "red",
        important: false,
      });
      expect(parsed.origin).toBe("canvas-drag");
      expect(parsed.confidence).toBe(0.5);
    });
  });

  describe("target is required on single-element operations", () => {
    it("rejects a style-edit missing target", () => {
      const result = OperationSchema.safeParse({
        id: "op-no-target001",
        timestamp: 0,
        runtime: false,
        kind: "style-edit",
        property: "color",
        value: "red",
        important: false,
      });
      expect(result.success).toBe(false);
    });

    it("accepts a style-edit with target", () => {
      const result = OperationSchema.safeParse({
        id: "op-has-target001",
        timestamp: 0,
        runtime: false,
        kind: "style-edit",
        target: el("btn"),
        property: "color",
        value: "red",
        important: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("target is optional on multi-element operations", () => {
    it("accepts a reorder-child without target (uses parent/child)", () => {
      const result = OperationSchema.safeParse({
        id: "op-reorder-nt001",
        timestamp: 0,
        runtime: false,
        kind: "reorder-child",
        parent: el("row"),
        child: el("card"),
        fromIndex: 0,
        toIndex: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts a group-reorder without target (uses children array)", () => {
      const result = OperationSchema.safeParse({
        id: "op-grpreordnt01",
        timestamp: 0,
        runtime: false,
        kind: "group-reorder",
        parent: el("row"),
        children: [el("a"), el("b")],
        previousOrder: [0, 1],
        newOrder: [1, 0],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("every op kind carries base fields after parse", () => {
    const baseFields = {
      id: "op-base-chk001",
      timestamp: 0,
      runtime: false,
    };

    const cases = [
      {
        kind: "style-edit",
        extra: { target: el("t"), property: "color", value: "red", important: false },
      },
      {
        kind: "class-add",
        extra: { target: el("t"), className: "x" },
      },
      {
        kind: "reorder-child",
        extra: { parent: el("p"), child: el("c"), fromIndex: 0, toIndex: 1 },
      },
      {
        kind: "resize-element",
        extra: { element: el("e"), property: "width", fromValue: "1", toValue: "2", unit: "px" },
      },
      {
        kind: "grid-span",
        extra: {
          grid: el("g"),
          child: el("c"),
          axis: "column",
          fromSpan: 1,
          toSpan: 2,
        },
      },
      {
        kind: "set-container-layout",
        extra: { container: el("c"), property: "gap", value: "8px" },
      },
    ];

    it.each(cases)("kind $kind carries origin and confidence", ({ kind, extra }) => {
      const parsed = OperationSchema.parse({ ...baseFields, kind, ...extra });
      expect(parsed.origin).toBe("property-panel");
      expect(parsed.confidence).toBe(1);
    });
  });

  describe("optional base fields", () => {
    it("accepts breakpoint on a style-edit", () => {
      const result = OperationSchema.safeParse({
        id: "op-breakpnt0001",
        timestamp: 0,
        runtime: false,
        kind: "style-edit",
        target: el("t"),
        property: "color",
        value: "red",
        important: false,
        breakpoint: "md",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.breakpoint).toBe("md");
    });

    it("accepts pseudoState on a style-edit", () => {
      const result = OperationSchema.safeParse({
        id: "op-pseudo000001",
        timestamp: 0,
        runtime: false,
        kind: "style-edit",
        target: el("t"),
        property: "color",
        value: "red",
        important: false,
        pseudoState: ":hover",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.pseudoState).toBe(":hover");
    });

    it("accepts notes on a style-edit", () => {
      const result = OperationSchema.safeParse({
        id: "op-notes000001",
        timestamp: 0,
        runtime: false,
        kind: "style-edit",
        target: el("t"),
        property: "color",
        value: "red",
        important: false,
        notes: ["user-requested"],
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.notes).toEqual(["user-requested"]);
    });

    it("rejects an invalid pseudoState value", () => {
      const result = OperationSchema.safeParse({
        id: "op-badpseudo001",
        timestamp: 0,
        runtime: false,
        kind: "style-edit",
        target: el("t"),
        property: "color",
        value: "red",
        important: false,
        pseudoState: ":visited",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an invalid origin value", () => {
      const result = OperationSchema.safeParse({
        id: "op-badorigin001",
        timestamp: 0,
        runtime: false,
        origin: "unknown-source",
        kind: "style-edit",
        target: el("t"),
        property: "color",
        value: "red",
        important: false,
      });
      expect(result.success).toBe(false);
    });

    it("rejects confidence outside [0, 1]", () => {
      const result = OperationSchema.safeParse({
        id: "op-badconfid001",
        timestamp: 0,
        runtime: false,
        confidence: 1.5,
        kind: "style-edit",
        target: el("t"),
        property: "color",
        value: "red",
        important: false,
      });
      expect(result.success).toBe(false);
    });
  });
});
