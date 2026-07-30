<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# journal

## Purpose

Background journal authority: session store keys, handlers, readiness, offline SoT edit loop tests, bridge snapshot push to MCP projection.

## Key Files

| File | Description |
|------|-------------|
| `session-journal-store.ts` | chrome.storage.session journal store |
| `background-journal-handlers.ts` | Message handlers for journal commands |
| `background-journal-runtime.ts` | Runtime wiring |
| `bridge-snapshot-push.ts` | Push journal snapshots to bridge projection |
| `journal-messages.ts` | Journal message types |
| `session-journal-keys.ts` | Storage key helpers |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Background is the writer; panel issues commands.
- Bridge snapshot push is projection only — not authority transfer.
- Offline edit loop must work without MCP (ADR-019).

### Testing Requirements

offline-sot-edit-loop, bridge-snapshot-push, readiness, authority tests.

### Common Patterns

- Match neighboring file style.

## Dependencies

### Internal

- See parent package.

### External

- See parent package.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
