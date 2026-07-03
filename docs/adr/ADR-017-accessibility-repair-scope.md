# ADR-017: Accessibility repair scope

## Status

Accepted (2026-07-03). Defines the V2 accessibility repair suggestion scope as
advisory only.

## Context

The PRD lists "accessibility repair suggestions" as a V2 feature (PRD section
7.3, line 311) and specifies the checks: role/name, label/control, focus order,
DOM-vs-visual order, CSS `order`, and keyboard navigation (PRD lines 1987-2003
and 2307-2401). The approved V1/V2 plan resolves the owner decision: a11y repair
is advisory suggestions plus deterministic verification assertions only; no
automatic semantic rewrites.

The risk is that "repair" becomes auto-mutation: silently rewriting the DOM or
source to "fix" accessibility, which would violate the preview-to-source
distinction (PRD Appendix D constraint 1, line 2896) and could break label/
control relations, role/name bindings, or reading order in ways the user did not
request. The relevant guardrail from [AGENTS.md](../../AGENTS.md): runtime
preview mutation is not a source change; no preview-cleared check counts as
source verification.

## Decision

V2 accessibility repair is advisory only.

- **Advisory suggestions.** The system reports accessibility issues with
  suggested fixes (role/name corrections, label/control association, focus and
  reading-order warnings, CSS `order` desync, keyboard navigation gaps). The
  suggestions are data shown to the user and the agent, not applied
  automatically.
- **Verification assertions.** Each suggestion is backed by a deterministic
  verification assertion so a fix can be checked after it is applied through the
  normal edit path. A suggestion that would break label/control, role/name,
  focus, or DOM-vs-visual order fails verification.
- **No auto-mutation.** The system never auto-mutates the DOM or source for an
  accessibility fix. A fix becomes a real change only through the standard edit
  pipeline (change IR, preview, then source patch with HMR verification), never
  through a silent DOM or source rewrite.
- **No preview-as-source.** A preview that "looks fixed" is not evidence. The
  verification loop must assert on the actual source after HMR (AGENTS.md).

## Consequences

- Accessibility guidance is safe to surface broadly because it cannot change
  state on its own. A user or agent decides whether to act.
- The verification assertions let a fix be validated end-to-end, so an applied
  a11y change is checked for regressions in label/control, role/name, focus, and
  reading order.
- The DOM and source are never silently rewritten, preserving the
  preview-to-source distinction for accessibility work the same way it is
  preserved for layout work.

## MVP Guardrail

This ADR protects the V2 accessibility-repair feature (PRD 7.3, line 311) from
becoming an auto-mutation surface. It restates the AGENTS.md guardrail that a
preview mutation is not a source change and that preview-cleared is not source-
verified. Accessibility suggestions stay advisory and assertion-backed, so a
"fix" can never silently rewrite DOM or source outside the standard edit and
verification pipeline.
