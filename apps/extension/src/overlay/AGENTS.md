<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# overlay

## Purpose

Content-runtime overlay controllers and edit wiring: multi-select, grid placement, breakpoints, group-move, auto-layout overlay, interaction selection capture, operation recorder.

## Key Files

| File | Description |
|------|-------------|
| `content-edit-wiring.ts` | Wires content edit pipeline |
| `multi-select-controller.ts` | Emits multi-select-group messages |
| `grid-placement-controller.ts` | Emits grid-placement messages |
| `breakpoint-controller.ts` | activeBreakpoint enrichment |
| `group-move-router.ts` | Group move routing |
| `grid-drag-controller.ts` | Grid drag |
| `auto-layout-overlay.ts` | Auto-layout overlay chrome |
| `interaction-operation-recorder.ts` | Records ops from gestures |
| `interaction-selection-capture.ts` | Selection capture |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Emission side of additive slots lives here.
- Controllers publish bus messages; panel hooks subscribe.
- Keep overlay work off the React panel tree.

### Testing Requirements

Covered by parent package Nx targets.

### Common Patterns

- Match neighboring file style.

## Dependencies

### Internal

- See parent package.

### External

- See parent package.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
