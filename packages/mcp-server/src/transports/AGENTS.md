<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# transports

## Purpose

MCP transports: stdio for the agent JSON-RPC (stdout reserved), and HTTP helpers for loopback discover/bridge side.

## Key Files

| File | Description |
|------|-------------|
| `stdio.ts` | startStdioTransport |
| `http.ts` | HTTP/loopback helpers |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Stdout is JSON-RPC only — logs/tokens go stderr.

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
