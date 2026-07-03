import type { ReactElement } from "react";

/**
 * Responsive breakpoints fixture (PRD §31.4 item 12). Layout shifts across
 * Tailwind breakpoints (sm / md / lg) so the editor can exercise breakpoint-
 * aware context and responsive editing.
 */
export function ResponsiveBreakpoints(): ReactElement {
  return (
    <div className="p-6">
      {/* Stacked on mobile, two columns at md, three columns at lg. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded bg-rose-500 p-4 text-white">
          <h3 className="text-sm font-bold md:text-base lg:text-lg">Card A</h3>
          <p className="mt-1 text-xs md:text-sm">One column below md.</p>
        </div>
        <div className="rounded bg-rose-400 p-4 text-white">
          <h3 className="text-sm font-bold md:text-base lg:text-lg">Card B</h3>
          <p className="mt-1 text-xs md:text-sm">Two columns from md.</p>
        </div>
        <div className="rounded bg-rose-300 p-4 text-rose-900">
          <h3 className="text-sm font-bold md:text-base lg:text-lg">Card C</h3>
          <p className="mt-1 text-xs md:text-sm">Three columns from lg.</p>
        </div>
      </div>
      {/* Visibility flips by breakpoint. */}
      <div className="mt-4">
        <p className="block text-xs text-slate-500 sm:hidden">Mobile layout</p>
        <p className="hidden text-sm text-slate-600 sm:block md:hidden">Small layout</p>
        <p className="hidden text-base text-slate-700 md:block lg:hidden">Medium layout</p>
        <p className="hidden text-lg text-slate-800 lg:block">Large layout</p>
      </div>
    </div>
  );
}
