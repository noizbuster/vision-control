# Architecture Decision Records

Every significant architectural decision in Vision Control is recorded here as
an ADR. Each ADR has exactly five sections in order: `## Status`, `## Context`,
`## Decision`, `## Consequences`, and `## MVP Guardrail`. The guardrail section
states which V1 or V2 features the decision protects against and which
[AGENTS.md](../../AGENTS.md) MUST NOT it enforces.

Read in order. Later ADRs extend or supersede earlier ones; the `## Status`
section names any supersedes relationship.

## MVP foundation (ADR-001 to ADR-010)

- [ADR-001: pnpm + Nx + Biome toolchain](./ADR-001-toolchain.md)
- [ADR-002: TypeScript strict mode](./ADR-002-typescript-strict.md)
- [ADR-003: Package boundaries](./ADR-003-package-boundaries.md)
- [ADR-004: Hybrid TDD](./ADR-004-hybrid-tdd.md)
- [ADR-005: Evidence convention and zero-intervention verification](./ADR-005-evidence-convention.md)
- [ADR-006: WXT + React extension](./ADR-006-wxt-react-extension.md)
- [ADR-007: Authenticated loopback daemon](./ADR-007-loopback-daemon.md) - historical daemon model; SoT/backend claims superseded by ADR-019/020; loopback retained
- [ADR-008: Dev-only source markers](./ADR-008-dev-only-source-markers.md)
- [ADR-009: Privacy redaction policy](./ADR-009-privacy-redaction.md)
- [ADR-010: Read-only MCP and no source mutation](./ADR-010-readonly-mcp.md) - read-only contract in force; SoT clause superseded by ADR-019/020

## V1/V2 policy gates (ADR-011 to ADR-018)

These ADRs reconcile the policy docs before V1/V2 feature work begins. They
extend, never weaken, the MVP guardrails above.

- [ADR-011: V1 element screenshot crops](./ADR-011-v1-screenshot-crops.md) - opt-in, local, redacted, masked, short-retention.
- [ADR-012: Deterministic patch suggestions as inert data](./ADR-012-deterministic-patch-suggestions.md) - inert `suggestedDiff` data only; never an MCP write tool.
- [ADR-013: MCP loopback HTTP policy](./ADR-013-mcp-loopback-http-policy.md) - loopback HTTP/WS; no non-loopback expansion without a future ADR; bridge shape refined in ADR-020.
- [ADR-014: Direct codemod outside MCP](./ADR-014-codemod-outside-mcp.md) - never an MCP tool; product CLI codemod path superseded by ADR-019/020 (agent file tools).
- [ADR-015: Share bundles and collaboration trust model](./ADR-015-share-bundles-collaboration-trust.md) - local token-free export; product CLI share path superseded by ADR-019/020 (panel export); remote deferred.
- [ADR-016: Firefox support level](./ADR-016-firefox-support-level.md) - parity scope, manifest differences, no mandatory debugger, no broad host permissions.
- [ADR-017: Accessibility repair scope](./ADR-017-accessibility-repair-scope.md) - advisory suggestions only, backed by verification assertions, never auto-mutation.
- [ADR-018: Remote real-time collaboration deferred](./ADR-018-remote-collaboration-deferred.md) - no remote collaboration until a trust-model ADR approves identity, revocation, encryption, and transport.

## Extension SoT pivot (ADR-019 to ADR-020)

Architecture pivot after v0.2.0: extension owns edit/journal truth; MCP is an
optional single-process bridge. Contracts C1-C8 live in these ADRs.

- [ADR-019: Extension as source of truth](./ADR-019-extension-source-of-truth.md) - journal SoT (C1), map caps (C4), verify home (C6), keep/delete inventory (C7), SW reconnect (C8); supersedes daemon-as-SoT.
- [ADR-020: MCP bridge projection and single-process dual transport](./ADR-020-mcp-bridge-projection.md) - single process dual transport (C2), pair/discover (C3), slim tools (C5); loopback-only restated; supersedes daemon-as-backend.
