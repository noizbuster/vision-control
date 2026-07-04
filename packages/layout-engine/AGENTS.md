# AGENTS.md

Package brief for AI coding agents in `@vision-control/layout-engine`. Read the
[root brief](../../AGENTS.md) first; this file covers the package contract only.

## OVERVIEW

Isomorphic, DOM-free leaf library. Classifies drag, resize, align, and grid
gestures into semantic source-intent kinds. Depends only on `element-identity`,
`geometry`, `zod`; consumers are `editor-core` and `change-ir`.

## STRUCTURE (MVP vs V1)

**MVP (v0.1.0):**
- `layout-role.ts`: position-aware LayoutRole classification
- `content-model.ts`: parent/child validity checks
- `insertion-index.ts`: flex insertion-index math
- `semantic-operations.ts`: single-element drag classification (D41 guard)
- `resize-candidates.ts`: semantic resize intents

**V1 (v0.2.0, Tasks 6 to 9):**
- `group-move-candidates.ts`: Task 6, multi-select group move (D41 guard)
- `alignment/`: Task 7, alignment intents and commands (D41 guard)
- `auto-layout/`: Task 8, Hug/Fill/Fixed plus Tailwind suggestions
- `grid/`: Task 9, grid intent, cell inference, reorder, span

Each V1 subdirectory owns its own barrel. The root `index.ts` re-exports are
append-only (`export * from "./<sub>/index.js"`). Never reach across.

## WHERE TO LOOK

| Need | File |
|---|---|
| LayoutRole enum (11 values) | `src/layout-role.ts` |
| Position precedence (D42) | `src/layout-role.ts`, `classifyLayoutRole` |
| Normal-flow constraint (D41) | `src/semantic-operations.ts`, `src/group-move-candidates.ts`, `src/alignment/alignment-candidates.ts` |
| Hug/Fill/Fixed resolvers | `src/auto-layout/hug-fill-fixed.ts` |
| Grid accessibility guard | `src/grid/grid-intent.ts`, `resolveGridIntent` |
| DOM-free invariant guard | `src/dom-free.test.ts` |
| Public API surface | `src/index.ts` |

## CONVENTIONS

- Position is checked before display in `classifyLayoutRole`. The order is
  load-bearing because D41 keys off positioned contexts.
- Hug/Fill/Fixed uses dispatch tables (`HUG_TABLE`/`FILL_TABLE`/`FIXED_TABLE`):
  4 parent contexts times 3 intents. Call sites use `tryResolveHugFillFixed`,
  which never throws.
- A sizing intent is never one CSS property. Inline/unknown parent contexts
  return a diagnostic, never invalid CSS. Inputs are pure
  `LayoutComputedStyle` views; this package reads nothing live.
- Grid `userChoice: "unset"` defaults to `grid-area`; DOM-order requires
  `accessibilitySemanticMatch: true` ([ADR-017](../../docs/adr/ADR-017-accessibility-repair-scope.md)).

## ANTI-PATTERNS

- Call `getComputedStyle` or touch any DOM, `window`, or browser global.
- Import `change-ir`, `editor-core`, or any `platform:browser` / `platform:node`
  package. Structural alignment only; no data flow back.
- Collapse a normal-flow drag into `position: absolute` or a pixel transform.
  This is [PRD constraint 2](../../Vision-Control-PRD.md), enforced in all three
  drag classifiers.
- Emit a diagnostic whose message matches `/position:\s*absolute/i`. That leaks
  the forbidden intent through the diagnostic channel.
- Produce invalid CSS for an inline or unknown context. Return a diagnostic.
- Silently rewrite DOM order for a grid element. Always go through
  `resolveGridIntent`.
- Break the append-only barrel by adding named re-exports from a
  subdirectory's internal modules.

## Verification

```bash
pnpm nx run layout-engine:typecheck
pnpm nx run layout-engine:test
pnpm nx run layout-engine:build
```

`src/dom-free.test.ts` is the invariant guard. If it fails, fix the source, not
the test. Decisions: [docs/adr/](../../docs/adr/); D41/D42 in [Vision-Control-PRD.md](../../Vision-Control-PRD.md).
