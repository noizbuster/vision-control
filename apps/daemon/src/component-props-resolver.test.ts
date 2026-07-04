import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSourceEntry, SourceRegistry } from "@vision-control/source-registry";
import { describe, expect, it } from "vitest";
import { resolveComponentProps } from "./component-props-resolver.js";

function makeComponentWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-props-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "Button.tsx"),
    [
      'export function Button({ variant = "primary", size = "md", disabled = false, onClick }) {',
      "  return (",
      '    <button className="btn" onClick={onClick} disabled={disabled}>',
      "      {variant}-{size}",
      "    </button>",
      "  );",
      "}",
      "",
      "export function Card() {",
      "  return (",
      '    <Button variant="secondary" size="lg" disabled={false}>',
      "      Click me",
      "    </Button>",
      "  );",
      "}",
    ].join("\n"),
  );
  return dir;
}

function buttonMarker(sourceId: string, fingerprint: string) {
  return createSourceEntry({
    sourceId,
    workspaceRelativePath: "src/Button.tsx",
    range: { startLine: 10, startColumn: 4, endLine: 12, endColumn: 13 },
    componentName: "Button",
    fingerprint,
  });
}

describe("resolveComponentProps — daemon-side discovery", () => {
  it("returns non-empty props for a component with static literal props", () => {
    const workspace = makeComponentWorkspace();
    try {
      const registry = new SourceRegistry();
      registry.register(buttonMarker("marker-btn", "fp-stable"));

      const result = resolveComponentProps(workspace, registry, {
        elementId: "btn-runtime-1",
        tagName: "button",
        sourceId: "marker-btn",
      });

      expect(result.elementId).toBe("btn-runtime-1");
      expect(result.props.length).toBeGreaterThan(0);

      const variantProp = result.props.find((p) => p.name === "variant");
      expect(variantProp).toBeDefined();
      expect(variantProp?.value).toBe("secondary");
      expect(variantProp?.kind).toBe("component-prop");
      expect(variantProp?.componentName).toBe("Button");
      expect(variantProp?.sourceRange).toBeDefined();
      expect(variantProp?.ownershipContext).toBe("same-component");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("includes daemon-computed prop-flow warnings for same-component context (no blocking)", () => {
    const workspace = makeComponentWorkspace();
    try {
      const registry = new SourceRegistry();
      registry.register(buttonMarker("marker-btn", "fp-stable"));

      const result = resolveComponentProps(workspace, registry, {
        elementId: "btn-1",
        sourceId: "marker-btn",
        tagName: "button",
        ownershipContext: "same-component",
      });

      const prop = result.props[0];
      expect(prop).toBeDefined();
      if (prop === undefined) return;
      const blockingWarnings = (prop.warnings ?? []).filter((w) => w.severity === "error");
      expect(blockingWarnings).toHaveLength(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("returns empty props when no marker is registered for the element", () => {
    const workspace = makeComponentWorkspace();
    try {
      const registry = new SourceRegistry();

      const result = resolveComponentProps(workspace, registry, {
        elementId: "unknown-elem",
        tagName: "div",
      });

      expect(result.props).toEqual([]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("returns empty props when the source file is unreadable", () => {
    const workspace = makeComponentWorkspace();
    try {
      const registry = new SourceRegistry();
      registry.register(buttonMarker("marker-missing-file", "fp-stable"));
      rmSync(join(workspace, "src", "Button.tsx"));

      const result = resolveComponentProps(workspace, registry, {
        elementId: "elem-1",
        sourceId: "marker-missing-file",
        tagName: "button",
      });

      expect(result.props).toEqual([]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe("resolveComponentProps — cross-boundary ownership risk (PRD §7.2)", () => {
  it("produces a blocking error-severity warning for a cross-boundary prop without opt-in", () => {
    const workspace = makeComponentWorkspace();
    try {
      const registry = new SourceRegistry();
      registry.register(buttonMarker("marker-cross", "fp-stable"));

      const result = resolveComponentProps(workspace, registry, {
        elementId: "btn-cross",
        sourceId: "marker-cross",
        tagName: "button",
        ownershipContext: "cross-boundary",
        boundary: "server-to-client",
      });

      const prop = result.props.find((p) => p.name === "variant");
      expect(prop).toBeDefined();
      if (prop === undefined) return;

      expect(prop.warnings).toBeDefined();
      const errorWarnings = (prop.warnings ?? []).filter((w) => w.severity === "error");
      expect(errorWarnings.length).toBeGreaterThan(0);
      expect(errorWarnings[0]?.code).toBe("prop-flow-cross-boundary-no-opt-in");
      expect(errorWarnings[0]?.message).toContain("Server");
      expect(errorWarnings[0]?.message).toContain("Client");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("produces a non-blocking warning (severity !== error) for reparented-or-moved context", () => {
    const workspace = makeComponentWorkspace();
    try {
      const registry = new SourceRegistry();
      registry.register(buttonMarker("marker-reparented", "fp-stable"));

      const result = resolveComponentProps(workspace, registry, {
        elementId: "btn-rep",
        sourceId: "marker-reparented",
        tagName: "button",
        ownershipContext: "reparented-or-moved",
      });

      const prop = result.props[0];
      expect(prop).toBeDefined();
      if (prop === undefined) return;

      const errorWarnings = (prop.warnings ?? []).filter((w) => w.severity === "error");
      expect(errorWarnings).toHaveLength(0);
      const warningLevel = (prop.warnings ?? []).filter((w) => w.severity === "warning");
      expect(warningLevel.length).toBeGreaterThan(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
