<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# security

## Purpose

Redaction, origin allowlist, pairing tokens, audit events, secret detection, sensitive field keys, and local share-bundle import/export trust (ADR-015).

Package: `@vision-control/security` · Nx project typically `security`.

## Key Files

| File | Description |
|------|-------------|
| `src/redaction.ts` | Redaction core |
| `src/redaction-patterns.ts` | Patterns |
| `src/sensitive-fields.ts` | Sensitive key detection |
| `src/secret-detection.ts` | Secret detectors |
| `src/origin-allowlist.ts` | Origin allowlist |
| `src/pairing-token.ts` | Pairing token helpers |
| `src/audit-event.ts` | Audit events |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/share-bundles/` | Share bundle export/import (see `src/share-bundles/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Default to redacting; explicit allowlist for origins.
- Share bundles are local trust — no remote collab transport (ADR-018).
- Pairing tokens: sufficient entropy; never log.

### Testing Requirements

```bash
pnpm nx run security:typecheck
pnpm nx run security:test
pnpm nx run security:build
```

index, redaction-query, share-bundles tests.

### Common Patterns

- Pure functions over strings/objects.
- Zod bundle schema.

### Anti-Patterns

- No cloud sync.
- No weakening redaction for convenience in product exports.

## Dependencies

### Internal

- None beyond workspace public APIs as needed.

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
