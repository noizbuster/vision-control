<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# interaction

## Purpose

Pure-TS controllers run in CONTENT context. Bind pointer events to interaction-machine + preview-engine + change-ir. Not React components (except small status views).

## Key Files

| File | Description |
|------|-------------|
| `ReorderController.ts` | Reorder gesture controller |
| `ReparentController.ts` | Reparent gesture controller |
| `ResizeController.ts` | Resize gesture controller |
| `index.ts` | Re-exports only Reparent* publicly — import others by path intentionally |
| `flex-pair-resize-*.ts` | Flex pair resize strategy/model/preview |
| `reorder-pointer-gesture.ts` | Reorder pointer gesture |
| `single-resize-gesture.ts` | Single resize gesture |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Controllers own pointer/DOM lifecycle outside React.
- index.ts re-exports only Reparent*; ReorderController/ResizeController imported by deep path by design.
- No normal-flow → absolute positioning collapse.

### Testing Requirements

Unit tests colocated; browser e2e under e2e/*.spec.ts

### Common Patterns

- Match neighboring file style.

## Dependencies

### Internal

- See parent package.

### External

- See parent package.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
