import { expect, test } from "@playwright/test";
import type { ChangeSet } from "@vision-control/change-ir";
import {
  compileContext,
  redactContext,
  renderJson,
  renderMarkdown,
} from "@vision-control/context-compiler";

import type { SelectionSummary } from "@vision-control/inspector-core";
import { redactObject } from "@vision-control/security";

/**
 * Risk gate D.6: privacy export redaction.
 *
 * Seeded secrets (passwords, API keys, cookies, hidden form values) must NEVER
 * appear in JSON, Markdown, or MCP context exports. This is the last line of
 * defense before data reaches a coding agent.
 *
 * The context compiler + security redaction pipeline is testable at the unit
 * level: compile a context with seeded secrets, redact it, render it, and
 * assert the secrets are absent from every output format.
 */

const SECRET_PASSWORD = "VC_SECRET_SHOULD_NOT_EXPORT";
const SECRET_API_KEY = "sk_test_VC_SECRET_KEY";
const SECRET_COOKIE = "VC_SECRET_COOKIE";

const seededSelection: SelectionSummary = {
  identity: {
    runtimeId: "el-priv-01",
    sourceId: "src-priv-01",
    tagName: "input",
    frameId: "main",
    fingerprint: "fp-priv-01",
    confidence: "high",
  },
  semantic: {
    tagName: "input",
    textContentPreview: "",
  },
  breadcrumb: [{ tagName: "form" }, { tagName: "input" }],
  computedStyle: {
    display: "inline-block",
    position: "static",
    flexDirection: "row",
    alignItems: "normal",
    justifyContent: "normal",
    flexBasis: "auto",
    flexGrow: "0",
    width: "200px",
    height: "30px",
    padding: "4px 8px",
    margin: "0px",
    border: "1px solid #ccc",
    color: "rgb(0, 0, 0)",
    backgroundColor: "rgb(255, 255, 255)",
    fontSize: "14px",
    fontWeight: "400",
    lineHeight: "20px",
  },
  boxModel: {
    content: { width: 200, height: 30 },
    position: { x: 10, y: 10 },
    padding: { top: 4, right: 8, bottom: 4, left: 8 },
    border: { top: 1, right: 1, bottom: 1, left: 1 },
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  },
  classList: [],
  attributes: [
    { name: "type", value: "password" },
    { name: "name", value: "password" },
  ],
  siblingSummary: { count: 2, index: 0, parentTagName: "form" },
  parentLayout: { mode: "block", display: "block" },
  sourceConfidence: "high",
};

const emptyChangeset: ChangeSet = {
  id: "cs-priv-01",
  workspaceId: "ws-priv",
  operations: [],
  runtime: false,
  createdAt: 1000,
  updatedAt: 1000,
};

const sourceCandidates: readonly {
  readonly confidence: "high" | "medium" | "low";
  readonly warnings: readonly string[];
}[] = [];

const compileInputs = {
  goal: "Edit the password field",
  selection: seededSelection,
  changeset: emptyChangeset,
  sourceCandidates,
  warnings: [
    {
      severity: "info" as const,
      code: "REDACTION_TEST",
      message: `password=${SECRET_PASSWORD} api_key=${SECRET_API_KEY} cookie=${SECRET_COOKIE}`,
    },
  ],
};

test.describe("risk: privacy export redaction (unit)", () => {
  test("secrets are absent from JSON render after redaction", () => {
    const context = compileContext(compileInputs);
    const redacted = redactContext(context);
    const json = renderJson(redacted);
    expect(json).not.toContain(SECRET_PASSWORD);
    expect(json).not.toContain(SECRET_API_KEY);
    expect(json).not.toContain(SECRET_COOKIE);
  });

  test("secrets are absent from Markdown render after redaction", () => {
    const context = compileContext(compileInputs);
    const redacted = redactContext(context);
    const markdown = renderMarkdown(redacted);
    expect(markdown).not.toContain(SECRET_PASSWORD);
    expect(markdown).not.toContain(SECRET_API_KEY);
    expect(markdown).not.toContain(SECRET_COOKIE);
  });

  test("redactObject masks password value in sensitive-key positions", () => {
    const obj = { password: SECRET_PASSWORD, token: SECRET_API_KEY };
    const redacted = redactObject(obj);
    const json = JSON.stringify(redacted);
    expect(json).not.toContain(SECRET_PASSWORD);
    expect(json).toContain("[REDACTED");
  });

  test("redactObject masks sensitive keys (api_key, cookie, password)", () => {
    const obj = {
      api_key: SECRET_API_KEY,
      cookie: SECRET_COOKIE,
      password: SECRET_PASSWORD,
    };
    const redacted = redactObject(obj);
    const json = JSON.stringify(redacted);
    expect(json).not.toContain(SECRET_API_KEY);
    expect(json).not.toContain(SECRET_COOKIE);
    expect(json).not.toContain(SECRET_PASSWORD);
  });

  test("privacy report records redactions without carrying secret values", () => {
    const context = compileContext(compileInputs);
    const redacted = redactContext(context);
    expect(redacted.privacyReport.totalRedacted).toBeGreaterThan(0);
    for (const entry of redacted.privacyReport.redactions) {
      expect(entry.field).not.toContain(SECRET_PASSWORD);
      expect(entry.description).not.toContain(SECRET_PASSWORD);
    }
  });
});
