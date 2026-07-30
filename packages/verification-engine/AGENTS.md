<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# verification-engine

## Purpose

Isomorphic HMR assertion engine (`@vision-control/verification-engine`): the
FINAL read-only gate in the edit loop. Proves a source patch landed in the live
DOM after HMR with the preview layer cleared. Owns NO write path. It asserts.
It never mutates.

## Key Files

| File | Description |
|------|-------------|
| `src/verification-runner.ts` | Six-step loop after a patch (2 short-circuits) |
| `src/verification-plan.ts` | Operation → assertions; exhaustive `never` switch |
| `src/hmr-detector.ts` | MutationObserver stability wait |
| `src/target-resolver.ts` | Reacquire element post-HMR |
| `src/durable-target-resolver.ts` | Durable target resolution helpers |
| `src/dom-adapter.ts` | **Only** module touching `document`/`window`/`console` |
| `src/types.ts` | `PreviewClearer`, `ResolvedTarget`, `VerificationReport` |
| `src/alignment-accessibility.ts` | Reading-order desync checks |
| `src/index.ts` | Public barrel |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/assertions/` | One file per assertion kind (see `src/assertions/AGENTS.md`) |
| `src/accessibility-repair/` | Advisory a11y detectors ADR-017 (see `src/accessibility-repair/AGENTS.md`) |
| `src/__fixtures__/` | Test fixtures |

## For AI Agents

### Working In This Directory

- **Final gate, never writes.** Clear, reacquire, assert. A pass means the source
  patch survived HMR into the live DOM.
- **HMR loop (PRD Appendix D.1).** (1) `waitForHmrComplete` (100ms stability,
  5000ms timeout), (2) preview clear, (3) `resolveTarget` cascade, (4) implicit
  `assertExists`, (5) plan assertions, (6) console policy. Hard-fail short-circuits:
  preview not cleared (step 2), target not found (step 3). Step 2 is the anti-cheat guardrail.
- **DOM only via `dom-adapter.ts`.**
- **Structural typing for cross-package deps.** `PreviewClearer` and
  `RetentionSweepRepository` are local interfaces — no package edge to
  preview-engine/storage.
- **Exhaustive switch** in `verification-plan.ts` with `default: { const _: never = operation; }`.
- **Advisory a11y (ADR-017).** Levels `"info" | "warn"` only. No auto-mutation.
- **Opt-in screenshots (ADR-011).** Pre-capture masks; post-capture recheck;
  24h retention; V1 diff is byte-ratio only.

### Testing Requirements

```bash
pnpm nx run verification-engine:typecheck
pnpm nx run verification-engine:test
pnpm nx run verification-engine:build
```

### Common Patterns

- Assertion builders map change-ir kinds → assertion lists.
- Screenshot pipeline modules: `screenshot-crop|diff|redaction|retention.ts`.

### Anti-Patterns

- No `"error"` in `AccessibilityRepairLevel` (ADR-017).
- No bypassing the preview-clear check; no treating cleared preview as source verification.
- No screenshot capture without opt-in, pre-capture redaction, and post-capture recheck.
- No `@vision-control/preview-engine` or `@vision-control/storage` dependency.
- No DOM access outside `dom-adapter.ts`.
- No perceptual-diff or image-hash dependency.
- Do not silence the `never` exhaustiveness guard.
- `suggested-diff` is inert data (ADR-012); plan returns no assertions for it.

## Dependencies

### Internal

- `@vision-control/change-ir`, `@vision-control/element-identity`,
  `@vision-control/geometry` (public APIs).

### External

- `zod`.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
