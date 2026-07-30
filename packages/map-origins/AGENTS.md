<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# map-origins

## Purpose

CSS + JS source-map origin resolution for content-script map fetch with ADR-019 C4 caps (max maps/bytes). No node:fs, no chrome.debugger, no new mandatory host permissions.

Package: `@vision-control/map-origins` · Nx project typically `map-origins`.

## Key Files

| File | Description |
|------|-------------|
| `src/resolve-css-origins.ts` | CSS rule → map → origin |
| `src/resolve-js-origins.ts` | Script → map → module candidates |
| `src/source-map.ts` | Source map parse/apply |
| `src/source-mapping-url.ts` | sourceMappingURL extract |
| `src/caps.ts` | C4 caps enforcement |
| `src/confidence-policy.ts` | Confidence policy |
| `src/fetch-text.ts` | Capped fetch injection |
| `src/normalize-source-path.ts` | webpack:// path normalize |
| `src/merge-origin-results.ts` | Merge/dedupe origins |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Injected `fetch` only (page network/CORS/CSP).
- Enforce caps per selection compile: max 20 maps, 1 MiB each.
- Marker HIGH is not a product path — maps/CSSOM only.

### Testing Requirements

```bash
pnpm nx run map-origins:typecheck
pnpm nx run map-origins:test
pnpm nx run map-origins:build
```

caps, resolve-css/js, source-map, merge, confidence tests.

### Common Patterns

- Pure resolve functions + injected fetch.
- Normalized paths for webpack/vite.

### Anti-Patterns

- No background arbitrary-host fetch product path.
- No raising caps silently without ADR.

## Dependencies

### Internal

- None beyond workspace public APIs as needed.

### External

- None beyond workspace catalog norms.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
