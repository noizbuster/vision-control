<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# hooks

## Purpose

React hooks for the panel: journal, selection, multi-select, connection, frame tree, grid placement, component props, persistence races, context export.

## Key Files

| File | Description |
|------|-------------|
| `useJournal.ts` | Journal read/command hook |
| `useJournalPersistence.ts` | Persistence race-safe hydration |
| `useSelection.ts` | Selection subscription (if present) / related |
| `usePanelBus.ts` | Panel bus access |
| `useConnectionState.ts` | Bridge connection state |
| `useMultiSelect.ts` | Multi-select slot data |
| `useGridPlacement.ts` | Grid placement slot data |
| `useComponentProps.ts` | Component props response hook |
| `useContextExport.ts` | Export hook |
| `useInspectedTab.ts` | Inspected tab id |
| `useGrantedHosts.ts` | Host allowlist hook |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Hooks subscribe to bus messages; they do not become a second SoT.
- Persistence races are tested — do not “simplify” away locks without tests.

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
