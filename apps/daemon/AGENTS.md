<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# daemon

## Purpose

**Delete-disposition residual** (ADR-019 C7). The always-on daemon is not a
product path. Ordinary editing is extension-only; optional agents use the
single-process MCP bridge. This directory may contain leftover build artifacts
only.

## Key Files

| File | Description |
|------|-------------|
| _(artifacts)_ | Residual compiled output — not a maintained source tree |

## Subdirectories

_None maintained._

## For AI Agents

### Working In This Directory

- **Do not revive** daemon-as-SoT, workspace bind, or product `pnpm dev` wiring.
- Do not add new features here.
- Prefer deleting remnants when tasking cleanup; do not expand scope.

### Testing Requirements

- None. Not on the product path.

### Common Patterns

- N/A

## Dependencies

### Internal

- Historical only — see `docs/c7-package-inventory.md`.

### External

- N/A

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
