<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# nx-plugin

## Purpose

Local Nx plugin (`@vision-control/nx-plugin`): (1) package-skeleton generators
producing consistent metadata for every workspace package; (2) workspace boundary
conformance checker invoked as `pnpm boundaries`.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | Public barrel |
| `src/core/generate-package-files.ts` | Pure `(options) -> GeneratedFile[]` core |
| `src/generators/index.ts` | Generator registry |
| `src/scripts/boundaries.ts` | Boundary checker implementation |
| `src/scripts/scaffold-all.ts` | Bulk scaffold helper |
| `README.md` | Human overview |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Plugin source (see `src/AGENTS.md`) |
| `src/core/` | Shared generate core (see `src/core/AGENTS.md`) |
| `src/generators/` | Per-kind generators (see `src/generators/AGENTS.md`) |
| `src/scripts/` | boundaries + scaffold scripts (see `src/scripts/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Generators are **devkit-independent** — keep them pure and unit-testable without `@nx/devkit`.
- Boundary rules: no `platform:node` → `platform:browser`; no deep `src/` imports.
- New package kinds need generator + tests + README note.

### Testing Requirements

```bash
pnpm nx run tools-nx-plugin:test
pnpm boundaries
```

### Common Patterns

- `GeneratedFile[]` with path + content.
- Tags written into `project.json` for every scaffold.

### Anti-Patterns

- Hand-editing many packages' metadata instead of fixing the generator.
- Softening boundary checker to pass illegal imports.

## Dependencies

### Internal

- Scans workspace package sources for boundary violations.

### External

- TypeScript, Vitest; no hard `@nx/devkit` dependency.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
