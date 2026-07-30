<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# testing

## Purpose

Shared test harness: Vitest preset, Playwright extension loader, evidence writer, fake clock/UUID, fixture builders, docs-freshness and release-readiness guards. Test-context only.

Package: `@vision-control/testing` · Nx project typically `testing`.

## Key Files

| File | Description |
|------|-------------|
| `src/vitest-preset.ts` | Shared Vitest preset |
| `src/evidence.ts` | writeEvidence/appendEvidence |
| `src/fake-clock.ts` | Deterministic clock |
| `src/fake-uuid.ts` | Deterministic UUIDs |
| `src/daemon-process.ts` | Legacy daemon process helper (avoid new product uses) |
| `src/docs-freshness.test.ts` | Docs freshness guard |
| `src/release-readiness.test.ts` | Release readiness guard |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/playwright/` | Extension loader helpers (see `src/playwright/AGENTS.md`) |
| `src/fixtures/` | Fixture builders (see `src/fixtures/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Evidence paths under `.omo/evidence/task-<N>-*.md` with real command output.
- Do not expand daemon-process helpers into a product path.
- Importing this package pulls vitest — test files only.

### Testing Requirements

```bash
pnpm nx run testing:typecheck
pnpm nx run testing:test
pnpm nx run testing:build
```

public-api + package tests; meta-tests run in CI.

### Common Patterns

- Idempotent evidence write; append mode for accumulation.

### Anti-Patterns

- Do not use dry-run output as evidence.
- Do not import from app production entrypoints into this harness circularly.

## Dependencies

### Internal

- None beyond workspace public APIs as needed.

### External

- vitest/playwright as peer/test context

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
