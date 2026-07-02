# ADR-005: Evidence convention and zero-intervention verification

## Status

Accepted (2026-07-02).

## Context

The MVP plan has 20+ tasks, each executed by a coding agent. Without a
structured evidence trail, it is impossible to tell whether a task actually
passed its gates or whether the agent claimed success based on a `--dry-run` or
a preview that looked right.

The PRD (section 37, lines 2592-2608) defines Definition of Done as a checklist
that includes Biome check, typecheck, boundary compliance, tests, and docs. The
PRD (section 35.3, lines 2515-2526) lists the exact commands to run before
declaring work complete.

Two anti-patterns must be prevented:

1. Using `--dry-run` output as proof that a command works.
2. Passing a preview-cleared check off as source verification (a preview that
   renders correctly does not prove the source changed).

## Decision

Every plan task produces an evidence file at
`.omo/evidence/task-<N>-vision-control-mvp.md`. The file must contain:

- A timestamp and environment (Node version, pnpm version, OS)
- The list of files created or modified
- The full, real output of every verification command (`pnpm check`,
  `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm boundaries`)
- Any negative tests performed (for example, confirming a gate fails when a
  violation is introduced, then passes when it is reverted)

Evidence rules:

- **No `--dry-run` as evidence.** Run the real command and capture the real
  output. A dry run proves nothing about whether the command succeeds.
- **No preview-cleared-as-source.** A runtime preview that renders correctly is
  not proof that source changed. The verification loop must assert on the actual
  source after HMR.
- **No summaries.** Paste the command output. An agent that writes "tests passed"
  without the output is not providing evidence.
- **Adversarial QA.** Where applicable, include a negative test: introduce a
  violation, confirm the gate fails, revert, confirm it passes. This proves the
  gate actually catches violations.

## Consequences

- Evidence files grow large with real output. That is the point. They are the
  audit trail for every task.
- Agents must run the full verification suite before claiming done. This is
  non-negotiable and is checked by the plan orchestrator.
- The `.omo/evidence/` directory is tracked in git (decision D7) so the audit
  trail survives across clones and agents.
- The docs-freshness test in `packages/testing` is an example of adversarial QA:
  it fails if README references a script that does not exist.

## MVP Guardrail

The evidence convention is the backbone of MVP quality control. Every task is
executed by an agent, and agents are prone to claiming success prematurely. The
evidence file forces real command output into the record, which the orchestrator
and reviewers can audit. The preview-vs-source anti-cheat rule (PRD Appendix D
constraint 1, line 2896) prevents the most dangerous MVP failure: shipping a
preview that looks right but whose source was never actually changed. Without
this convention, there is no way to trust that any task is truly done.
