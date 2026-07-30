<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# daemon-client

## Purpose

**Delete-disposition residual** package (ADR-019 C7). Not on the extension-SoT /
MCP-bridge product path. May contain `dist/`/`node_modules` husks only.

## Key Files

| File | Description |
|------|-------------|
| `dist/*` | Residual build output only |

## Subdirectories

_None maintained as source._

## For AI Agents

### Working In This Directory

- Do not reintroduce daemon/storage/workspace-index/source-registry product paths.
- Do not add imports from Keep packages into this husk.

### Testing Requirements

- None.

## Dependencies

### Internal

- Historical only — see `docs/c7-package-inventory.md`.

### External

- N/A

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
