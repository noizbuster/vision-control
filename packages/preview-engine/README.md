# @vision-control/preview-engine

Reversible runtime preview engine with transaction lifecycle and React
reconciliation fallback.

Applies visual mutations to the inspected page's DOM that are temporary and
fully reversible. The journal records INTENT; the preview engine renders the
VISUAL EFFECT. The verification engine calls `clearAll()` before asserting
source-patched state.

> Preview is NOT source truth (PRD section 13, Appendix D.1).
> Nx tags: platform:isomorphic, type:library, scope:preview-engine.

## Architecture

```
PreviewManager (orchestrator + clearAll)
  |- StylesheetManager     — dynamic <style> in page <head>
  |- StyleAdapter          — CSS rule injection (style-edit, resize)
  |- ClassAdapter          — classList add/remove/replace
  |- TextAdapter           — textContent replacement
  |- StructuralAdapter     — reorder/reparent DOM moves
  |- TransformAdapter      — runtime-only transform (drag ghost)
  |- ReconciliationObserver — MutationObserver revert detection
  +- SimulatedPreview      — ghost fallback via GhostRenderer interface
```

DOM access is through an injected `PreviewDomAdapter` interface (inspector-core
pattern), keeping the package isomorphic. The browser factory
(`createBrowserPreviewDomAdapter`) wires real DOM access; tests inject a
jsdom-backed or fake adapter.

## Scripts

Run from the repository root:

```bash
pnpm build        # tsc -p tsconfig.build.json -> dist/
pnpm typecheck    # tsc --noEmit -p tsconfig.json
pnpm test         # vitest run
```
