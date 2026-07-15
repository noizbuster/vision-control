# @vision-control/map-origins

CSS + JS source-map origin resolution for the extension content script
(ADR-019 C4).

Resolves:

- `CSS rule → stylesheet → source map → origin` (selector range when possible)
- `script → source map → module candidates` (normalized `webpack://` paths)

Uses an injected `fetch` (page network / CORS / CSP). No `node:fs`, no
background arbitrary-host fetch, no `chrome.debugger`, no new mandatory host
permissions.

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
Missing maps yield empty origins for that rule/script (never throw).

## Public API

| Export | Purpose |
| --- | --- |
| `resolveCssOrigins` | CSS pipeline entry point |
| `resolveJsOrigins` | JS map systematic collection (module candidates) |
| `mergeOriginResults` | Merge CSS+JS results for snapshot compile |
| `scriptsFromElements` | Enumerate page scripts into `ScriptInput` |
| `assignMapOriginConfidence` | Never-wrong-HIGH policy matrix |
| `enforceMapOriginNeverWrongHigh` | Downgrade lying HIGH origins |
| `normalizeMapSourcePath` | Strip `webpack://` and similar virtual schemes |
| `MAP_CAPS` / `DEFAULT_MAP_CAPS` | C4 cap constants |
| `parseSourceMap` / `CssSourceMap` | Source-map v3 parse + selector range |
| `extractSourceMappingUrl` | Discover map URL from CSS/JS text |
| `MapOrigin` | Origin shape (compatible with context-compiler) |

## Confidence policy (never-wrong-HIGH)

| Evidence | Confidence |
| --- | --- |
| map + concrete range | `high` |
| module path only (JS) | `medium` + `module-path-only` |
| map without range | `medium` + `map-present-without-range` |
| map / origin absent | no origin (`none`) |

Forbidden: text-search HIGH, marker HIGH product path, DOM→JSX HIGH without
map+range. Policy lives in `assignMapOriginConfidence` /
`enforceMapOriginNeverWrongHigh`.

Nx tags: `platform:isomorphic`, `type:library`, `scope:map-origins`.

## Scripts

```bash
pnpm nx run map-origins:typecheck
pnpm nx run map-origins:test
pnpm nx run map-origins:build
```

