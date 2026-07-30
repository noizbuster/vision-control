<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# bridge

## Purpose

Loopback discover + WebSocket bridge server, pair tokens, projection cache, session lifecycle, command queue. Projection of extension SoT — not a second authority.

## Key Files

| File | Description |
|------|-------------|
| `bridge-server.ts` | WS bridge server |
| `discover.ts` | GET /discover secret-free |
| `pair-token.ts` | Pair token issuance (stderr/panel) |
| `bridge-session.ts` | Session lifecycle |
| `projection-cache.ts` | Projection cache + limits |
| `projection-deps.ts` | Projection dependencies |
| `command-queue.ts` | Command queue |
| `loopback.ts` | Loopback bind guards |
| `constants.ts` | Port 4322 etc. |
| `index.ts` | Barrel |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Pair token never on stdout or /discover (ADR-020 C3).
- Loopback only, fixed port.
- Projection generation/lifecycle tests are load-bearing.

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
