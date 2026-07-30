<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# context-compiler

## Purpose

Compiles a redacted, token-budgeted agent context from selection, changes, and source/origin data. Feeds panel export and MCP `get_source_context` style tools.

Package: `@vision-control/context-compiler` · Nx project typically `context-compiler`.

## Key Files

| File | Description |
|------|-------------|
| `src/compiler.ts` | compileContext entry |
| `src/snapshot-compiler.ts` | Snapshot compiler |
| `src/token-budget.ts` | Token budget enforcement |
| `src/redaction.ts` | Context redaction |
| `src/redaction-selectors.ts` | Selector redaction helpers |
| `src/operation-summary.ts` | Human/agent operation summaries |
| `src/target-projection.ts` | Selection → target projection |
| `src/verification-plan-projector.ts` | Verification plan projection |
| `src/changeset-privacy.ts` | Changeset privacy filtering |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/renderers/` | JSON/Markdown snapshot renderers (see `src/renderers/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Always redact before export; query strings and secrets are sensitive (ADR-009).
- Token budget must truncate deterministically.
- Do not include pair tokens or raw credentials in context.

### Testing Requirements

```bash
pnpm nx run context-compiler:typecheck
pnpm nx run context-compiler:test
pnpm nx run context-compiler:build
```

Compiler, redaction, token-budget, snapshot, operation-summary tests.

### Common Patterns

- Schema modules colocated (`*-schema.ts`).
- Renderer split by format.

### Anti-Patterns

- Do not skip redaction for “debug” exports in product paths.
- Do not pull Node fs for source reads here.

## Dependencies

### Internal

- @vision-control/change-ir
- @vision-control/security
- @vision-control/verification-engine

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
