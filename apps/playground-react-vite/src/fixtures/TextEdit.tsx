import type { ReactElement } from "react";

export function TextEdit(): ReactElement {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-slate-900">Editable Heading</h1>
      <p className="mt-2 text-slate-700">This paragraph text should be editable.</p>
      <button
        type="button"
        className="mt-4 rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
      >
        Button label
      </button>
    </div>
  );
}
