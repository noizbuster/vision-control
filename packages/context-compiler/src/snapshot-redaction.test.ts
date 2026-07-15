import { describe, expect, it } from "vitest";

import type { OperationSummary, TargetSummary } from "./context-schema.js";
import { redactVisionContextSnapshot } from "./redaction.js";
import { type CompileSnapshotInputs, compileVisionContextSnapshot } from "./snapshot-compiler.js";
import { type VisionContextSnapshot, VisionContextSnapshotSchema } from "./snapshot-schema.js";

const FAKE_PASSWORD = "VC_SECRET_SHOULD_NOT_EXPORT";
const FAKE_API_KEY = "sk_test_12345";
const FAKE_BEARER = "Bearer mF_9.B5f-4.1JqM";
const FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4f";
const FAKE_GH_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";

const makeSelection = (): TargetSummary => ({
  identity: {
    runtimeId: "runtime-0001",
    sourceId: "src-btn-0001",
    fingerprint: "abcdef12",
    confidence: "medium",
    selectors: ["button.primary"],
  },
  semantic: {
    tagName: "button",
    role: "button",
    name: "Submit",
    textContentPreview: "Submit",
  },
  breadcrumb: [
    { tagName: "html" },
    { tagName: "body" },
    { tagName: "button", className: "primary", selector: "button.primary" },
  ],
  computedStyle: { color: "white", display: "inline-block" },
  boxModel: {
    contentWidth: 120,
    contentHeight: 40,
    positionX: 100,
    positionY: 200,
  },
  classList: [{ name: "primary", source: "css" }],
  attributes: [{ name: "type", value: "submit" }],
});

const makeOperation = (): OperationSummary => ({
  id: "op-style0001",
  kind: "style-edit",
  runtime: false,
  description: "Set color to red",
  target: "button.primary",
  detail: { property: "color", value: "red" },
});

const makeInputs = (overrides?: Partial<CompileSnapshotInputs>): CompileSnapshotInputs => ({
  snapshotRev: 1,
  compiledAt: 1_700_000_000_000,
  selection: makeSelection(),
  operations: [makeOperation()],
  journal: {
    entryCount: 1,
    canUndo: true,
    canRedo: false,
    undoDepth: 1,
    redoDepth: 0,
    recentKinds: ["style-edit"],
  },
  ...overrides,
});

describe("VisionContextSnapshot ADR-009 redaction", () => {
  it("strips fake secrets from selection attributes on compile", () => {
    const snapshot = compileVisionContextSnapshot(
      makeInputs({
        selection: {
          ...makeSelection(),
          attributes: [
            { name: "data-config", value: `password=${FAKE_PASSWORD}` },
            { name: "data-key", value: `api_key=${FAKE_API_KEY}` },
            { name: "data-auth", value: FAKE_BEARER },
          ],
        },
      }),
    );
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain(FAKE_PASSWORD);
    expect(json).not.toContain(FAKE_API_KEY);
    expect(json).not.toContain("mF_9.B5f-4.1JqM");
    expect(snapshot.privacyReport.totalRedacted).toBeGreaterThan(0);
    expect(VisionContextSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("strips secrets from operation detail and origin snippets", () => {
    const snapshot = compileVisionContextSnapshot(
      makeInputs({
        operations: [
          {
            id: "op-secret",
            kind: "text-edit",
            runtime: false,
            description: "Set token",
            detail: {
              text: `authorization: ${FAKE_BEARER}`,
              note: `token=${FAKE_JWT}`,
            },
          },
        ],
        origins: [
          {
            relativePath: "src/config.ts",
            snippet: `const key = "${FAKE_GH_TOKEN}";`,
            confidence: "medium",
            kind: "js",
            warnings: [],
          },
        ],
      }),
    );
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain(FAKE_JWT);
    expect(json).not.toContain(FAKE_GH_TOKEN);
    expect(json).not.toContain("mF_9.B5f-4.1JqM");
    expect(snapshot.privacyReport.totalRedacted).toBeGreaterThan(0);
    expect(
      snapshot.privacyReport.redactions.every(
        (entry) =>
          !entry.description.includes(FAKE_JWT) &&
          !entry.description.includes(FAKE_GH_TOKEN) &&
          !entry.field.includes(FAKE_PASSWORD),
      ),
    ).toBe(true);
  });

  it("masks password-input selection values via selector layer", () => {
    const snapshot = compileVisionContextSnapshot(
      makeInputs({
        selection: {
          ...makeSelection(),
          semantic: {
            tagName: "input",
            role: "textbox",
            name: "Password",
            textContentPreview: FAKE_PASSWORD,
          },
          attributes: [
            { name: "type", value: "password" },
            { name: "value", value: FAKE_PASSWORD },
          ],
        },
      }),
    );
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain(FAKE_PASSWORD);
    expect(json).toContain("[REDACTED:password-input]");
    expect(
      snapshot.privacyReport.redactions.some(
        (entry) => entry.patternId === "password-input" && entry.source === "selector",
      ),
    ).toBe(true);
    expect(
      snapshot.privacyReport.redactions.some((entry) => entry.field.startsWith("selection.")),
    ).toBe(true);
  });

  it("leaves a clean snapshot with zero redactions", () => {
    const snapshot = compileVisionContextSnapshot(makeInputs());
    expect(snapshot.privacyReport.totalRedacted).toBe(0);
    expect(snapshot.privacyReport.redactions).toEqual([]);
  });

  it("does not mutate caller-supplied selection when redacting", () => {
    const selection: TargetSummary = {
      ...makeSelection(),
      attributes: [{ name: "data-config", value: `password=${FAKE_PASSWORD}` }],
    };
    compileVisionContextSnapshot(makeInputs({ selection }));
    expect(selection.attributes[0]?.value).toBe(`password=${FAKE_PASSWORD}`);
  });

  it("redactVisionContextSnapshot is idempotent on already-redacted values", () => {
    const once = compileVisionContextSnapshot(
      makeInputs({
        selection: {
          ...makeSelection(),
          attributes: [{ name: "data-key", value: `api_key=${FAKE_API_KEY}` }],
        },
      }),
    );
    const twice = redactVisionContextSnapshot(once);
    expect(JSON.stringify(twice)).not.toContain(FAKE_API_KEY);
    expect(twice.privacyReport.totalRedacted).toBe(once.privacyReport.totalRedacted);
  });

  it("rejects a raw token in an unredacted hand-built snapshot when re-run through chokepoint", () => {
    // Hand-build a leaky document (bypass compile) to prove the chokepoint alone scrubs.
    const base = compileVisionContextSnapshot({
      snapshotRev: 1,
      compiledAt: 1_700_000_000_000,
      operations: [],
    });
    const leaky: VisionContextSnapshot = {
      ...base,
      operations: [
        {
          id: "op-leak",
          kind: "style-edit",
          runtime: false,
          description: "leak",
          detail: { value: `api_key=${FAKE_API_KEY}` },
        },
      ],
      privacyReport: { redactions: [], totalRedacted: 0 },
    };
    expect(JSON.stringify(leaky)).toContain(FAKE_API_KEY);
    const scrubbed = redactVisionContextSnapshot(leaky);
    expect(JSON.stringify(scrubbed)).not.toContain(FAKE_API_KEY);
    expect(scrubbed.privacyReport.totalRedacted).toBeGreaterThan(0);
  });
});
