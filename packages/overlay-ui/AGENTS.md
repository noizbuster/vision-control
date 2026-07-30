<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# overlay-ui

## Purpose

Browser overlay primitives for the content-script shadow DOM: selection chrome, resize/rotation handles, snap guides, marquee, multi-select, drag ghost, drop indicators, hit-testing, keyboard helpers, iframe coordinate bridge.

Package: `@vision-control/overlay-ui` · Nx project typically `overlay-ui`.

## Key Files

| File | Description |
|------|-------------|
| `src/overlay-root.ts` | Overlay root |
| `src/overlay-element.ts` | Overlay element helpers |
| `src/hit-testing.ts` | Hit testing |
| `src/resize-handles.ts` | Resize handles |
| `src/snap-guides.ts` | Snap guides |
| `src/multi-select-overlay.ts` | Multi-select chrome |
| `src/marquee-overlay.ts` | Marquee |
| `src/iframe-coordinate-bridge.ts` | Iframe coordinates |
| `src/pointer-events-policy.ts` | Pointer-events policy |
| `src/styles.ts` | Overlay styles |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Overlay must not steal page pointer events incorrectly — honor pointer-events policy.
- Keep visuals themeable; visual-regression-lab baselines exist.
- No journal writes here; pure presentation + hit geometry.

### Testing Requirements

```bash
pnpm nx run overlay-ui:typecheck
pnpm nx run overlay-ui:test
pnpm nx run overlay-ui:build
```

Per-component *.test.ts alongside modules.

### Common Patterns

- Factory functions returning controllers/elements.
- Observers for position tracking.

### Anti-Patterns

- Do not apply source patches.
- Do not bypass hit-testing for cross-origin iframes.

## Dependencies

### Internal

- change-ir
- editor-core
- element-identity
- geometry
- layout-engine

### External

- None beyond workspace catalog norms.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
