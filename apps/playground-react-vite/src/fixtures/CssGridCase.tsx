import type { ReactElement } from "react";

/**
 * CSS Grid fixture (PRD §31.4 item 5). Explicit `display: grid` layout with
 * named template areas, so the editor can exercise grid placement / reorder.
 */
export function CssGridCase(): ReactElement {
  return (
    <div className="p-6">
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "auto 1fr auto",
          gridTemplateAreas: `"header header header" "sidebar content content" "footer footer footer"`,
          minHeight: "16rem",
        }}
      >
        <div style={{ gridArea: "header" }} className="rounded bg-indigo-500 p-3 text-white">
          Header
        </div>
        <div style={{ gridArea: "sidebar" }} className="rounded bg-indigo-300 p-3 text-indigo-900">
          Sidebar
        </div>
        <div style={{ gridArea: "content" }} className="rounded bg-indigo-100 p-3 text-indigo-900">
          Content area
        </div>
        <div style={{ gridArea: "footer" }} className="rounded bg-indigo-700 p-3 text-white">
          Footer
        </div>
      </div>
    </div>
  );
}
