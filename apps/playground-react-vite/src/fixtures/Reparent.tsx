import type { ReactElement } from "react";

export function Reparent(): ReactElement {
  return (
    <div className="flex h-screen">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
          >
            Move up
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
          >
            Move down
          </button>
        </div>
        <div className="mt-auto">
          <button
            type="button"
            className="rounded bg-red-500 px-3 py-2 text-white hover:bg-red-600"
          >
            Reset
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <header className="mb-4 flex gap-2">
          <button type="button" className="rounded border border-slate-300 px-3 py-2">
            Action A
          </button>
          <button type="button" className="rounded border border-slate-300 px-3 py-2">
            Action B
          </button>
        </header>
        <p className="text-slate-700">Main content area.</p>
      </main>
    </div>
  );
}
