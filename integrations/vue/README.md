# @vision-control/vue

Vue dev-only source marker plugin and source resolver adapter (V2 spike —
VC-V1V2-19 / ADR-008).

## What it does

Injects opaque `data-vc-source` markers onto Vue SFC template elements in **dev
mode only**. The marker token is a truncated SHA-256 hash over the
workspace-relative path, source range, and element fingerprint (same algorithm
as `@vision-control/vite-react`). It contains no file path. Production builds
are untouched.

This is a guarded spike: basic host elements (`<div>`, `<button>`, custom
components with static class attributes) are marked. Unsupported Vue constructs
(render functions, `<slot>`, dynamic components, `<suspense>`,
`<teleport>`) produce explicit "not yet supported" diagnostics rather than
silent failure.

## Public API

- `visionControlVueMarkerPlugin(options?)` — a Vite plugin object.
- `injectVueMarkers(params)` — the pure marker-injection transform.
- `isVueProduction(options?, env?)` — production gate.
- `VUE_ADAPTER` — source resolver adapter (marker evidence, HIGH confidence).
- `createVueAdapter(data)` — factory for adapters with injected metadata.

> Nx tags: platform:node, type:integration, scope:vue.
