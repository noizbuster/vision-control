import type { ReactElement } from "react";

export function ScrollContainer(): ReactElement {
  return (
    <div className="h-64 w-64 overflow-y-auto rounded border border-slate-300 p-4">
      {Array.from({ length: 20 }).map((_, index) => (
        <p key={index} className="py-2 text-slate-700">
          Scrollable line {index + 1}
        </p>
      ))}
    </div>
  );
}
