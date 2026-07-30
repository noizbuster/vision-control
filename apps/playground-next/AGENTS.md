<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# playground-next

## Purpose

Next.js fixture for dev-only source marker testing (V1 — VC-V1V2-13). Proves
production builds contain zero `data-vc-source` markers (ADR-008) while dev e2e
can exercise marker injection when enabled.

## Key Files

| File | Description |
|------|-------------|
| `next.config.mjs` | Next config (marker wrapper dev-only) |
| `src/production-no-markers.test.ts` | Production negative test (grep `.next/`) |
| `src/production-no-markers.turbopack.test.ts` | Turbopack production negative test |
| `playwright.config.ts` | Dev e2e config |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `app/` | App Router pages (see `app/AGENTS.md`) |
| `pages/` | Pages Router sample (see `pages/AGENTS.md`) |
| `src/` | Production marker negative tests (see `src/AGENTS.md`) |
| `e2e/` | Dev-mode source marker specs |

## For AI Agents

### Working In This Directory

- Production builds must ship **zero** markers. Never make markers unconditional.
- Marker HIGH is not a product path under ADR-019.
- Keep both app router and pages router samples if both are covered by tests.

### Testing Requirements

```bash
pnpm nx run playground-next:build
pnpm nx run playground-next:test
pnpm nx run playground-next:e2e
```

### Common Patterns

- Negative tests scan build output for `data-vc-source`.

## Dependencies

### Internal

- Optional marker integration remnants must not reintroduce product-path HIGH markers.

### External

- Next 15, React, Playwright, Vitest.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
