# AGENTS.md

Package brief for `@vision-control/verification-engine`. Read the root
[AGENTS.md](../../AGENTS.md) first; this file adds only what is local here.

## OVERVIEW

The isomorphic HMR assertion engine: the FINAL read-only gate in the edit loop. Proves a
source patch landed in the live DOM after HMR with the preview layer cleared.
Owns NO write path. It asserts. It never mutates.

## STRUCTURE

- `verification-runner.ts`: six-step loop after a patch.
- `verification-plan.ts`: operation to assertions, exhaustive switch.
- `hmr-detector.ts`: MutationObserver stability wait.
- `target-resolver.ts`: reacquire element post-HMR.
- `dom-adapter.ts`: the ONLY module touching `document`/`window`/`console`.
- `assertions/`: one file per assertion kind.
- `accessibility-repair/`: advisory a11y detectors (ADR-017).
- `screenshot-*`: opt-in crop, redaction, diff, retention pipeline (ADR-011).
- `alignment-accessibility.ts`: reading-order desync.
- `types.ts`: `PreviewClearer`, `ResolvedTarget`, `VerificationReport`.

## WHERE TO LOOK

| Need | Look at |
|---|---|
| Loop (6 steps, 2 short-circuits) | `src/verification-runner.ts` |
| Evidence convention | [ADR-005](../../docs/adr/ADR-005-evidence-convention.md) |
| Privacy + redaction | [ADR-009](../../docs/adr/ADR-009-privacy-redaction.md) |
| Read-only contract | [ADR-010](../../docs/adr/ADR-010-readonly-mcp.md) |
| Screenshot crops | [ADR-011](../../docs/adr/ADR-011-v1-screenshot-crops.md) |
| Suggested-diff (inert) | [ADR-012](../../docs/adr/ADR-012-deterministic-patch-suggestions.md) |
| A11y advisory scope | [ADR-017](../../docs/adr/ADR-017-accessibility-repair-scope.md) |
| Loop spec | [PRD](../../Vision-Control-PRD.md) Appendix D.1 |
| Evidence rules | [docs/agents/verification.md](../../docs/agents/verification.md) |

## CONVENTIONS

- **Final gate, never writes.** Clear, reacquire, assert. No patches. A pass
  means the source patch survived HMR into the live DOM.
- **HMR loop (PRD Appendix D.1).** Six steps: (1) `waitForHmrComplete` (100ms
  stability, 5000ms timeout), (2) preview clear, (3) `resolveTarget` cascade,
  (4) implicit `assertExists`, (5) plan assertions, (6) console policy. Two
  hard-fail short-circuits: preview not cleared (step 2), target not found
  (step 3). Step 2 is the anti-cheat guardrail.
- **DOM only via `dom-adapter.ts`.** Nothing else touches `document`,
  `window`, `MutationObserver`, or `console`.
- **Structural typing for cross-package deps.** `PreviewClearer` (satisfied by
  `preview-engine`) and `RetentionSweepRepository` (satisfied by `storage`)
  are local interfaces. Callers wire the concrete packages; no edge here.
- **Exhaustive switch.** `verification-plan.ts` ends with `default: { const _:
  never = operation; }`. A new `change-ir` kind without a plan case is a
  compile error. Keep the guard.
- **Advisory a11y (ADR-017).** `AccessibilityRepairLevel = "info" | "warn"`.
  Each suggestion carries a `verificationAssertion`. No auto-mutation. A fix
  becomes real only via change IR, preview, source patch, HMR verification.
- **Opt-in screenshots (ADR-011).** Capture needs `ScreenshotOptIn { enabled:
  true }`. Pre-capture masks; post-capture `recheckCapture` discards bytes on
  leak. 24h default retention. V1 diff is byte-ratio only (`byteSimilarity`).

## ANTI-PATTERNS

- No `"error"` in `AccessibilityRepairLevel` (ADR-017).
- No bypassing the preview-clear check, no treating a cleared preview as
  source verification (ADR-005, runner step 2).
- No screenshot capture without opt-in, without pre-capture redaction, or
  without the post-capture recheck (ADR-009, ADR-011).
- No `@vision-control/preview-engine` or `@vision-control/storage` dependency.
  Wire structurally via `PreviewClearer` / `RetentionSweepRepository`.
- No DOM access outside `dom-adapter.ts`.
- No perceptual-diff or image-hash dependency. V1 is byte-ratio only.
- Do not silence the `never` exhaustiveness guard in `verification-plan.ts`.
- `suggested-diff` is inert data (ADR-012); the plan returns no assertions.

## Verification

Run from repo root: `pnpm nx run verification-engine:typecheck`, `:test`,
`:build`.
