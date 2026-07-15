import type { Operation } from "@vision-control/change-ir";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
} from "@vision-control/change-journal";
import type { MapOrigin } from "@vision-control/context-compiler";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { describe, expect, it } from "vitest";

import { buildAgentPrompt } from "./agent-prompt.js";

const BASE_TIME = 1_700_000_000_000;
const PASSWORD_SECRET = "VC_SECRET_SHOULD_NOT_EXPORT";
const GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
const API_KEY = "sk_live_abcdef0123456789abcdef";
const COOKIE_SECRET = "session=abc123";
const BEARER_SECRET = "abc.def.ghi";

function styleEdit(value: string, previousValue = "8px"): Operation {
  return {
    id: "op-style-0001",
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
    kind: "style-edit",
    target: { runtimeId: "btn-1", sourceId: "src-button-1", selector: "#submit" },
    property: "padding",
    value,
    important: false,
    previousValue,
  };
}

function classAdd(className: string): Operation {
  return {
    id: "op-class-add1",
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
    kind: "class-add",
    target: { runtimeId: "btn-1" },
    className,
  };
}

function textEdit(newText: string, previousText = "Hello"): Operation {
  return {
    id: "op-text-edit1",
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
    kind: "text-edit",
    target: { runtimeId: "btn-1" },
    newText,
    previousText,
  };
}

function makeSelection(): SelectionSummary {
  return {
    identity: {
      runtimeId: "runtime-1",
      tagName: "button",
      sourceId: "src-button-1",
      frameId: "main",
      fingerprint: "abc12345",
      confidence: "high",
      selector: "#submit",
      sourceSnippet: '<button id="submit">Submit</button>',
    },
    breadcrumb: [
      { tagName: "body", selector: "body" },
      { tagName: "button", selector: "#submit" },
    ],
    computedStyle: {
      display: "inline-flex",
      position: "static",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexBasis: "auto",
      flexGrow: "0",
      width: "120px",
      height: "40px",
      padding: "8px",
      margin: "0px",
      border: "1px solid rgb(0, 0, 0)",
      color: "rgb(0, 0, 0)",
      backgroundColor: "rgb(255, 255, 255)",
      fontSize: "16px",
      fontWeight: "600",
      lineHeight: "20px",
    },
    boxModel: {
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      border: { top: 1, right: 1, bottom: 1, left: 1 },
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      content: { width: 120, height: 40 },
      position: { x: 12, y: 24 },
    },
    classList: [{ name: "primary", source: "css" }],
    attributes: [{ name: "type", value: "submit" }],
    semantic: {
      tagName: "button",
      role: "button",
      name: "Submit",
      textContentPreview: "Submit",
    },
    siblingSummary: { count: 3, index: 1, parentTagName: "form" },
    parentLayout: { mode: "block", display: "block" },
    sourceConfidence: "high",
    activeBreakpoint: "md",
  };
}

function journalWithOps(...operations: Operation[]): Journal {
  let journal = createJournal();
  for (const [index, operation] of operations.entries()) {
    const entry = createJournalEntry({
      id: `je-entry-${index.toString().padStart(4, "0")}`,
      changeSetId: "cs-test-0001",
      transactionId: `tx-${index.toString().padStart(4, "0")}`,
      sequence: index,
      createdAt: BASE_TIME + index,
      appliedAt: BASE_TIME + index,
      actor: "human",
      operation,
      status: "committed",
    });
    journal = appendEntry(journal, entry);
  }
  return journal;
}

