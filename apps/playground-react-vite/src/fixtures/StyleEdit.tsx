import type { ReactElement } from "react";

export function StyleEdit(): ReactElement {
  return (
    <div className="space-y-4 p-6">
      <div
        className="rounded bg-blue-500 p-4 text-white"
        style={{ height: "100px", width: "200px" }}
      >
        Inline-sized box
      </div>
      <div className="rounded border-2 border-dashed border-pink-500 p-4" style={{ opacity: 0.8 }}>
        Styled border box
      </div>
    </div>
  );
}
