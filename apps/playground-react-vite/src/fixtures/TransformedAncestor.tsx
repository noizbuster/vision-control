import type { ReactElement } from "react";

export function TransformedAncestor(): ReactElement {
  return (
    <div className="p-12">
      <div className="inline-block rotate-[5deg] transform rounded-lg bg-amber-400 p-6 shadow-lg">
        <button
          type="button"
          className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
        >
          Inside transformed ancestor
        </button>
      </div>
    </div>
  );
}