describe("buildAgentPrompt", () => {
  it("compiles a handoff from local journal + selection without MCP", () => {
    const prompt = buildAgentPrompt({
      inspectedUrl: "http://localhost:3000/account",
      selection: makeSelection(),
      journal: journalWithOps(styleEdit("16px", "8px")),
      compiledAt: BASE_TIME,
      snapshotRev: 1,
    });

    expect(prompt).toContain("# Vision Control Agent Handoff");
    expect(prompt).toContain("URL: http://localhost:3000/account");
    expect(prompt).toContain("# Vision Context Snapshot");
    expect(prompt).toContain("## Selection");
    expect(prompt).toContain("## Operations");
    expect(prompt).toContain("src-button-1");
    expect(prompt).toContain("#submit");
    expect(prompt).toContain("style-edit");
    expect(prompt).toContain("padding");
    expect(prompt).toContain("## Verification Plan");
    expect(prompt).toContain(
      "verify btn-1 sourceId=src-button-1 selector=#submit has CSS padding: 16px",
    );
    expect(prompt).toContain("works while agent-disconnected");
    expect(prompt).toContain("MCP pair is optional");
    expect(prompt).not.toContain("[REDACTED:circular]");
  });

  it("includes IR operations when origins are empty", () => {
    const prompt = buildAgentPrompt({
      inspectedUrl: "http://localhost:3000/",
      selection: makeSelection(),
      journal: journalWithOps(classAdd("rounded"), styleEdit("16px")),
      origins: [],
      compiledAt: BASE_TIME,
      snapshotRev: 2,
    });

    expect(prompt).toContain("class-add");
    expect(prompt).toContain("style-edit");
    expect(prompt).toContain("## Map Origins");
    expect(prompt).toContain("_No map origins resolved._");
    expect(prompt).toContain("empty origins do not drop IR operations");
    // Failure mode from plan: empty prompt with data present → reject
    expect(prompt).not.toMatch(/## Operations\s*\n\s*_No operations\._/);
  });

  it("includes IR operations when origins are omitted (unpaired default)", () => {
    const prompt = buildAgentPrompt({
      selection: makeSelection(),
      journal: journalWithOps(styleEdit("20px")),
      compiledAt: BASE_TIME,
    });

    expect(prompt).toContain("style-edit");
    expect(prompt).toContain('Set padding to "20px"');
    expect(prompt).toContain("_No map origins resolved._");
  });

  it("still includes optional origins when provided without dropping ops", () => {
    const origin: MapOrigin = {
      relativePath: "src/Button.tsx",
      startLine: 12,
      confidence: "medium",
      kind: "js",
      warnings: [],
    };
    const prompt = buildAgentPrompt({
      selection: makeSelection(),
      journal: journalWithOps(styleEdit("16px")),
      origins: [origin],
      originsTruncated: true,
      compiledAt: BASE_TIME,
    });

    expect(prompt).toContain("style-edit");
    expect(prompt).toContain("src/Button.tsx");
    expect(prompt).toContain("medium");
    expect(prompt).toContain("_Origins truncated by map caps (C4)._");
  });

  it("redacts secrets in URL, selection, and operation detail via snapshot path", () => {
    const selection = makeSelection();
    selection.attributes = [
      { name: "data-token", value: GITHUB_TOKEN },
      { name: "data-note", value: `api_key=${API_KEY}` },
    ];
    selection.semantic = {
      ...selection.semantic,
      name: `password=${PASSWORD_SECRET}`,
      textContentPreview: `authorization: Bearer ${BEARER_SECRET}`,
    };

    const entry = createJournalEntry({
      id: "je-entry-sec1",
      changeSetId: "cs-test-sec1",
      transactionId: "tx-sec1",
      sequence: 0,
      createdAt: BASE_TIME,
      appliedAt: BASE_TIME,
      actor: "human",
      operation: textEdit(`password=${PASSWORD_SECRET}`, `cookie: ${COOKIE_SECRET}`),
      status: "committed",
    });
    let journal = createJournal();
    journal = appendEntry(journal, entry);

    const prompt = buildAgentPrompt({
      inspectedUrl: `http://localhost:3000/account?token=${GITHUB_TOKEN}&password=${PASSWORD_SECRET}#api_key=${API_KEY}`,
      selection,
      journal,
      compiledAt: BASE_TIME,
    });

    expect(prompt).toContain("[REDACTED");
    for (const secret of [PASSWORD_SECRET, GITHUB_TOKEN, API_KEY, COOKIE_SECRET, BEARER_SECRET]) {
      expect(prompt).not.toContain(secret);
    }
  });

  it("still creates a handoff when selection and journal are empty", () => {
    const prompt = buildAgentPrompt({
      inspectedUrl: null,
      selection: null,
      journal: createJournal(),
      compiledAt: BASE_TIME,
    });

    expect(prompt).toContain("URL: unknown");
    expect(prompt).toContain("_No element selected._");
    expect(prompt).toContain("_No operations._");
    expect(prompt).toContain("No journal entries yet");
    expect(prompt).toContain("local panel state alone");
  });

  it("orders journal operations by sequence oldest-first", () => {
    const first = createJournalEntry({
      id: "je-entry-aaa1",
      changeSetId: "cs-test-0001",
      transactionId: "tx-aaa1",
      sequence: 0,
      createdAt: BASE_TIME,
      appliedAt: BASE_TIME,
      actor: "human",
      operation: classAdd("rounded"),
      status: "committed",
    });
    const second = createJournalEntry({
      id: "je-entry-bbb1",
      changeSetId: "cs-test-0001",
      transactionId: "tx-bbb1",
      sequence: 1,
      createdAt: BASE_TIME + 1,
      appliedAt: BASE_TIME + 1,
      actor: "human",
      operation: styleEdit("16px", "8px"),
      status: "committed",
    });
    let journal = createJournal();
    journal = appendEntry(journal, second);
    journal = appendEntry(journal, first);

    const prompt = buildAgentPrompt({
      inspectedUrl: "http://localhost:3000/account",
      selection: makeSelection(),
      journal,
      compiledAt: BASE_TIME,
    });

    expect(prompt.indexOf("class-add")).toBeLessThan(prompt.indexOf("style-edit"));
  });
});
