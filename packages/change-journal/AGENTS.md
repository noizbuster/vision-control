<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# change-journal

## Purpose

Isomorphic undo/redo journal over change-ir: stacks, persistence adapters, session sync, entry model, migrations. Extension background is the durable authority; this library is the pure journal engine.

Package: `@vision-control/change-journal` · Nx project typically `change-journal`.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | Public barrel |
| `src/journal.ts` | Journal core |
| `src/entry.ts` | Journal entry types |
| `src/stacks.ts` | Undo/redo stacks |
| `src/persistence.ts` | Persistence port |
| `src/session-sync.ts` | Session synchronization helpers |
| `src/migration.ts` | Journal migrations (v1→v2) |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Journal records INTENT; preview renders effect; verification clears preview before assert.
- Persistence is injected — chrome.storage.session wiring lives in the extension.
- Keep serialization stable for session rehydrate.

### Testing Requirements

```bash
pnpm nx run change-journal:typecheck
pnpm nx run change-journal:test
pnpm nx run change-journal:build
```

History, serialization, session-sync, status, flex-resize journal tests.

### Common Patterns

- Pure engine + adapter ports.
- Migrations explicit and tested.

### Anti-Patterns

- Do not make the journal apply DOM mutations.
- Do not treat journal replay as source patch apply.

## Dependencies

### Internal

- @vision-control/change-ir

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
