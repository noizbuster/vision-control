# @vision-control/map-origins

CSS source-map origin resolution for the extension content script (ADR-019 C4).

Resolves `CSS rule → stylesheet → source map → origin` using an injected
`fetch` (page network / CORS / CSP). No `node:fs`, no background arbitrary-host
fetch, no new mandatory host permissions.

## Caps (ADR-019 C4)

Per selection compile:

| Cap | Value |
| --- | --- |
| Max maps | 20 |
| Max bytes per map | 1 MiB |
| Max total map bytes | 2 MiB |
| Per-fetch timeout | 500 ms |
| Wall clock | 2 s |

On exceed, remaining maps are skipped and `originsTruncated: true` is returned.
Missing maps yield empty origins for that rule (never throw).

## Public API

| Export | Purpose |
| --- | --- |
| `resolveCssOrigins` | CSS pipeline entry point |
| `MAP_CAPS` / `DEFAULT_MAP_CAPS` | C4 cap constants |
| `parseSourceMap` / `CssSourceMap` | Source-map v3 parse + selector range |
| `extractSourceMappingUrl` | Discover map URL from CSS text |
| `MapOrigin` | Origin shape (compatible with context-compiler) |

Nx tags: `platform:isomorphic`, `type:library`, `scope:map-origins`.

## Scripts

```bash
pnpm nx run map-origins:typecheck
pnpm nx run map-origins:test
pnpm nx run map-origins:build
```
