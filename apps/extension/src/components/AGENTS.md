<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# components

## Purpose

React UI for the DevTools panel: connection/pairing, host allowlist, inspector, editors, journal, error boundary.

## Key Files

| File | Description |
|------|-------------|
| `ConnectionStatus.tsx` | Bridge/connection status |
| `PairingPanel.tsx` | MCP pair token paste UI |
| `HostAllowlistPanel.tsx` | Granted host management |
| `ErrorBoundary.tsx` | Panel error boundary |
| `PanelDiagnostics.tsx` | Diagnostics surface |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `editors/` | Style/class/text/props editors (see editors/AGENTS.md) |
| `inspector/` | Inspector panel + V1V2 slots (see inspector/AGENTS.md) |
| `interaction/` | Pure-TS content controllers (see interaction/AGENTS.md) |
| `journal/` | Journal UI + context export (see journal/AGENTS.md) |

## For AI Agents

### Working In This Directory

- Pairing UI must never echo tokens into logs or exports.
- interaction/ controllers are not React components — used from content runtime.

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
