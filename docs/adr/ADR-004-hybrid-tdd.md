# ADR-004: Hybrid TDD strategy

## Status

Accepted (2026-07-02).

## Context

The MVP has two categories of code. The first is pure logic with well-defined
inputs and outputs: schemas, change IR, element identity, auth, and source
resolution. Bugs here are subtle and expensive to debug through the UI. The
second is UI glue: overlay rendering, DevTools panel wiring, event plumbing.
Bugs here are visible and fast to reproduce by looking at the screen.

Pure TDD on everything slows down UI iteration. Test-after on everything lets
schema bugs slip through to runtime where they are hard to trace. The PRD
(section 36, lines 2541+) requires unit tests, integration tests, and e2e tests
for every feature before it is done.

## Decision

Apply TDD-first to the logic-heavy packages and test-after to the UI glue
packages.

**TDD-first** (write a failing test that names the behavior, then write the
minimum code to pass it):

- `packages/protocol` - message schemas and Zod definitions
- `packages/change-ir` - the change representation and its invariants
- `packages/element-identity` - stable element addressing and re-identification
- `packages/security` - session tokens, origin allowlist, redaction rules
- `integrations/vite-react` - source marker plugin transform

**Test-after** (build the feature, then pin its behavior with tests):

- `packages/overlay-ui` - selection overlay rendering
- `packages/editor-core` UI bindings - command dispatch glue
- `apps/extension` - DevTools panel and background service worker wiring

Every feature still ships with unit, integration, and e2e coverage regardless of
the approach. The difference is ordering: red-green for logic, green-pin for
glue.

## Consequences

- Schema and IR changes come with tests first, so regressions surface during
  development, not during integration.
- UI packages still get test coverage, but the tests are written after the
  feature stabilizes. This avoids throwaway tests that test an intermediate UI
  shape.
- The e2e suite (Playwright) covers end-to-end user-visible outcomes regardless
  of which approach the underlying packages used.
- Contributors must know which category a package falls into before starting.
  This ADR and [docs/agents/verification.md](../agents/verification.md) are the
  reference.

## MVP Guardrail

TDD-first on schemas, IR, identity, and auth prevents the silent-data-corruption
bugs that would undermine trust in the preview-to-source pipeline. If a change IR
operation is wrong, every downstream edit is wrong. Test-after on UI glue keeps
iteration fast where the feedback loop is visual. This split matches the MVP's
risk profile: the logic is where subtle bugs hide, the UI is where they are
obvious. Mandating full TDD everywhere would slow the MVP without catching more
bugs.
