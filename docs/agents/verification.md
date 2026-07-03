# Verification Contract

This guide defines how to verify work in the Vision Control MVP. It covers the
hybrid TDD strategy, the evidence convention, the anti-cheat rules, and the
adversarial QA expectations.

Related: [ADR-004](../adr/ADR-004-hybrid-tdd.md),
[ADR-005](../adr/ADR-005-evidence-convention.md),
[AGENTS.md](../../AGENTS.md).

---

## Verification commands

Before declaring a task complete, run every command that applies and capture the
real output into the evidence file.

```bash
pnpm check        # Biome lint + format check
pnpm typecheck    # tsc --noEmit across all packages
pnpm test         # vitest run across all packages
pnpm build        # tsc -p tsconfig.build.json across all packages
pnpm boundaries   # package boundary checker
```

If your change touches e2e:

```bash
pnpm test:e2e
```

---

## Hybrid TDD

Some packages are TDD-first. Others are test-after. Know which category you are
working in before you start.

**TDD-first** (failing test, then code):

- `packages/protocol`
- `packages/change-ir`
- `packages/element-identity`
- `packages/security`
- `integrations/vite-react`

In these packages, write a test that names the behavior in Given/When/Then form.
Run it. Confirm it fails for the right reason (the code does not exist yet, or
the behavior is wrong). Then write the minimum code to pass it.

**Test-after** (feature, then pinning tests):

- `packages/overlay-ui`
- `apps/extension`
- Other UI integration layers

In these packages, build the feature, verify it through its surface, then write
tests that lock the behavior.

See ADR-004 for the full rationale.

---

## Evidence convention

Every plan task produces an evidence file at
`.omo/evidence/task-<N>-<plan-slug>.md`, where `<plan-slug>` matches the plan
name. For the MVP plan the path is
`.omo/evidence/task-<N>-vision-control-mvp.md`. For the V1/V2 plan the path is
`.omo/evidence/task-1-vision-control-v1-v2.md` (e.g. `task-1-`, `task-2-`, ...
through `task-24-`, plus the final-verification files
`final-f1-`...`final-f4-`). The suffix does not change the convention; it only
names the plan. The file must contain:

1. **Timestamp and environment**: the date, Node version, pnpm version, OS.
2. **Files created or modified**: a list with paths.
3. **Full command output**: paste the real output of every verification command.
   Not a summary. Not "tests passed". The actual output.
4. **Negative tests**: where applicable, introduce a violation, confirm the gate
   fails, revert, confirm it passes.

---

## Anti-cheat rules

These two rules are non-negotiable. Violating them invalidates the evidence.

### No `--dry-run` as evidence

A dry run proves nothing. Run the real command. If the command is destructive or
slow, run it in a controlled context, but run it. Capture the real exit code and
output.

### No preview-cleared-as-source

A runtime preview that renders correctly does not prove the source changed. The
verification loop must assert on the actual source after HMR. If you changed
source, read the file back (or run the build and check the output) to confirm the
change landed. A green preview is not a green source check.

This maps to PRD Appendix D constraint 1 (line 2896): runtime preview mutation is
not a source change.

---

## Adversarial QA

Where a gate is meant to catch violations, prove that it does. Introduce a
violation, confirm the gate fails, revert, confirm it passes. Capture both the
failure and the recovery in the evidence file.

Examples:

- **Boundary checker**: add an illegal import, run `pnpm boundaries`, confirm it
  fails with the right rule, revert, confirm it passes.
- **Docs-freshness test**: add a stale `pnpm` command to README, run the test,
  confirm it fails with the right message, revert, confirm it passes.
- **Biome check**: add an unused import, run `pnpm check`, confirm it fails,
  revert, confirm it passes.

Adversarial QA is what separates "the gate exists" from "the gate works".

---

## Definition of Done

A feature is done when all of these hold (PRD section 37, lines 2592-2608):

- The task has a corresponding issue or task ID
- The public API is typed
- Unit tests exist and pass
- Integration or e2e tests exist where needed and pass
- `pnpm check` passes
- `pnpm typecheck` passes
- `pnpm boundaries` passes
- Docs or README updated if behavior changed
- Error handling and logging are in place
- Privacy impact reviewed
- Undo or rollback possibility reviewed
- Protocol or schema changes recorded with version impact
