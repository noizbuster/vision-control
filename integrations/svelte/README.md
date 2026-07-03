# @vision-control/svelte

Svelte dev-only source marker preprocessor and source resolver adapter (V2
spike — VC-V1V2-19 / ADR-008).

## What it does

Injects opaque `data-vc-source` markers onto Svelte component markup in **dev
mode only** via a Svelte `PreprocessorGroup`. The marker token is a truncated
SHA-256 hash over the workspace-relative path, source range, and element
fingerprint (same algorithm as `@vision-control/vite-react`). It contains no
file path. Production builds are untouched.

This is a guarded spike: basic host elements (`<div>`, `<button>`, custom
components with static class attributes) are marked. Unsupported Svelte
constructs (`<slot>`, `<svelte:component>`, `{#if}`, `{#each}`, dynamic class
directives) produce explicit "not yet supported" diagnostics rather than
silent failure.

## Public API

- `visionControlSveltePreprocessor(options?)` — a Svelte `PreprocessorGroup`.
- `injectSvelteMarkers(params)` — the pure marker-injection transform.
- `isSvelteProduction(options?, env?)` — production gate.
- `SVELTE_ADAPTER` — source resolver adapter (marker evidence, HIGH confidence).
- `createSvelteAdapter(data)` — factory for adapters with injected metadata.

> Nx tags: platform:node, type:integration, scope:svelte.
