import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChangeJournal } from "./ChangeJournal.js";
import { JournalToolbar } from "./JournalToolbar.js";

const exportHandlers = {
  contextExportStatus: "idle" as const,
  onCopyContextJson: vi.fn(),
  onCopyContextMarkdown: vi.fn(),
  onDownloadContextJson: vi.fn(),
  onDownloadContextMarkdown: vi.fn(),
};

describe("JournalToolbar", () => {
  afterEach(cleanup);

  it("disables undo and redo when unavailable", () => {
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

  it("invokes undo", () => {
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

  it("shows pending count", () => {
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

  it("invokes agent prompt copy and reports status", () => {
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

  it("invokes context export handlers", () => {
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

  it("routes clear from the journal", () => {
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
