<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# layout-engine

## Purpose

Isomorphic, DOM-free leaf library (`@vision-control/layout-engine`). Classifies
drag, resize, align, and grid gestures into semantic source-intent kinds.
Depends only on `element-identity`, `geometry`, `zod`; consumers include
`editor-core`, `interaction-machine`, `inspector-core`, and the extension.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | Append-only public barrel |
| `src/layout-role.ts` | Position-aware LayoutRole classification (D42 precedence) |
| `src/content-model.ts` | Parent/child validity checks |
| `src/insertion-index.ts` | Flex insertion-index math |
| `src/semantic-operations.ts` | Single-element drag classification (D41 guard) |
| `src/resize-candidates.ts` | Semantic resize intents |
| `src/group-move-candidates.ts` | Multi-select group move (D41 guard) |
| `src/dom-free.test.ts` | DOM-free invariant guard |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/alignment/` | Alignment intents and commands (see `src/alignment/AGENTS.md`) |
| `src/auto-layout/` | Hug/Fill/Fixed + Tailwind suggestions (see `src/auto-layout/AGENTS.md`) |
| `src/flex/` | Flex eligibility, sizing, logical axis (see `src/flex/AGENTS.md`) |
| `src/grid/` | Grid intent, cell inference, reorder, span (see `src/grid/AGENTS.md`) |
| `src/snap/` | Snap engine candidates (see `src/snap/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Position is checked before display in `classifyLayoutRole` — order is load-bearing (D41).
- Hug/Fill/Fixed uses dispatch tables; call sites use `tryResolveHugFillFixed` (never throws).
- A sizing intent is never one CSS property. Inline/unknown parents return diagnostics.
- Inputs are pure `LayoutComputedStyle` views; this package reads nothing live.
- Grid `userChoice: "unset"` defaults to `grid-area`; DOM-order requires
  `accessibilitySemanticMatch: true` (ADR-017).
- Root barrel re-exports are append-only (`export * from "./<sub>/index.js"`).

### Testing Requirements

```bash
pnpm nx run layout-engine:typecheck
pnpm nx run layout-engine:test
pnpm nx run layout-engine:build
```

`src/dom-free.test.ts` is the invariant guard. If it fails, fix the source, not the test.

### Common Patterns

- Each V1 subdirectory owns its own barrel.
- Diagnostics instead of invalid CSS.
- Structural alignment with change-ir kinds — no import cycle back into change-ir.

### Anti-Patterns

- Call `getComputedStyle` or touch any DOM / `window` / browser global.
- Import `change-ir`, `editor-core`, or any `platform:browser` / `platform:node` package.
- Collapse a normal-flow drag into `position: absolute` or a pixel transform (PRD constraint 2).
- Emit a diagnostic whose message matches `/position:\s*absolute/i`.
- Produce invalid CSS for an inline or unknown context.
- Silently rewrite DOM order for a grid element — always `resolveGridIntent`.
- Break the append-only barrel with named re-exports from subdirectory internals.

## Dependencies

### Internal

- `@vision-control/element-identity`, `@vision-control/geometry`.

### External

- `zod`.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
