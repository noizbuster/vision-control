import { cleanup, render, screen } from "@testing-library/react";
import { appendEntry, createJournal, createJournalEntry } from "@vision-control/change-journal";
import { afterEach, describe, expect, it } from "vitest";

import { makeFlexResizeOperation } from "../../journal/flex-resize-operation.test-fixture.js";
import { buildAgentPrompt } from "./agent-prompt.js";
import { BeforeAfterSummary, operationLabel, summarizeOperation } from "./BeforeAfterSummary.js";
import { buildPanelContextExport } from "./context-export.js";

describe("resize-flex-pair journal projection", () => {
  afterEach(cleanup);

  it("summarizes and renders the aggregate before/after values", () => {
    const operation = makeFlexResizeOperation();

    expect(summarizeOperation(operation)).toEqual({
      subject: "flex pair",
      from: "200px / 180px",
      to: "240px / 140px",
      variant: "set",
    });
    expect(operationLabel(operation)).toBe("Flex resize");
    render(<BeforeAfterSummary operation={operation} />);
    expect(screen.getByTestId("journal-summary").textContent).toContain("240px / 140px");
  });

  it("Given fractional Flex dimensions When summarized for a narrow journal row Then keeps compact pixel pairs readable", () => {
    // Given
    const operation = makeFlexResizeOperation();
    const [primary, neighbor] = operation.members;
    const fractionalOperation: typeof operation = {
      ...operation,
      members: [
        {
          ...primary,
          before: { ...primary.before, usedMainSize: 147.41666666666666 },
          after: { ...primary.after, usedMainSize: 187.41666666666666 },
        },
        {
          ...neighbor,
          before: { ...neighbor.before, usedMainSize: 127.91666666666666 },
          after: { ...neighbor.after, usedMainSize: 87.91666666666666 },
        },
      ],
    };
    const preservedOperation = structuredClone(fractionalOperation);

    // When
    const summary = summarizeOperation(fractionalOperation);
    render(<BeforeAfterSummary operation={fractionalOperation} />);

    // Then
    expect(fractionalOperation).toEqual(preservedOperation);
    expect(fractionalOperation.members[0].before.usedMainSize).toBe(147.41666666666666);
    expect(summary).toEqual({
      subject: "flex pair",
      from: "147.4px / 127.9px",
      to: "187.4px / 87.9px",
      variant: "set",
    });
    const rendered = screen.getByTestId("journal-summary");
    expect(rendered.textContent).toContain("147.4px / 127.9px");
    expect(rendered.textContent).toContain("187.4px / 87.9px");
  });

  it("exports one structured pair operation to local context and prompt", () => {
    const operation = makeFlexResizeOperation();
    const journal = appendEntry(
      createJournal(),
      createJournalEntry({
        id: "je-flex-pair-001",
        changeSetId: "cs-flex-pair-001",
        transactionId: "tx-flex-pair-001",
        sequence: 0,
        operation,
        status: "committed",
      }),
    );
    const exported = buildPanelContextExport({
      selection: null,
      journal,
      snapshotRev: 1,
      compiledAt: operation.timestamp,
    });

    expect(exported.snapshot.operations).toHaveLength(1);
    const projected = exported.snapshot.operations[0];
    expect(projected?.kind).toBe("resize-flex-pair");
    if (projected?.kind !== "resize-flex-pair") return;
    expect(projected.detail.members[1].element.fingerprint).toBe("fingerprint-1");
    expect(projected.detail.witnessCount).toBe(1);

    const prompt = buildAgentPrompt({
      selection: null,
      journal,
      compiledAt: operation.timestamp,
    });
    expect(prompt).toContain("fingerprint-0");
    expect(prompt).toContain("fingerprint-1");
    expect(prompt).toContain("fingerprint-2");
    expect(prompt).toContain("0 0 240px");
    expect(prompt).toContain("0 0 140px");
    expect(prompt).toContain("horizontal-tb/ltr/row/inline/x/1/main-end");
    expect(prompt).toContain("400,0,200,100");
  });
});
