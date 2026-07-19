import type { ReactElement } from "react";

/**
 * HMR demo fixture (PRD §42 steps 10-12).
 *
 * Renders a source-marked card in Vite development builds. The real-HMR e2e
 * (`e2e/hmr-demo.spec.ts`) edits this file with a direct source write (agent
 * file-tool style; product codemod removed), waits for Vite HMR to re-render
 * the component, and asserts the verification engine re-identifies the card by
 * its source id and verifies the post-HMR computed style.
 *
 * The inline `style` object is the edit target: a source-level change to the
 * padding value here flows through Vite HMR into the live DOM, where the
 * verification engine reads it.
 */
export function HmrDemo(): ReactElement {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">HMR Demo</h1>
      <p className="mt-2 text-slate-600">
        This fixture exercises the PRD §42 demo loop: a real source edit triggers Vite HMR, and the
        verification engine re-identifies the target by its source id and verifies the post-HMR DOM.
      </p>
      <div
        {...(import.meta.env.DEV ? { "data-vc-source": "hmr-demo-card-01" } : {})}
        className="mt-4 rounded border-2 border-slate-300"
        style={{ padding: "12px", backgroundColor: "#dbeafe" }}
      >
        <span>HMR demo card</span>
      </div>
    </div>
  );
}
