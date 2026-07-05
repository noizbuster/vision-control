import { describe, expect, it } from "vitest";

import {
  type AttributedElement,
  assignRuntimeIds,
  isUuid,
  RUNTIME_ATTRIBUTE,
} from "./runtime-id-assignment.js";

interface FakeNode {
  attrs: Record<string, string>;
  children: FakeNode[];
}

const fake = (attrs: Record<string, string>, children: FakeNode[] = []): FakeNode => ({
  attrs,
  children,
});

const asElement = (node: FakeNode): AttributedElement => ({
  hasAttribute: (name) => Object.hasOwn(node.attrs, name),
  getAttribute: (name) => (Object.hasOwn(node.attrs, name) ? (node.attrs[name] ?? "") : null),
  setAttribute: (name, value) => {
    node.attrs[name] = value;
  },
  querySelectorAll: (selector) => {
    const attr = selector.replaceAll(/[[\]]/g, "");
    const found: AttributedElement[] = [];
    const walk = (n: FakeNode): void => {
      for (const child of n.children) {
        if (Object.hasOwn(child.attrs, attr)) found.push(asElement(child));
        walk(child);
      }
    };
    walk(node);
    return found;
  },
});

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

describe("assignRuntimeIds", () => {
  it("assigns a runtime id to the root and every descendant carrying a source id", () => {
    const tree = fake({ "data-vc-source": "s-root" }, [
      fake({ "data-vc-source": "s-child" }),
      fake({ class: "no-marker" }, [fake({ "data-vc-source": "s-deep" })]),
    ]);

    const assignments = assignRuntimeIds(asElement(tree));

    expect(assignments).toHaveLength(3);
    expect(assignments.map((a) => a.sourceId).sort()).toEqual(["s-child", "s-deep", "s-root"]);
  });

  it("gives DISTINCT runtime ids to repeated instances of the same source id", () => {
    const tree = fake(
      {},
      Array.from({ length: 5 }, () => fake({ "data-vc-source": "s-card" })),
    );
    const assignments = assignRuntimeIds(asElement(tree));
    expect(assignments).toHaveLength(5);
    expect(new Set(assignments.map((a) => a.runtimeId)).size).toBe(5);
    expect(assignments.every((a) => a.sourceId === "s-card")).toBe(true);
  });

  it("sets the data-vc-runtime-id attribute on each assigned element", () => {
    const child = fake({ "data-vc-source": "s1" });
    const tree = fake({}, [child]);
    assignRuntimeIds(asElement(tree));
    expect(child.attrs[RUNTIME_ATTRIBUTE]).toBeTruthy();
  });

  it("uses getRandomValues when randomUUID is unavailable", () => {
    let seed = 0;
    const tree = fake({}, [fake({ "data-vc-source": "s1" }), fake({ "data-vc-source": "s2" })]);

    const assignments = withCrypto(
      {
        getRandomValues: (bytes) => {
          for (let i = 0; i < bytes.length; i += 1) {
            bytes[i] = (seed + i) & 0xff;
          }
          seed += 1;
          return bytes;
        },
      },
      () => assignRuntimeIds(asElement(tree)),
    );

    expect(assignments).toHaveLength(2);
    expect(assignments.every((assignment) => isUuid(assignment.runtimeId))).toBe(true);
    expect(new Set(assignments.map((assignment) => assignment.runtimeId)).size).toBe(2);
  });

  it("skips elements whose source id is empty", () => {
    const tree = fake({}, [fake({ "data-vc-source": "" }), fake({ "data-vc-source": "s1" })]);
    const assignments = assignRuntimeIds(asElement(tree));
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.sourceId).toBe("s1");
  });

  it("uses the injected counter when Web Crypto is unavailable", () => {
    const seq = ["c-1", "c-2"];
    const tree = fake({}, [fake({ "data-vc-source": "s1" }), fake({ "data-vc-source": "s2" })]);
    const assignments = assignRuntimeIds(asElement(tree), {
      counter: () => seq.shift() ?? "x",
    });
    expect(assignments.map((a) => a.runtimeId)).toEqual(["c-1", "c-2"]);
  });
});
