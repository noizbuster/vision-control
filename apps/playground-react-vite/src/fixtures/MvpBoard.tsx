import type { ReactElement } from "react";

export function MvpBoard(): ReactElement {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold text-slate-900">MVP Board</h1>
      {["Select", "Edit text", "Edit style", "Reorder flex", "Resize"].map((title) => (
        <div key={title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500">Fixture card for {title.toLowerCase()}.</p>
        </div>
      ))}
    </div>
  );
}
