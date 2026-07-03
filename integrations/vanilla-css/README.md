# @vision-control/vanilla-css

Vanilla CSS/SCSS source-adapter for `@vision-control/source-resolver`
(PRD §15.3 / Task 45).

## What it does

Maps an element's runtime CSS classes to the plain-CSS rules that style them.
For each matched rule the adapter surfaces the PRD §15.3 metadata:

- matched selector
- stylesheet URL (workspace-relative)
- cascade layer (`@layer`)
- specificity (`(a,b,c)`)
- media query (`@media`)
- source range (via direct AST parse of the author stylesheet, or via a CSS
  source map for PostCSS/Sass-processed output)
- CSS custom-property origin (`--var` declarations)

## Confidence policy (never-wrong-HIGH)

- Author stylesheet text parsed to a concrete selector range → **HIGH**
  (`ast-origin` evidence; AST analysis pins the source location).
- CSS source map resolves a concrete range for processed output → **HIGH**
  (`source-map` + range evidence).
- Stylesheet URL known but content/range unavailable → **MEDIUM** or lower
  (no qualifying evidence).

The resolver's `enforceNeverWrongHigh` runs on every candidate regardless.

## Public API

- `VANILLA_CSS_ADAPTER` — data-less singleton (heuristic/empty path).
- `createVanillaCssAdapter(data)` — factory wired to parsed stylesheets and
  optional source maps.
- `parseStyleSheet(text, url)` — lightweight CSS rule parser.
- `computeSpecificity(selector)` — `(a,b,c)` specificity string.
- `parseSourceMap(input)` / `VanillaCssSourceMap` — CSS source-map v3 range
  resolver for processed output.

> Nx tags: platform:node, type:integration, scope:vanilla-css.

## Scripts

Run from the repository root:

```bash
pnpm nx run vanilla-css:typecheck
pnpm nx run vanilla-css:test
pnpm nx run vanilla-css:build
```
