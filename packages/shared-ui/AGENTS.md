<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# shared-ui

## Purpose

Browser shared UI package barrel. Currently minimal (`PACKAGE_NAME`); reserved for cross-panel presentational primitives without pulling Node deps.

Package: `@vision-control/shared-ui` · Nx project typically `shared-ui`.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | Package barrel |
| `src/index.test.ts` | Smoke test |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Keep browser-safe.
- Do not dump large panel feature code here without a clear share need.

### Testing Requirements

```bash
pnpm nx run shared-ui:typecheck
pnpm nx run shared-ui:test
pnpm nx run shared-ui:build
```

index test.

### Common Patterns

- Thin barrel until real shared components land.

### Anti-Patterns

- No platform:node imports.

## Dependencies

### Internal

- None beyond workspace public APIs as needed.

### External

- None beyond workspace catalog norms.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
