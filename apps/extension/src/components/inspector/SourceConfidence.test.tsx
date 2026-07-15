import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { type ConfidenceUiData, SourceConfidence } from "./SourceConfidence.js";

const detail: ConfidenceUiData = {
  selected: {
    sourceId: "sel-1",
    workspaceRelativePath: "src/Button.tsx",
    componentName: "Button",
    startLine: 5,
    endLine: 7,
    snippet: "export function Button() { return <button />; }",
    confidence: "high",
    methodBadge: ["marker"],
    reasonBadges: [],
  },
  alternatives: [
    {
      workspaceRelativePath: "src/Button.module.css",
      staticClassName: ".btn",
      snippet: ".btn { padding: 8px; }",
      confidence: "medium",
      methodBadge: ["text-search"],
      reasonBadges: ["text-only match"],
    },
    {
      workspaceRelativePath: "src/legacy.tsx",
      confidence: "low",
      methodBadge: ["llm-inference"],
      reasonBadges: ["llm-inferred origin"],
    },
  ],
  ambiguous: true,
  repeatedInstance: true,
  staleFingerprint: true,
};

describe("SourceConfidence — level-only rendering (backward compat)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the confidence level for high", () => {
    render(<SourceConfidence confidence="high" />);
    expect(screen.getByText("high")).toBeDefined();
  });

  it("renders the confidence level for medium", () => {
    render(<SourceConfidence confidence="medium" />);
    expect(screen.getByText("medium")).toBeDefined();
  });

  it("renders the confidence level for low — NEVER hidden (adversarial: misleading-success)", () => {
    const { container } = render(<SourceConfidence confidence="low" />);
    expect(screen.getByText("low")).toBeDefined();
    // The low badge must carry the low modifier class, not be suppressed.
    expect(container.querySelector(".inspector-confidence--low")).not.toBeNull();
  });

  it("does not render the detail block when detail prop is absent", () => {
    render(<SourceConfidence confidence="high" />);
    expect(screen.queryByText("Selected candidate")).toBeNull();
    expect(screen.queryByText("Alternatives")).toBeNull();
  });
});

describe("SourceConfidence — map-origin confidence policy (ADR-019 C4)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders HIGH for map+range source-map evidence", () => {
    const mapHigh: ConfidenceUiData = {
      selected: {
        workspaceRelativePath: "src/Button.module.css",
        startLine: 1,
        endLine: 3,
        confidence: "high",
        methodBadge: ["source-map"],
        reasonBadges: [],
      },
      alternatives: [],
      ambiguous: false,
      repeatedInstance: false,
      staleFingerprint: false,
    };
    render(<SourceConfidence confidence="high" detail={mapHigh} />);
    expect(screen.getByTestId("source-confidence").textContent).toMatch(/high/i);
    expect(screen.getByText("source-map")).toBeDefined();
    expect(screen.getByText("src/Button.module.css")).toBeDefined();
  });

  it("renders medium for module-path-only (never HIGH without range)", () => {
    const modulePath: ConfidenceUiData = {
      selected: {
        workspaceRelativePath: "src/App.tsx",
        confidence: "medium",
        methodBadge: ["source-map"],
        reasonBadges: ["module-path-only"],
      },
      alternatives: [],
      ambiguous: false,
      repeatedInstance: false,
      staleFingerprint: false,
    };
    const { container } = render(<SourceConfidence confidence="medium" detail={modulePath} />);
    expect(container.querySelector(".inspector-confidence--medium")).not.toBeNull();
    expect(screen.getByText("module-path-only")).toBeDefined();
    expect(screen.queryByText("high")).toBeNull();
  });

  it("never hides low when map origin is absent (none → low identity fallback)", () => {
    render(<SourceConfidence confidence="low" />);
    expect(screen.getByText("low")).toBeDefined();
  });
});

describe("SourceConfidence — full detail rendering (VC-V1V2-10)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the method badge from the selected candidate", () => {
    render(<SourceConfidence confidence="high" detail={detail} />);
    expect(screen.getByText("marker")).toBeDefined();
  });

  it("renders reason badges from the selected candidate's warnings", () => {
    const selected = detail.selected;
    if (selected === undefined) throw new Error("test fixture missing selected");
    const withReasons: ConfidenceUiData = {
      ...detail,
      selected: {
        ...selected,
        reasonBadges: ["ownership risk: dynamic class", "downgraded by policy"],
      },
    };
    render(<SourceConfidence confidence="medium" detail={withReasons} />);
    expect(screen.getByText("ownership risk: dynamic class")).toBeDefined();
    expect(screen.getByText("downgraded by policy")).toBeDefined();
  });

  it("renders the repeated-instance marker", () => {
    render(<SourceConfidence confidence="medium" detail={detail} />);
    expect(screen.getByText(/repeated instance/i)).toBeDefined();
  });

  it("renders the stale-fingerprint marker", () => {
    render(<SourceConfidence confidence="medium" detail={detail} />);
    expect(screen.getByText(/stale fingerprint/i)).toBeDefined();
  });

  it("renders the selected candidate source path and component", () => {
    render(<SourceConfidence confidence="high" detail={detail} />);
    expect(screen.getByText("src/Button.tsx")).toBeDefined();
    expect(screen.getByText("Button")).toBeDefined();
  });

  it("renders every alternative candidate with its confidence level visible", () => {
    render(<SourceConfidence confidence="high" detail={detail} />);
    // medium and low alternatives both surface — neither hidden.
    const mediums = screen.getAllByText("medium");
    const lows = screen.getAllByText("low");
    expect(mediums.length).toBeGreaterThan(0);
    expect(lows.length).toBeGreaterThan(0);
    expect(screen.getByText("src/Button.module.css")).toBeDefined();
    expect(screen.getByText("src/legacy.tsx")).toBeDefined();
  });

  it("renders the ambiguity marker when multiple candidates exist", () => {
    render(<SourceConfidence confidence="high" detail={detail} />);
    expect(screen.getByText(/ambiguous/i)).toBeDefined();
  });

  it("omits the repeated-instance marker when the flag is false", () => {
    const clean: ConfidenceUiData = { ...detail, repeatedInstance: false, staleFingerprint: false };
    render(<SourceConfidence confidence="high" detail={clean} />);
    expect(screen.queryByText(/repeated instance/i)).toBeNull();
    expect(screen.queryByText(/stale fingerprint/i)).toBeNull();
  });
});
