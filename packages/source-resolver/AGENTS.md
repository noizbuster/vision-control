# AGENTS.md (source-resolver)

Package-level brief. Read root [AGENTS.md](../../AGENTS.md) first; this file covers only what is specific to `@vision-control/source-resolver`.

## OVERVIEW

`platform:node` library that resolves a `SelectionIdentity` to a ranked
`SourceCandidate[]`. It reads `node:fs` / `node:path` (see `snippet-extractor.ts`),
so no browser package may import it.

## STRUCTURE

Five areas under `src/`:

1. **Core (flat)** - `resolver.ts` (6-step cascade), `confidence.ts`
   (`satisfiesHighEvidence`), `source-candidate.ts` (`enforceNeverWrongHigh`),
   `adapter-contract.ts`, `adapter-registry.ts`, `snippet-extractor.ts`,
   `stale-detection.ts`, `confidence-ui-data.ts`, `v1-stubs.ts`.
2. **tokens/** - design-token registry, provenance, conflict detection, runtime
   CSS variables. Owns `cross-source-integration.test.ts` (D15 drift detector).
3. **suggested-diff/** - inert payloads. `kinds.ts` (8 closed kinds),
   `preconditions.ts`, `generator.ts`, `diff-format.ts`.
4. **component-props/** - static prop discovery, candidate values, AST
   source-range mapping, ownership-risk, prop-flow warnings.
5. **css-in-js/** - static extraction, pseudo-element handling, adapter.

## WHERE TO LOOK

| Need | Look at |
|---|---|
| Resolution cascade (fixed priority) | [resolver.ts](./src/resolver.ts) |
| Never-wrong-HIGH predicate | [confidence.ts](./src/confidence.ts) |
| HIGH enforcement transform | [source-candidate.ts](./src/source-candidate.ts) |
| Evidence taxonomy (7 methods, closed) | [confidence.ts](./src/confidence.ts) |
| Suggestion kinds (8, closed) | [suggested-diff/kinds.ts](./src/suggested-diff/kinds.ts) |
| Inert-data contract for diffs | [ADR-012](../../docs/adr/ADR-012-deterministic-patch-suggestions.md) |
| No source-mutating tool / no apply | [ADR-010](../../docs/adr/ADR-010-readonly-mcp.md) |

## CONVENTIONS

- **Never-wrong-HIGH is the spine.** `satisfiesHighEvidence` gates HIGH on
  `marker`, `ast-origin`, `fingerprint`+`manifest`, or `source-map`+range only.
  `text-search` and `llm-inference` never contribute. `enforceNeverWrongHigh`
  runs on every candidate in `resolveCandidates`, even when an adapter lies.
- **The 6-step cascade is fixed priority:** marker, stale-registry downgrade,
  repeated-instance ambiguity, static CSS class, registered adapters, low fallback. Do not reorder the branches in `resolver.ts`.
- **Evidence taxonomy is closed.** Seven methods only. Adding one means updating
  `confidence.ts` and `suggested-diff/generator.ts` in lockstep.
- **D15 local mirror.** Integration packages (tailwind, css-modules, etc.) must
  not import this package; they define LOCAL structural type mirrors.
  `tokens/cross-source-integration.test.ts` is the drift detector.
- **Workspace-relative path invariant.** Every path field on a candidate is
  workspace-relative. `snippet-extractor` takes an absolute path internally;
  its output is numbered lines only, never the path.
- **VC-V1V2-04 extension fields stay optional.** `staticClassName`,
  `cssFilePath`, `componentName` and friends on `SourceCandidateSchema` are
  optional, never required.

## ANTI-PATTERNS

- Do not weaken `satisfiesHighEvidence`, or add any path that sets HIGH without
  running `enforceNeverWrongHigh`.
- Do not reorder the resolution cascade.
- Do not import `@vision-control/source-resolver` from an integration package;
  use the D15 local mirror.
- Do not add an `applied` flag, an apply tool, or any field implying the diff
  was executed. Inert data only (ADR-010 / ADR-012).
- Do not let a dynamic or computed case produce a suggestion; return
  `{ kind: "agent-required" }` instead of guessing.
- Do not add a new evidence method or suggestion kind without updating both
  `confidence.ts` and `generator.ts`.
- Do not make the VC-V1V2-04 extension fields required on `SourceCandidateSchema`.

## Verification

```bash
pnpm nx run source-resolver:typecheck
pnpm nx run source-resolver:test
pnpm nx run source-resolver:build
```
