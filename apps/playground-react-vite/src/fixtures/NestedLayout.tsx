import type { ReactElement } from "react";

export function NestedLayout(): ReactElement {
  return (
    <div className="block p-6">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4">
        <div className="flex flex-row gap-4">
          <div className="flex-1 rounded bg-slate-200 p-4">Row item 1</div>
          <div className="flex-1 rounded bg-slate-200 p-4">Row item 2</div>
        </div>
        <div className="block rounded bg-slate-100 p-4">Block child</div>
      </div>
    </div>
  );
}
