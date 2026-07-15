import type { Operation } from "@vision-control/change-ir";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
} from "@vision-control/change-journal";
import {
  SNAPSHOT_FORMAT_VERSION,
  VisionContextSnapshotSchema,
} from "@vision-control/context-compiler";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { describe, expect, it } from "vitest";

import { buildPanelContextExport } from "./context-export.js";

const BASE_TIME = 1_700_000_000_000;
const FAKE_PASSWORD = "VC_SECRET_SHOULD_NOT_EXPORT";
const FAKE_API_KEY = "sk_test_12345";

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

describe("buildPanelContextExport", () => {
  it("produces a schema-valid redacted snapshot without MCP or daemon", () => {
    const exported = buildPanelContextExport({
      selection: makeSelection(),
      journal: journalWithOps(styleEdit("16px")),
      tabId: "42",
      sessionId: "sess-local",
      snapshotRev: 3,
      compiledAt: BASE_TIME,
    });

    const parsed = VisionContextSnapshotSchema.safeParse(exported.snapshot);
    expect(parsed.success).toBe(true);
    expect(exported.snapshot.formatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
    expect(exported.snapshot.snapshotRev).toBe(3);
    expect(exported.snapshot.tabId).toBe("42");
    expect(exported.snapshot.sessionId).toBe("sess-local");
    expect(exported.snapshot.selection?.identity.sourceId).toBe("src-button-1");
    expect("workspaceRoot" in exported.snapshot).toBe(false);
  });

  it("includes journal operations when present", () => {
    const exported = buildPanelContextExport({
      selection: makeSelection(),
      journal: journalWithOps(classAdd("rounded"), styleEdit("16px")),
      snapshotRev: 1,
      compiledAt: BASE_TIME,
    });

    expect(exported.snapshot.operations).toHaveLength(2);
    expect(exported.snapshot.operations[0]?.kind).toBe("class-add");
    expect(exported.snapshot.operations[1]?.kind).toBe("style-edit");
    expect(exported.snapshot.journal.entryCount).toBe(2);
    expect(exported.snapshot.journal.canUndo).toBe(true);
    expect(exported.snapshot.journal.undoDepth).toBe(2);
    expect(exported.snapshot.journal.recentKinds).toEqual(["class-add", "style-edit"]);
    expect(exported.snapshot.changesetId).toBe("cs-test-0001");
    expect(exported.json).toContain('"kind": "class-add"');
    expect(exported.json).toContain('"kind": "style-edit"');
    expect(exported.markdown).toContain("class-add");
    expect(exported.markdown).toContain("style-edit");
  });

  it("exports an empty unpaired snapshot when selection and journal are empty", () => {
    const exported = buildPanelContextExport({
      selection: null,
      journal: createJournal(),
      snapshotRev: 0,
      compiledAt: BASE_TIME,
    });

    expect(exported.snapshot.selection).toBeUndefined();
    expect(exported.snapshot.operations).toEqual([]);
    expect(exported.snapshot.journal.entryCount).toBe(0);
    expect(exported.snapshot.origins).toEqual([]);
    expect(exported.markdown).toContain("_No element selected._");
    expect(exported.markdown).toContain("_No operations._");
    expect(JSON.parse(exported.json)).toMatchObject({
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      snapshotRev: 0,
      operations: [],
    });
  });

  it("redacts secrets in selection attributes via compile path", () => {
    const selection = makeSelection();
    selection.attributes = [
      { name: "data-password", value: `password=${FAKE_PASSWORD}` },
      { name: "data-key", value: `api_key=${FAKE_API_KEY}` },
    ];

    const exported = buildPanelContextExport({
      selection,
      journal: createJournal(),
      snapshotRev: 1,
      compiledAt: BASE_TIME,
    });

    expect(exported.json).not.toContain(FAKE_PASSWORD);
    expect(exported.json).not.toContain(FAKE_API_KEY);
    expect(exported.markdown).not.toContain(FAKE_PASSWORD);
    expect(exported.markdown).not.toContain(FAKE_API_KEY);
    expect(exported.snapshot.privacyReport.totalRedacted).toBeGreaterThan(0);
  });

  it("renders JSON and Markdown shapes with required sections", () => {
    const exported = buildPanelContextExport({
      selection: makeSelection(),
      journal: journalWithOps(styleEdit("16px")),
      snapshotRev: 2,
      compiledAt: BASE_TIME,
      origins: [],
    });

    const asJson = JSON.parse(exported.json) as {
      formatVersion: string;
      operations: unknown[];
      journal: { entryCount: number };
      privacyReport: { totalRedacted: number };
    };
    expect(asJson.formatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
    expect(asJson.operations).toHaveLength(1);
    expect(asJson.journal.entryCount).toBe(1);
    expect(typeof asJson.privacyReport.totalRedacted).toBe("number");

    expect(exported.markdown).toContain("# Vision Context Snapshot");
    expect(exported.markdown).toContain("## Selection");
    expect(exported.markdown).toContain("## Operations");
    expect(exported.markdown).toContain("## Journal");
    expect(exported.markdown).toContain("## Map Origins");
    expect(exported.markdown).toContain("## Privacy Report");
    expect(exported.markdown).toContain("src-button-1");
  });

  it("includes map origins and originsTruncated when provided (task 12)", () => {
    const exported = buildPanelContextExport({
      selection: makeSelection(),
      journal: journalWithOps(styleEdit("16px")),
      snapshotRev: 4,
      compiledAt: BASE_TIME,
      origins: [
        {
          relativePath: "src/Button.module.css",
          sourceUrl: "http://localhost:5173/assets/index.css",
          startLine: 10,
          endLine: 14,
          confidence: "high",
          kind: "css",
          warnings: [],
        },
        {
          relativePath: "src/Button.tsx",
          confidence: "medium",
          kind: "js",
          warnings: ["module-path-only"],
        },
      ],
      originsTruncated: true,
    });

    expect(exported.snapshot.origins).toHaveLength(2);
    expect(exported.snapshot.origins[0]?.relativePath).toBe("src/Button.module.css");
    expect(exported.snapshot.origins[1]?.relativePath).toBe("src/Button.tsx");
    expect(exported.snapshot.originsTruncated).toBe(true);
    expect(exported.snapshot.operations).toHaveLength(1);

    expect(exported.markdown).toContain("## Map Origins");
    expect(exported.markdown).toContain("_Origins truncated by map caps (C4)._");
    expect(exported.markdown).toContain("src/Button.module.css");
    expect(exported.markdown).toContain("src/Button.tsx");
    expect(exported.markdown).toContain("style-edit");

    const asJson = JSON.parse(exported.json) as {
      origins: Array<{ relativePath?: string }>;
      originsTruncated: boolean;
    };
    expect(asJson.originsTruncated).toBe(true);
    expect(asJson.origins.map((o) => o.relativePath)).toEqual([
      "src/Button.module.css",
      "src/Button.tsx",
    ]);
  });

  it("exports empty origins without crash when omitted", () => {
    const exported = buildPanelContextExport({
      selection: makeSelection(),
      journal: createJournal(),
      snapshotRev: 0,
      compiledAt: BASE_TIME,
    });
    expect(exported.snapshot.origins).toEqual([]);
    expect(exported.snapshot.originsTruncated).toBe(false);
    expect(exported.markdown).toContain("_No map origins resolved._");
    expect(VisionContextSnapshotSchema.safeParse(exported.snapshot).success).toBe(true);
  });
});
