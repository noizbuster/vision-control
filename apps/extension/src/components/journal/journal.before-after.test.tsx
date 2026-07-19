import { cleanup, render, screen } from "@testing-library/react";
import { createJournalEntry, type JournalEntry } from "@vision-control/change-journal";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BeforeAfterSummary, summarizeOperation } from "./BeforeAfterSummary.js";
import { ChangeJournal } from "./ChangeJournal.js";
import { JournalEntryView } from "./JournalEntry.js";
import {
  BASE_TIME,
  classAdd,
  classRemove,
  removeElement,
  reorder,
  resize,
  styleEdit,
  textEdit,
} from "./journal.test-fixtures.js";

describe("journal operation summary", () => {
  it("summarizes a style edit", () => {
    expect(summarizeOperation(styleEdit("16px", "8px"))).toEqual({
      subject: "padding",
      from: "8px",
      to: "16px",
      variant: "set",
    });
  });

  it("summarizes a class addition", () => {
    expect(summarizeOperation(classAdd("bg-red-500"))).toEqual({
      subject: "bg-red-500",
      from: "",
      to: "bg-red-500",
      variant: "add",
    });
  });

  it("summarizes a class removal", () => {
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

  it("summarizes style, text, and resize edits", () => {
    expect(summarizeOperation(styleEdit("16px", "8px"))).toEqual({
      subject: "padding",
      from: "8px",
      to: "16px",
      variant: "set",
    });
    expect(summarizeOperation(textEdit("World", "Hello"))).toEqual({
      subject: "text",
      from: "Hello",
      to: "World",
      variant: "set",
    });
    expect(summarizeOperation(resize("200px", "300px"))).toEqual({
      subject: "width",
      from: "200pxpx",
      to: "300pxpx",
      variant: "set",
    });
  });

  it("summarizes class additions and removals", () => {
    expect(summarizeOperation(classAdd("bg-red-500"))).toEqual({
      subject: "bg-red-500",
      from: "",
      to: "bg-red-500",
      variant: "add",
    });
    expect(summarizeOperation(classRemove("bg-blue-500"))).toEqual({
      subject: "bg-blue-500",
      from: "bg-blue-500",
      to: "",
      variant: "remove",
    });
  });

  it("summarizes reorder and element removal", () => {
    expect(summarizeOperation(reorder(2, 0))).toEqual({
      subject: "index",
      from: "2",
      to: "0",
      variant: "set",
    });
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

  it("renders set, add, and remove variants", () => {
    const setView = render(<BeforeAfterSummary operation={styleEdit("16px", "8px")} />);
    expect(screen.getByTestId("journal-summary").textContent).toContain("padding");
    expect(screen.getByTestId("journal-summary").textContent).toContain("8px");
    expect(screen.getByTestId("journal-summary").textContent).toContain("16px");
    setView.unmount();
    render(<BeforeAfterSummary operation={classAdd("bg-red-500")} />);
    expect(screen.getByText("+ bg-red-500")).toBeDefined();
    cleanup();
    render(<BeforeAfterSummary operation={classRemove("bg-blue-500")} />);
    expect(screen.getByText("- bg-blue-500")).toBeDefined();
  });

  it("renders element removal", () => {
    render(<BeforeAfterSummary operation={removeElement()} />);
    expect(screen.getByText("- <button> btn-1 from row-1[2]")).toBeDefined();
  });

  it("renders an add variant", () => {
    render(<BeforeAfterSummary operation={classAdd("bg-red-500")} />);
    expect(screen.getByText("+ bg-red-500")).toBeDefined();
  });

  it("renders a remove variant", () => {
    render(<BeforeAfterSummary operation={classRemove("bg-blue-500")} />);
    expect(screen.getByText("- bg-blue-500")).toBeDefined();
  });
});

describe("JournalEntryView", () => {
  afterEach(cleanup);

  it("renders committed and reverted status", () => {
    const committed = render(
      <JournalEntryView
        id="je-entry-0001"
        operation={styleEdit("16px", "8px")}
        status="committed"
        appliedAt={BASE_TIME}
        now={BASE_TIME + 5_000}
      />,
    );
    expect(screen.getByTestId("journal-status-badge").textContent).toBe("committed");
    committed.unmount();
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

  it("renders the committed status badge", () => {
    render(
      <JournalEntryView
        id="je-entry-0003"
        operation={styleEdit("16px", "8px")}
        status="committed"
        appliedAt={BASE_TIME}
        now={BASE_TIME + 5_000}
      />,
    );
    expect(screen.getByTestId("journal-status-badge").textContent).toBe("committed");
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

  it("shows the empty state", () => {
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

  it("lists entries in supplied newest-first order", () => {
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
    const entries = screen.getByTestId("change-journal-list").querySelectorAll("[data-entry-id]");
    expect(entries[0]?.getAttribute("data-entry-id")).toBe("je-entry-bbb1");
    expect(entries[1]?.getAttribute("data-entry-id")).toBe("je-entry-aaa1");
  });
});
