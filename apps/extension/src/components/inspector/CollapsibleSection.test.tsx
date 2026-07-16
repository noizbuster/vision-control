import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CollapsibleSection } from "./CollapsibleSection.js";

afterEach(() => {
  cleanup();
});

describe("CollapsibleSection", () => {
  it("renders open by default and toggles closed on summary click", () => {
    render(
      <CollapsibleSection title="Identity">
        <p>body content</p>
      </CollapsibleSection>,
    );

    const details = screen.getByText("Identity").closest("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(true);
    expect(screen.getByText("body content")).toBeDefined();

    fireEvent.click(screen.getByText("Identity"));
    expect(details?.open).toBe(false);
  });

  it("honors defaultOpen=false", () => {
    render(
      <CollapsibleSection title="Computed Style" defaultOpen={false}>
        <p>hidden until open</p>
      </CollapsibleSection>,
    );

    const details = screen.getByText("Computed Style").closest("details");
    expect(details?.open).toBe(false);
  });
});
