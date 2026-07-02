import type { ReactElement } from "react";

export function IdenticalButtonsA(): ReactElement {
  return (
    <button
      type="button"
      className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
    >
      Identical button
    </button>
  );
}
