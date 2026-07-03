import { cleanup, render, screen } from "@testing-library/react";
import type { AlignmentCommandKind } from "@vision-control/layout-engine";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AlignmentPanel } from "./AlignmentPanel.js";

describe("AlignmentPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a button for every alignment command", () => {
    render(<AlignmentPanel memberCount={3} />);

    // commandLabel produces these labels.
    expect(screen.getByRole("button", { name: "Align left" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Align center (horizontal)" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Align right" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Align top" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Align middle (vertical)" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Align bottom" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Distribute horizontally" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Distribute vertically" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Equalize gap" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Match size" })).toBeDefined();
  });

  it("renders exactly ten command buttons", () => {
    render(<AlignmentPanel memberCount={3} />);
    const panel = document.querySelector("[data-vc-alignment-panel]");
    expect(panel?.querySelectorAll("button").length).toBe(10);
  });

  it("disables all commands when fewer than two members are selected", () => {
    render(<AlignmentPanel memberCount={1} />);
    const hint = screen.getByText("Select at least two elements to align.");
    expect(hint).toBeDefined();
    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("enables commands when at least two members are selected", () => {
    render(<AlignmentPanel memberCount={2} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it("invokes onCommand with the chosen command kind when a button is clicked", () => {
    const onCommand = vi.fn();
    render(<AlignmentPanel memberCount={3} onCommand={onCommand} />);

    screen.getByRole("button", { name: "Equalize gap" }).click();
    expect(onCommand).toHaveBeenCalledWith("equal-gap" satisfies AlignmentCommandKind);

    screen.getByRole("button", { name: "Align left" }).click();
    expect(onCommand).toHaveBeenCalledWith("align-left" satisfies AlignmentCommandKind);
  });

  it("does not throw when onCommand is omitted", () => {
    render(<AlignmentPanel memberCount={3} />);
    expect(() =>
      screen.getByRole("button", { name: "Align center (horizontal)" }).click(),
    ).not.toThrow();
  });
});
