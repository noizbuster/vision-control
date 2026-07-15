import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Operation } from "@vision-control/change-ir";
import { createJournalEntry, type JournalEntry } from "@vision-control/change-journal";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAgentPrompt } from "./agent-prompt.js";
import { BeforeAfterSummary, summarizeOperation } from "./BeforeAfterSummary.js";
import { ChangeJournal } from "./ChangeJournal.js";
import { JournalEntryView } from "./JournalEntry.js";
import { JournalToolbar } from "./JournalToolbar.js";

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
    target: { runtimeId: "btn-1" },
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

function classRemove(className: string): Operation {
  return {
    id: "op-class-rem1",
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
    kind: "class-remove",
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

function resize(fromValue: string, toValue: string): Operation {
  return {
    id: "op-resize-0001",
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
    kind: "resize-element",
    element: { runtimeId: "btn-1" },
    property: "width",
    fromValue,
    toValue,
    unit: "px",
  };
}

function reorder(fromIndex: number, toIndex: number): Operation {
  return {
    id: "op-reorder-0001",
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
    kind: "reorder-child",
    parent: { runtimeId: "row-1" },
    child: { runtimeId: "btn-1" },
    fromIndex,
    toIndex,
  };
}

function removeElement(): Operation {
  return {
    id: "op-remove-el1",
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
    kind: "remove-element",
    element: { runtimeId: "btn-1" },
    parent: { runtimeId: "row-1" },
    index: 2,
    tagName: "button",
  };
}

function makeSelectionSummary(): SelectionSummary {
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

function makeEntry(operation: Operation): JournalEntry {
  return createJournalEntry({
    id: "je-entry-aaa1",
    changeSetId: "cs-test-0001",
    transactionId: "tx-aaa1",
    sequence: 0,
    createdAt: BASE_TIME,
    appliedAt: BASE_TIME,
    actor: "human",
    operation,
    status: "committed",
  });
}

function sourceBackedStyleEdit(value: string, previousValue = "8px"): Operation {
  return {
    ...styleEdit(value, previousValue),
    target: { runtimeId: "runtime-1", sourceId: "src-button-1", selector: "#submit" },
  };
}

describe("buildAgentPrompt", () => {
  it("includes the inspected URL, element context, and journal operation JSON", () => {
    const prompt = buildAgentPrompt({
      inspectedUrl: "http://localhost:3000/account",
      selection: makeSelectionSummary(),
      entries: [makeEntry(sourceBackedStyleEdit("16px", "8px"))],
    });

    expect(prompt).toContain("URL: http://localhost:3000/account");
    expect(prompt).toContain("- Selector: #submit");
    expect(prompt).toContain("- Source ID: src-button-1");
    expect(prompt).toContain("- Active breakpoint: md");
    expect(prompt).toContain("## Source Context Hints");
    expect(prompt).toContain('<button id="submit">Submit</button>');
    expect(prompt).toContain('"kind": "style-edit"');
    expect(prompt).toContain('"property": "padding"');
    expect(prompt).not.toContain("[REDACTED:circular]");
    expect(prompt).toContain("## Verification Plan");
    expect(prompt).toContain(
      "verify runtime-1 sourceId=src-button-1 selector=#submit has CSS padding: 16px",
    );
    expect(prompt).toContain("Treat browser preview mutations as intent only");
  });

  it("redacts URL, element context, source snippet, and journal payload secrets", () => {
    const selection = makeSelectionSummary();
    selection.identity.sourceSnippet = `<button data-token="${GITHUB_TOKEN}">password=${PASSWORD_SECRET}</button>`;
    selection.attributes = [
      { name: "data-token", value: GITHUB_TOKEN },
      { name: "data-note", value: `api_key=${API_KEY}` },
    ];
    selection.classList = [{ name: `token-${GITHUB_TOKEN}`, source: "css" }];
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
      preconditions: [{ description: `api_key=${API_KEY}` }],
      evidence: [
        {
          kind: "dom-snapshot",
          artifactId: `authorization: Bearer ${BEARER_SECRET}`,
          capturedAt: BASE_TIME,
        },
      ],
      beforeSnapshot: {
        runtimeId: "runtime-1",
        textContent: `api_key=${API_KEY}`,
        attributes: { value: `password=${PASSWORD_SECRET}` },
      },
      afterSnapshot: {
        runtimeId: "runtime-1",
        textContent: `cookie: ${COOKIE_SECRET}`,
        attributes: { "data-token": GITHUB_TOKEN },
      },
    });

    const prompt = buildAgentPrompt({
      inspectedUrl: `http://localhost:3000/account?token=${GITHUB_TOKEN}&password=${PASSWORD_SECRET}#api_key=${API_KEY}`,
      selection,
      entries: [entry],
    });

    expect(prompt).toContain("[REDACTED");
    for (const secret of [PASSWORD_SECRET, GITHUB_TOKEN, API_KEY, COOKIE_SECRET, BEARER_SECRET]) {
      expect(prompt).not.toContain(secret);
    }
  });

  it("still creates a handoff prompt when no element or journal entry is available", () => {
    const prompt = buildAgentPrompt({
      inspectedUrl: null,
      selection: null,
      entries: [],
    });

    expect(prompt).toContain("URL: unknown");
    expect(prompt).toContain("No element is currently selected");
    expect(prompt).toContain("- Selected source id: unavailable");
    expect(prompt).toContain("No changes are currently recorded");
    expect(prompt).toContain("No journal entries yet");
  });

  it("orders journal entries by sequence so agents read edits oldest-first", () => {
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

    const prompt = buildAgentPrompt({
      inspectedUrl: "http://localhost:3000/account",
      selection: makeSelectionSummary(),
      entries: [second, first],
    });

    expect(prompt.indexOf('"kind": "class-add"')).toBeLessThan(
      prompt.indexOf('"kind": "style-edit"'),
    );
  });
});

describe("summarizeOperation", () => {
  it("summarizes a style edit", () => {
    expect(summarizeOperation(styleEdit("16px", "8px"))).toEqual({
      subject: "padding",
      from: "8px",
      to: "16px",
      variant: "set",
    });
  });

  it("summarizes a class add as an add", () => {
    expect(summarizeOperation(classAdd("bg-red-500"))).toEqual({
      subject: "bg-red-500",
      from: "",
      to: "bg-red-500",
      variant: "add",
    });
  });

  it("summarizes a class remove as a remove", () => {
    expect(summarizeOperation(classRemove("bg-blue-500"))).toEqual({
      subject: "bg-blue-500",
      from: "bg-blue-500",
      to: "",
      variant: "remove",
    });
  });

  it("summarizes a text edit", () => {
    expect(summarizeOperation(textEdit("World", "Hello"))).toEqual({
      subject: "text",
      from: "Hello",
      to: "World",
      variant: "set",
    });
  });

  it("summarizes a resize with units", () => {
    expect(summarizeOperation(resize("200px", "300px"))).toEqual({
      subject: "width",
      from: "200pxpx",
      to: "300pxpx",
      variant: "set",
    });
  });

  it("summarizes a reorder by index", () => {
    expect(summarizeOperation(reorder(2, 0))).toEqual({
      subject: "index",
      from: "2",
      to: "0",
      variant: "set",
    });
  });

  it("summarizes an element removal", () => {
    expect(summarizeOperation(removeElement())).toEqual({
      subject: "button",
      from: "<button> btn-1 from row-1[2]",
      to: "",
      variant: "remove",
    });
  });
});

describe("BeforeAfterSummary", () => {
  afterEach(cleanup);

  it("renders a set variant with subject, from, and to", () => {
    render(<BeforeAfterSummary operation={styleEdit("16px", "8px")} />);
    const node = screen.getByTestId("journal-summary");
    expect(node.textContent).toContain("padding");
    expect(node.textContent).toContain("8px");
    expect(node.textContent).toContain("16px");
  });

  it("renders an add variant with a + prefix", () => {
    render(<BeforeAfterSummary operation={classAdd("bg-red-500")} />);
    expect(screen.getByText("+ bg-red-500")).toBeDefined();
  });

  it("renders a remove variant with a - prefix", () => {
    render(<BeforeAfterSummary operation={classRemove("bg-blue-500")} />);
    expect(screen.getByText("- bg-blue-500")).toBeDefined();
  });

  it("renders an element removal with a - prefix", () => {
    render(<BeforeAfterSummary operation={removeElement()} />);
    expect(screen.getByText("- <button> btn-1 from row-1[2]")).toBeDefined();
  });
});

describe("JournalEntryView", () => {
  afterEach(cleanup);

  it("renders the status badge reflecting commit status", () => {
    render(
      <JournalEntryView
        id="je-entry-0001"
        operation={styleEdit("16px", "8px")}
        status="committed"
        appliedAt={BASE_TIME}
        now={BASE_TIME + 5_000}
      />,
    );
    const badge = screen.getByTestId("journal-status-badge");
    expect(badge.textContent).toBe("committed");
  });

  it("renders the reverted status for an undone entry", () => {
    render(
      <JournalEntryView
        id="je-entry-0002"
        operation={styleEdit("16px", "8px")}
        status="reverted"
        appliedAt={BASE_TIME}
        now={BASE_TIME + 5_000}
      />,
    );
    expect(screen.getByTestId("journal-status-badge").textContent).toBe("reverted");
  });
});

describe("JournalToolbar", () => {
  afterEach(cleanup);

  const exportHandlers = {
    contextExportStatus: "idle" as const,
    onCopyContextJson: vi.fn(),
    onCopyContextMarkdown: vi.fn(),
    onDownloadContextJson: vi.fn(),
    onDownloadContextMarkdown: vi.fn(),
  };

  it("disables Undo and Redo when nothing is available", () => {
    render(
      <JournalToolbar
        canUndo={false}
        canRedo={false}
        canCopyAgentPrompt
        agentPromptCopyState="idle"
        pendingCount={0}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={vi.fn()}
        onCopyAgentPrompt={vi.fn()}
        {...exportHandlers}
      />,
    );
    expect(screen.getByRole("button", { name: "Undo last change" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Redo change" })).toHaveProperty("disabled", true);
  });

  it("invokes the undo handler when Undo is clicked", () => {
    const onUndo = vi.fn();
    render(
      <JournalToolbar
        canUndo
        canRedo={false}
        canCopyAgentPrompt
        agentPromptCopyState="idle"
        pendingCount={1}
        onUndo={onUndo}
        onRedo={vi.fn()}
        onClear={vi.fn()}
        onCopyAgentPrompt={vi.fn()}
        {...exportHandlers}
      />,
    );
    screen.getByRole("button", { name: "Undo last change" }).click();
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("shows the pending count in the transaction status", () => {
    render(
      <JournalToolbar
        canUndo={false}
        canRedo={false}
        canCopyAgentPrompt
        agentPromptCopyState="idle"
        pendingCount={3}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={vi.fn()}
        onCopyAgentPrompt={vi.fn()}
        {...exportHandlers}
      />,
    );
    expect(screen.getByTestId("journal-transaction-status").textContent).toBe("3 pending");
  });

  it("invokes the agent prompt copy handler and reports copy status", () => {
    const onCopyAgentPrompt = vi.fn();
    render(
      <JournalToolbar
        canUndo={false}
        canRedo={false}
        canCopyAgentPrompt
        agentPromptCopyState="copied"
        pendingCount={0}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={vi.fn()}
        onCopyAgentPrompt={onCopyAgentPrompt}
        {...exportHandlers}
      />,
    );

    screen.getByRole("button", { name: "Copy agent prompt" }).click();

    expect(onCopyAgentPrompt).toHaveBeenCalledOnce();
    expect(screen.getByTestId("agent-prompt-copy-status").textContent).toBe("Agent prompt copied");
  });

  it("invokes context export copy and download handlers", () => {
    const onCopyContextJson = vi.fn();
    const onCopyContextMarkdown = vi.fn();
    const onDownloadContextJson = vi.fn();
    const onDownloadContextMarkdown = vi.fn();
    render(
      <JournalToolbar
        canUndo={false}
        canRedo={false}
        canCopyAgentPrompt
        agentPromptCopyState="idle"
        contextExportStatus="copied-json"
        pendingCount={0}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={vi.fn()}
        onCopyAgentPrompt={vi.fn()}
        onCopyContextJson={onCopyContextJson}
        onCopyContextMarkdown={onCopyContextMarkdown}
        onDownloadContextJson={onDownloadContextJson}
        onDownloadContextMarkdown={onDownloadContextMarkdown}
      />,
    );

    screen.getByRole("button", { name: "Copy context as JSON" }).click();
    screen.getByRole("button", { name: "Copy context as Markdown" }).click();
    screen.getByRole("button", { name: "Download context as JSON" }).click();
    screen.getByRole("button", { name: "Download context as Markdown" }).click();

    expect(onCopyContextJson).toHaveBeenCalledOnce();
    expect(onCopyContextMarkdown).toHaveBeenCalledOnce();
    expect(onDownloadContextJson).toHaveBeenCalledOnce();
    expect(onDownloadContextMarkdown).toHaveBeenCalledOnce();
    expect(screen.getByTestId("context-export-status").textContent).toBe("JSON copied");
  });
});

describe("ChangeJournal", () => {
  afterEach(cleanup);

  const exportHandlers = {
    contextExportStatus: "idle" as const,
    onCopyContextJson: vi.fn(),
    onCopyContextMarkdown: vi.fn(),
    onDownloadContextJson: vi.fn(),
    onDownloadContextMarkdown: vi.fn(),
  };

  it("shows the empty state when there are no entries", () => {
    render(
      <ChangeJournal
        entries={[]}
        canUndo={false}
        canRedo={false}
        canCopyAgentPrompt
        agentPromptCopyState="idle"
        pendingCount={0}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={vi.fn()}
        onCopyAgentPrompt={vi.fn()}
        {...exportHandlers}
      />,
    );
    expect(screen.getByTestId("change-journal-empty")).toBeDefined();
  });

  it("lists entries newest-first", () => {
    const first: JournalEntry = createJournalEntry({
      id: "je-entry-aaa1",
      changeSetId: "cs-test-0001",
      transactionId: "tx-aaa1",
      sequence: 0,
      createdAt: BASE_TIME,
      appliedAt: BASE_TIME,
      actor: "human",
      operation: styleEdit("16px", "8px"),
      status: "committed",
    });
    const second: JournalEntry = createJournalEntry({
      id: "je-entry-bbb1",
      changeSetId: "cs-test-0001",
      transactionId: "tx-bbb1",
      sequence: 1,
      createdAt: BASE_TIME + 1_000,
      appliedAt: BASE_TIME + 1_000,
      actor: "human",
      operation: classAdd("bg-red-500"),
      status: "preview",
    });
    render(
      <ChangeJournal
        entries={[second, first]}
        canUndo
        canRedo={false}
        canCopyAgentPrompt
        agentPromptCopyState="idle"
        pendingCount={1}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={vi.fn()}
        onCopyAgentPrompt={vi.fn()}
        {...exportHandlers}
      />,
    );
    const items = screen.getByTestId("change-journal-list");
    const ids = items.querySelectorAll("[data-entry-id]");
    expect(ids[0]?.getAttribute("data-entry-id")).toBe("je-entry-bbb1");
    expect(ids[1]?.getAttribute("data-entry-id")).toBe("je-entry-aaa1");
  });

  it("calls onClear when Clear is clicked", () => {
    const onClear = vi.fn();
    render(
      <ChangeJournal
        entries={[]}
        canUndo
        canRedo={false}
        canCopyAgentPrompt
        agentPromptCopyState="idle"
        pendingCount={1}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={onClear}
        onCopyAgentPrompt={vi.fn()}
        {...exportHandlers}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear all changes" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
