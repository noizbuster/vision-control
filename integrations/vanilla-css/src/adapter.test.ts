/**
 * Adapter contract tests for the vanilla CSS adapter (PRD §15.3 / Task 45).
 */
import { describe, expect, it } from "vitest";

import { createVanillaCssAdapter, VANILLA_CSS_ADAPTER } from "./adapter.js";
import { parseStyleSheet } from "./stylesheet.js";

describe("VANILLA_CSS_ADAPTER singleton (no data loaded)", () => {
  it("has the stable id 'vanilla-css'", () => {
    expect(VANILLA_CSS_ADAPTER.id).toBe("vanilla-css");
  });

  it("returns an empty array when no stylesheets are loaded (defers to other cascades)", () => {
    expect(VANILLA_CSS_ADAPTER.resolve({ cssClasses: ["btn"] })).toEqual([]);
    expect(VANILLA_CSS_ADAPTER.resolve({})).toEqual([]);
    expect(VANILLA_CSS_ADAPTER.resolve({ cssClasses: [] })).toEqual([]);
  });

  it("returns a real (non-LOW, non-stub) candidate when wired with a stylesheet", () => {
    const sheet = parseStyleSheet(".btn { color: red; }", "src/styles.css");
    const adapter = createVanillaCssAdapter({ stylesheets: [sheet] });
    const candidates = adapter.resolve({ cssClasses: ["btn"] });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).toBe("high");
    expect(candidates[0]?.confidence).not.toBe("low");
    expect(candidates[0]?.evidence).toEqual(["ast-origin"]);
    expect(candidates[0]?.workspaceRelativePath).toBe("src/styles.css");
  });
});

describe("createVanillaCssAdapter — factory", () => {
  it("produces a candidate carrying the matched selector and stylesheet URL", () => {
    const sheet = parseStyleSheet(".btn { color: red; }", "src/styles.css");
    const adapter = createVanillaCssAdapter({ stylesheets: [sheet] });
    const [candidate] = adapter.resolve({ cssClasses: ["btn"] });
    expect(candidate?.matchedSelector).toBe(".btn");
    expect(candidate?.cssFilePath).toBe("src/styles.css");
  });

  it("respects runtimeInstanceCount without crashing (informational only)", () => {
    const sheet = parseStyleSheet(".btn { color: red; }", "src/styles.css");
    const adapter = createVanillaCssAdapter({ stylesheets: [sheet] });
    const candidates = adapter.resolve({ cssClasses: ["btn"], runtimeInstanceCount: 3 });
    expect(candidates).toHaveLength(1);
  });
});
