import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Operation } from "@vision-control/change-ir";
import { createJournalEntry, type JournalEntry } from "@vision-control/change-journal";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BeforeAfterSummary, summarizeOperation } from "./BeforeAfterSummary.js";
import { ChangeJournal } from "./ChangeJournal.js";
import { JournalEntryView } from "./JournalEntry.js";
import { JournalToolbar } from "./JournalToolbar.js";

const BASE_TIME = 1_700_000_000_000;

function styleEdit(value: string, previousValue = "8px"): Operation {
  return {
    id: "op-style-0001",
    timestamp: BASE_TIME,
    runtime: false,
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
    kind: "reorder-child",
    parent: { runtimeId: "row-1" },
    child: { runtimeId: "btn-1" },
    fromIndex,
    toIndex,
  };
}

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

  it("disables Undo and Redo when nothing is available", () => {
    render(
      <JournalToolbar
        canUndo={false}
        canRedo={false}
        pendingCount={0}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={vi.fn()}
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
        pendingCount={1}
        onUndo={onUndo}
        onRedo={vi.fn()}
        onClear={vi.fn()}
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
        pendingCount={3}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId("journal-transaction-status").textContent).toBe("3 pending");
  });
});

describe("ChangeJournal", () => {
  afterEach(cleanup);

  it("shows the empty state when there are no entries", () => {
    render(
      <ChangeJournal
        entries={[]}
        canUndo={false}
        canRedo={false}
        pendingCount={0}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={vi.fn()}
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
        pendingCount={1}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={vi.fn()}
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
        pendingCount={1}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear all changes" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
