<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# change-ir

## Purpose

Isomorphic change intermediate representation: operation kinds, changesets, inverse computation, merge, conflict signatures, serialization. The contract language between panel, journal, preview, verification, and MCP context.

Package: `@vision-control/change-ir` · Nx project typically `change-ir`.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | Public barrel |
| `src/changeset.ts` | Changeset model |
| `src/changeset-schema.ts` | Zod schemas + migrations seam |
| `src/merge.ts` | Changeset merge + identity alias handling |
| `src/operation-base.ts` | Shared operation base types |
| `src/operation-inverse.ts` | Inverse dispatch |
| `src/conflict-signatures.ts` | Conflict signature helpers (incl. flex-pair CSS props) |
| `src/serialization.ts` | Serialize/parse |
| `src/SCHEMA_VERSION.md` | Schema version notes |
| `src/element-ref.ts` | ElementRef schema re-export/local |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/operations/` | Per-kind operation definitions (see `src/operations/AGENTS.md`) |
| `src/property-arbitraries/` | fast-check arbitraries for property tests |
| `src/test-support/` | Shared test helpers |

## For AI Agents

### Working In This Directory

- New operation kinds need: schema, inverse, merge behavior, verification-plan case, preview dispatch, and often context-compiler summary.
- Keep inverse correctness property-tested where present.
- Privacy helpers strip sensitive payloads before cross-boundary send.

### Testing Requirements

```bash
pnpm nx run change-ir:typecheck
pnpm nx run change-ir:test
pnpm nx run change-ir:build
```

Property tests under `*.test.ts` + operation characterization tests.

### Common Patterns

- Discriminated operation unions.
- Exhaustive switches with `never` at call sites.
- SCHEMA_VERSION documented for migrations.

### Anti-Patterns

- Do not break serialization compatibility without a migration.
- Do not encode preview-only ephemeral state as durable IR.
- Do not add source-file paths that assume Node fs.

## Dependencies

### Internal

- None beyond workspace public APIs as needed.

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
