<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# visual-regression-lab

## Purpose

Fixture lab for overlay visual baselines and screenshot-diff helpers
(`@vision-control/visual-regression-lab`). Supports deterministic overlay scenario
rendering and byte-diff fixtures aligned with ADR-011 V1 screenshot policy.

## Key Files

| File | Description |
|------|-------------|
| `src/overlay-renderer.ts` | Renders overlay scenarios |
| `src/overlay-scenarios.ts` | Scenario definitions |
| `src/overlay-baselines.ts` | Baseline hooks |
| `src/devtools-theme.ts` | DevTools theme tokens for overlays |
| `src/screenshot-diff.fixture.ts` | Screenshot diff fixture helpers |
| `src/rendered-screenshot.ts` | Rendered screenshot utilities |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | All lab implementation (see `src/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- V1 diffs are byte-ratio oriented — do not pull perceptual hash libs casually.
- Keep scenarios stable; baseline churn should be intentional.
- Privacy: no real user content in fixtures.

### Testing Requirements

```bash
pnpm nx run visual-regression-lab:test
pnpm nx run visual-regression-lab:build
```

### Common Patterns

- Scenario list → render → compare.

## Dependencies

### Internal

- May consume overlay concepts; keep boundaries clean.

### External

- Vitest; canvas/image APIs as used by fixtures.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
