<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# mcp-server

## Purpose

Node MCP server: read-only tools + coordination signals, single process with stdio (agent) and loopback discover/WebSocket bridge on fixed port 4322 (ADR-020). Never a source of truth; never mutates source.

Package: `@vision-control/mcp-server` · Nx project typically `mcp-server`.

## Key Files

| File | Description |
|------|-------------|
| `src/bin.ts` | vision-control-mcp binary |
| `src/server.ts` | createMcpServer |
| `src/auth.ts` | Auth checks |
| `src/tool-helpers.ts` | textResult/errorResult helpers |
| `src/daemon-deps.ts` | Legacy dep shims / stubs posture |
| `src/stub-deps.ts` | Stub deps for unpaired operation |
| `src/types.ts` | Server types |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/tools/` | Read-only MCP tools (see `src/tools/AGENTS.md`) |
| `src/bridge/` | Loopback bridge + projection cache (see `src/bridge/AGENTS.md`) |
| `src/transports/` | stdio + http transports (see `src/transports/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Tools are read-only or coordination-only (mark patch started/completed, request verification, clear preview signal).
- Pair token on stderr / panel paste only — never stdout, never /discover (ADR-020 C3).
- Unpaired MCP must never return stale passed:true (ADR-019 C6).
- Bind loopback only; fixed port 4322; no multi-port scan.

### Testing Requirements

```bash
pnpm nx run mcp-server:typecheck
pnpm nx run mcp-server:test
pnpm nx run mcp-server:build
```

tool tests, bridge session roundtrips, http/stdio, projection authority tests.

### Common Patterns

- register*Tool functions.
- Projection cache with generation/lifecycle.
- Command queue for bridge commands.

### Anti-Patterns

- No vision_apply_deterministic_patch or any source write tool.
- No non-loopback bind.
- No daemon-as-SoT restoration.

## Dependencies

### Internal

- context-compiler
- protocol
- security

### External

- @modelcontextprotocol/sdk
- ws
- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
