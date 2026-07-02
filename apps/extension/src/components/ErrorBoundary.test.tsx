import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary.js";

function Thrower(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">safe</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child").textContent).toBe("safe");
  });

  it("renders a fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Vision Control panel failed")).toBeDefined();
    expect(screen.getByText("boom")).toBeDefined();
    expect(screen.getByRole("button", { name: "Reload panel" })).toBeDefined();
  });
});
