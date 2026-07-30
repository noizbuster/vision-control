<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# tools

## Purpose

Developer tooling for the monorepo. Currently hosts the local Nx plugin that
scaffolds packages and enforces platform/import boundaries.

## Key Files

| File | Description |
|------|-------------|
| _(none at this level)_ | See `nx-plugin/` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `nx-plugin/` | Generators + `pnpm boundaries` checker (see `nx-plugin/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Boundary violations fail CI via `pnpm boundaries` → `nx run tools-nx-plugin:boundaries`.
- Prefer generators over hand-rolled package metadata.

### Testing Requirements

```bash
pnpm nx run tools-nx-plugin:test
pnpm boundaries
```

### Common Patterns

- Devkit-independent pure generators: `(options) -> GeneratedFile[]`.

## Dependencies

### Internal

- Reads workspace package sources for boundary analysis.

### External

- TypeScript, Vitest; intentionally no `@nx/devkit` hard dependency.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
