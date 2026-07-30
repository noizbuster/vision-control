<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# share-bundles

## Purpose

Local share bundle export/import and audit log (ADR-015). No remote collab transport (ADR-018).

## Key Files

| File | Description |
|------|-------------|
| `export-bundle.ts` | Export |
| `import-bundle.ts` | Import |
| `bundle-schema.ts` | Schema |
| `audit-log.ts` | Audit log |
| `index.ts` | Barrel |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Local trust only.
- Redact on export.
- No relay/cloud sync.

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
