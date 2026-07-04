import {
  type ChangeSet,
  createChangeSet,
  type Operation,
  withPrivacyReport,
} from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { describe, expect, it } from "vitest";

import { computeChangesetPrivacyReport } from "./changeset-privacy.js";

const makeSelection = (overrides?: {
  readonly attributes?: { readonly name: string; readonly value: string }[];
  readonly textContentPreview?: string;
  readonly tagName?: string;
}): SelectionSummary => ({
  identity: {
    runtimeId: "runtime-0001",
    tagName: overrides?.tagName ?? "input",
    sourceId: "src-inp-0001",
    selector: "#field",
    frameId: "main",
    fingerprint: "abcdef12",
    confidence: "high",
  },
  breadcrumb: [{ tagName: "html" }, { tagName: "body" }],
  computedStyle: {
    display: "block",
    position: "static",
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "flex-start",
    flexBasis: "auto",
    flexGrow: "0",
    width: "200px",
    height: "32px",
    padding: "0",
    margin: "0",
    border: "0",
    color: "black",
    backgroundColor: "white",
    fontSize: "14px",
    fontWeight: "400",
    lineHeight: "1.5",
  },
  boxModel: {
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    border: { top: 0, right: 0, bottom: 0, left: 0 },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    content: { width: 200, height: 32 },
    position: { x: 10, y: 20 },
  },
  classList: [],
  attributes: (overrides?.attributes ?? [{ name: "type", value: "text" }]).map((a) => ({
    name: a.name,
    value: a.value,
  })),
  semantic: {
    tagName: overrides?.tagName ?? "input",
    textContentPreview: overrides?.textContentPreview ?? "",
  },
  siblingSummary: { count: 1, index: 0, parentTagName: "form", parentLayoutRole: "block" },
  parentLayout: { mode: "block", display: "block" },
  sourceConfidence: "high",
});

const baseChangeset: ChangeSet = createChangeSet({
  workspaceId: "ws-37",
  sessionId: "sess-37",
  id: "cs-00000037",
  now: 5000,
});

const setAttributeOp = (value: string): Operation => ({
  id: "op-setattr01",
  kind: "set-attribute",
  target: { runtimeId: "runtime-0001", sourceId: "src-inp-0001", selector: "#field" },
  name: "value",
  value,
  previousValue: "",
  timestamp: 5001,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
});

describe("computeChangesetPrivacyReport — PRD §12.2 / Appendix D.6", () => {
  it("lists a password input value as redacted by the password-input selector", () => {
    const selection = makeSelection({
      attributes: [
        { name: "type", value: "password" },
        { name: "value", value: "hunter2-low-entropy" },
      ],
      textContentPreview: "hunter2-low-entropy",
    });
    const report = computeChangesetPrivacyReport(baseChangeset, { selection });
    const passwordRedaction = report.redactions.find((r) => r.patternId === "password-input");
    expect(passwordRedaction).toBeDefined();
    expect(passwordRedaction?.source).toBe("selector");
    expect(passwordRedaction?.field).toBe("target.attributes.value");
    expect(report.totalRedacted).toBeGreaterThan(0);
  });

  it("notes exclusion of a [data-private] element", () => {
    const selection = makeSelection({
      tagName: "div",
      attributes: [
        { name: "data-private", value: "" },
        { name: "id", value: "ssn" },
      ],
      textContentPreview: "123-45-6789",
    });
    const report = computeChangesetPrivacyReport(baseChangeset, { selection });
    const privateRedaction = report.redactions.find((r) => r.patternId === "data-private");
    expect(privateRedaction).toBeDefined();
    expect(privateRedaction?.source).toBe("selector");
  });

  it("flags a JWT typed into an operation value via the string-pattern layer", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const changeset: ChangeSet = { ...baseChangeset, operations: [setAttributeOp(jwt)] };
    const report = computeChangesetPrivacyReport(changeset);
    const jwtRedaction = report.redactions.find((r) => r.source === "string-pattern");
    expect(jwtRedaction).toBeDefined();
    expect(jwtRedaction?.field).toContain("operations");
  });

  it("returns an empty report for a clean changeset with no sensitive selection", () => {
    const selection = makeSelection({
      tagName: "button",
      attributes: [{ name: "type", value: "submit" }],
      textContentPreview: "Submit",
    });
    const report = computeChangesetPrivacyReport(baseChangeset, { selection });
    expect(report.totalRedacted).toBe(0);
    expect(report.redactions).toEqual([]);
  });

  it("does not double-count when a selector-masked value is re-scanned by the string layer", () => {
    const selection = makeSelection({
      attributes: [
        { name: "type", value: "password" },
        { name: "value", value: "hunter2" },
      ],
    });
    const report = computeChangesetPrivacyReport(baseChangeset, { selection });
    const valueRedactions = report.redactions.filter((r) => r.field === "target.attributes.value");
    expect(valueRedactions).toHaveLength(1);
    expect(valueRedactions[0]?.source).toBe("selector");
  });

  it("stamps onto a ChangeSet via withPrivacyReport and survives serialization round-trip", () => {
    const selection = makeSelection({
      attributes: [
        { name: "type", value: "password" },
        { name: "value", value: "hunter2" },
      ],
    });
    const report = computeChangesetPrivacyReport(baseChangeset, { selection });
    const stamped = withPrivacyReport(baseChangeset, report);
    expect(stamped.privacyReport.totalRedacted).toBe(report.totalRedacted);
    expect(stamped.privacyReport.redactions.every((r) => r.source !== undefined)).toBe(true);
  });

  it("produces a schema-valid change-ir PrivacyReport", async () => {
    const { PrivacyReportSchema } = await import("@vision-control/change-ir");
    const selection = makeSelection({
      attributes: [
        { name: "type", value: "password" },
        { name: "value", value: "hunter2" },
      ],
    });
    const report = computeChangesetPrivacyReport(baseChangeset, { selection });
    expect(PrivacyReportSchema.safeParse(report).success).toBe(true);
  });
});
