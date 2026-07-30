<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# opencode

## Purpose

OpenCode adapter: copy-paste MCP config, agent workflow guide, typed helpers. Does not run the MCP server.

Package: `@vision-control/opencode`. MCP remains **read-only** (ADR-010/012/020).

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | Public barrel |
| `src/mcp-config.ts` | Typed MCP config builders |
| `README.md` | Human workflow + rules |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Config helpers (see `src/AGENTS.md`) |
| `examples/` | stdio/http JSON samples + agent prompt (see `examples/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Never document or add a source-mutating MCP tool.
- No `VC_DAEMON_URL` or daemon product path.
- Examples must use loopback / stdio patterns consistent with ADR-020.

### Testing Requirements

```bash
pnpm nx run opencode:test
pnpm nx run opencode:build
```

### Common Patterns

- `build*Config` helpers returning plain JSON-serializable objects.

### Anti-Patterns

- Embedding pair tokens in committed example configs.
- Suggesting non-loopback MCP binds.

## Dependencies

### Internal

- Documents `@vision-control/mcp-server` / CLI launcher; no browser package imports.

### External

- Minimal/none.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
