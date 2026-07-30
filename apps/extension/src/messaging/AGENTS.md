<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# messaging

## Purpose

Cross-context messaging: bus, router, context permissions, frame discovery, tab session, edit forwarding, bridge session/background, operation relay, panel messages.

## Key Files

| File | Description |
|------|-------------|
| `bus.ts` | MessageBus |
| `router.ts` | MessageRouter (background singleton) |
| `context-permissions.ts` | Context permission boundary |
| `frame-discovery.ts` | Frame enumeration + routeable flags |
| `tab-session.ts` | Per-tab session state |
| `bridge-background.ts` | Background bridge wiring |
| `bridge-session.ts` | Bridge session state |
| `edit-forwarding.ts` | Edit command forwarding |
| `operation-relay.ts` | Operation relay |
| `panel-messages.ts` | Panel message contracts |
| `types.ts` | Shared messaging types |
| `index.ts` | Barrel |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `__tests__/` | Messaging unit tests |

## For AI Agents

### Working In This Directory

- One MessageRouter in background only.
- Panel messages without tabId drop at permission check.
- Cross-origin frames are never routeable for edits.

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
