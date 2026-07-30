<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# journal

## Purpose

Panel journal UI, before/after summary, agent prompt builder, and context export/download helpers.

## Key Files

| File | Description |
|------|-------------|
| `ChangeJournal.tsx` | Journal list UI |
| `JournalEntry.tsx` | Single entry row |
| `JournalToolbar.tsx` | Undo/redo/export toolbar |
| `BeforeAfterSummary.tsx` | Before/after display |
| `agent-prompt.ts` | Agent prompt compilation |
| `context-export.ts` | Context export pipeline |
| `download-text.ts` | Download helper |
| `index.ts` | Barrel |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Exports must run through redaction (security/context-compiler).
- Journal UI commands go through background authority — panel is not the writer.

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
