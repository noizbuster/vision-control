import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FlexResizeStatus } from "./FlexResizeStatus.js";

describe("FlexResizeStatus", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not mount when Resize status data is absent", () => {
    render(<FlexResizeStatus status={null} />);

    expect(screen.queryByTestId("flex-resize-status")).toBeNull();
  });

  it("announces valid and held pair Resize states politely", () => {
    const { rerender } = render(<FlexResizeStatus status={{ kind: "valid" }} />);

    const status = screen.getByTestId("flex-resize-status");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("Paired resize ready");

    rerender(<FlexResizeStatus status={{ kind: "active" }} />);

    expect(screen.getByTestId("flex-resize-status").textContent).toContain("Resizing paired items");
  });

  it("announces disabled-edge and blocked reasons as alerts", () => {
    const { rerender } = render(
      <FlexResizeStatus
        status={{ kind: "disabled-edge", message: "No visual neighbor at this edge" }}
      />,
    );

    expect(screen.getByTestId("flex-resize-status").getAttribute("role")).toBe("alert");
    expect(screen.getByText("No visual neighbor at this edge")).toBeDefined();

    rerender(
      <FlexResizeStatus status={{ kind: "blocked", message: "Wrapped flex items are blocked" }} />,
    );

    expect(screen.getByTestId("flex-resize-status").getAttribute("role")).toBe("alert");
    expect(screen.getByText("Wrapped flex items are blocked")).toBeDefined();
  });

  it("uses panel design tokens without raw visual values", async () => {
    const extensionRoot = process.cwd().endsWith("/apps/extension")
      ? process.cwd()
      : resolve(process.cwd(), "apps/extension");
    const stylesheet = await readFile(
      resolve(extensionRoot, "src/styles/flex-resize-status.css"),
      "utf8",
    );

    expect(stylesheet).toContain("var(--vc-success)");
    expect(stylesheet).toContain("var(--vc-warning)");
    expect(stylesheet).toContain("var(--vc-error)");
    expect(stylesheet).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(stylesheet).not.toMatch(/\b(?:margin|padding|gap):\s*\d+px/);
  });
});
