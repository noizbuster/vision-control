# @vision-control/next-react

Next.js dev-only source marker plugin and source resolver adapter (V1 —
VC-V1V2-13 / ADR-008).

## What it does

Injects opaque `data-vc-source` markers onto Next.js JSX/TSX elements in **dev
mode only**. The marker token is a truncated SHA-256 hash over the
workspace-relative path, source range, and element fingerprint. It contains no
file path. Production builds are untouched — the `withVisionControlSourceMarkers`
wrapper returns the config unchanged when `NODE_ENV=production`.

## Public API

- `withVisionControlSourceMarkers(nextConfig?, options?)` — Next.js config
  wrapper. Dev: adds the marker transform to the webpack pipeline. Production:
  complete no-op.
- `injectNextMarkers(params)` — the pure marker-injection transform.
- `NEXT_ADAPTER` — source resolver adapter (marker evidence, HIGH confidence).
- `createNextAdapter(data)` — factory for adapters with injected metadata.
- `detectTurbopack(input)` — Turbopack detection (V1 = webpack/Babel only).
- `assertHydrationSafe(input)` — hydration-safety verification.

> Nx tags: platform:node, type:integration, scope:next-react.
