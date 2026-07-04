# @vision-control/next-react

Next.js dev-only source marker plugin and source resolver adapter (V1 —
shipped, VC-V1V2-13 / ADR-008).

## What it does

Injects opaque `data-vc-source` markers onto Next.js JSX/TSX elements in **dev
mode only**. The marker token is a truncated SHA-256 hash over the
workspace-relative path, source range, and element fingerprint. It contains no
file path. Production builds are untouched — the `withVisionControlSourceMarkers`
wrapper returns the config unchanged when `NODE_ENV=production`.

Markers inject via **both** bundler paths:

- **webpack** (`next dev`, `next build`) — a webpack `pre` loader rule.
- **Turbopack** (`next dev --turbo`, `next build --turbo`, Next 15+) — a
  `turbopack.rules` entry. The loader runs via webpack's `loader-runner` in a
  Node worker, so the Babel-based transform executes unmodified — no SWC rewrite
  required (verified on Next.js 15.5.4).

Both paths are dev-only (gated by `isNextProduction`). Production builds via
either bundler ship zero markers.

## Public API

- `withVisionControlSourceMarkers(nextConfig?, options?)` — Next.js config
  wrapper. Dev: adds the marker transform to both the webpack pipeline and the
  Turbopack `turbopack.rules`. Production: complete no-op.
- `injectNextMarkers(params)` — the pure marker-injection transform.
- `NEXT_ADAPTER` — source resolver adapter (marker evidence, HIGH confidence).
- `createNextAdapter(data)` — factory for adapters with injected metadata.
- `detectTurbopack(input)` — Turbopack detection. Returns `supported: true`
  when Turbopack is active and the marker rule is wired; an advisory diagnostic
  when active but unconfigured.
- `assertHydrationSafe(input)` — hydration-safety verification.

> Nx tags: platform:node, type:integration, scope:next-react.
