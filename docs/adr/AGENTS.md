<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# adr

## Purpose

Architecture Decision Records. Binding decisions for toolchain, boundaries,
extension SoT, MCP bridge, privacy, and deferred scope. Read before changing
architecture.

## Key Files

| File | Description |
|------|-------------|
| `README.md` | ADR index / how to add ADRs |
| `ADR-001-toolchain.md` | Biome-only toolchain |
| `ADR-002-typescript-strict.md` | TS strict baseline |
| `ADR-003-package-boundaries.md` | Platform boundary rules |
| `ADR-004-hybrid-tdd.md` | Test strategy |
| `ADR-005-evidence-convention.md` | Evidence file convention |
| `ADR-006-wxt-react-extension.md` | WXT + React extension |
| `ADR-007-loopback-daemon.md` | Historical daemon loopback (superseded path) |
| `ADR-008-dev-only-source-markers.md` | Dev-only markers |
| `ADR-009-privacy-redaction.md` | Privacy + redaction |
| `ADR-010-readonly-mcp.md` | Read-only MCP tools |
| `ADR-011-v1-screenshot-crops.md` | Screenshot crop/redaction |
| `ADR-012-deterministic-patch-suggestions.md` | Inert suggested-diff |
| `ADR-013-mcp-loopback-http-policy.md` | MCP HTTP loopback policy |
| `ADR-014-codemod-outside-mcp.md` | Codemod not via MCP |
| `ADR-015-share-bundles-collaboration-trust.md` | Local share bundles |
| `ADR-016-firefox-support-level.md` | Firefox matrix scope |
| `ADR-017-accessibility-repair-scope.md` | Advisory a11y only |
| `ADR-018-remote-collaboration-deferred.md` | No remote collab |
| `ADR-019-extension-source-of-truth.md` | **Extension SoT pivot** |
| `ADR-020-mcp-bridge-projection.md` | **MCP bridge projection** |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Prefer ADR-019/020 for current product shape.
- Supersession is explicit in later ADRs — do not re-implement superseded paths
  (daemon-as-SoT, source-mutating MCP, marker HIGH product path).
- New ADRs need number, title, status, context, decision, consequences.

### Testing Requirements

- Cross-link integrity; docs-freshness tests may flag missing references.

### Common Patterns

- Filename `ADR-NNN-kebab-case.md`.
- Decisions referenced from package briefs and root MUST NOT list.

## Dependencies

### Internal

- Implements constraints enforced in code (boundaries, mcp-server tools, extension).

### External

- None.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
