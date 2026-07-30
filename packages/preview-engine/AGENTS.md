<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# preview-engine

## Purpose

Reversible runtime preview engine with transaction lifecycle and React reconciliation fallback. Applies temporary DOM/CSS mutations. Journal = intent; preview = visual effect; verification clears preview before asserting source.

Package: `@vision-control/preview-engine` · Nx project typically `preview-engine`.

## Key Files

| File | Description |
|------|-------------|
| `src/preview-manager.ts` | Orchestrator + clearAll |
| `src/preview-transaction.ts` | Transaction lifecycle |
| `src/stylesheet-manager.ts` | Dynamic style tag manager |
| `src/dom-adapter.ts` | DOM boundary |
| `src/reconciliation-observer.ts` | React recon fallback |
| `src/simulated-preview.ts` | Simulated preview helpers |
| `src/pseudo-preview.ts` | Pseudo-element preview |
| `src/diagnostics.ts` | Preview diagnostics |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/adapters/` | Per-kind preview adapters (see `src/adapters/AGENTS.md`) |
| `src/__fixtures__/` | Fixtures |

## For AI Agents

### Working In This Directory

- Preview is NOT source truth (PRD §13, Appendix D.1).
- clearAll must fully reverse transactions — verification depends on it.
- Adapters map operation kinds to reversible DOM/CSS ops.

### Testing Requirements

```bash
pnpm nx run preview-engine:typecheck
pnpm nx run preview-engine:test
pnpm nx run preview-engine:build
```

transaction, adapters, operation-dispatch.*, stylesheet tests.

### Common Patterns

- Transaction stack.
- Adapter interface per mutation class.

### Anti-Patterns

- Do not persist preview as journal source-of-truth.
- Do not skip clear before verification.

## Dependencies

### Internal

- change-ir
- element-identity

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
