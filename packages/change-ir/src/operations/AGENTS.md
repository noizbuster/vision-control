<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# operations

## Purpose

One module per change operation kind: style, class, text, reorder, reparent, resize, flex-resize, grid, structural inserts/removes/wraps, multi-select, screenshot, suggested-diff (inert), etc.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Operations barrel |
| `style.ts` | Style edit |
| `reorder.ts` | Reorder |
| `reparent.ts` | Reparent |
| `resize.ts` | Resize |
| `flex-resize.ts` | Flex pair resize |
| `grid.ts` | Grid ops |
| `suggested-diff.ts` | Inert suggested diff |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Adding a kind requires inverse + merge + verification-plan + preview adapter + often context summary.
- suggested-diff stays inert (ADR-012).
- Keep characterization tests green when changing semantics.

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
