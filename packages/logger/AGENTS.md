<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# logger

## Purpose

Structured logging with correlation IDs and a redacting logger wrapper so secrets do not hit console/telemetry streams.

Package: `@vision-control/logger` · Nx project typically `logger`.

## Key Files

| File | Description |
|------|-------------|
| `src/logger.ts` | Core logger |
| `src/redacting-logger.ts` | Redacting wrapper |
| `src/index.ts` | Barrel |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Prefer RedactingLogger at trust boundaries.
- Never log pair tokens or Authorization headers.

### Testing Requirements

```bash
pnpm nx run logger:typecheck
pnpm nx run logger:test
pnpm nx run logger:build
```

index tests.

### Common Patterns

- Wrapper composes security redaction patterns.

### Anti-Patterns

- Do not console.log raw context exports.

## Dependencies

### Internal

- @vision-control/security

### External

- None beyond workspace catalog norms.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
