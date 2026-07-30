<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# integrations

## Purpose

Optional adapters that help external tools reach Vision Control. **Keep**
product integrations are agent MCP config helpers (`opencode`, `pi`). Former
build-tool / marker / CSS adapter packages are delete-disposition under ADR-019
C7 and must not be restored as product paths.

## Key Files

| File | Description |
|------|-------------|
| _(per integration)_ | Keep packages own `package.json`, `project.json`, `src/`, `examples/` |

## Subdirectories

| Directory | Disposition | Purpose |
|-----------|-------------|---------|
| `opencode/` | **Keep** | OpenCode MCP config helpers + examples (see `opencode/AGENTS.md`) |
| `pi/` | **Keep** | Pi MCP config helpers + examples (see `pi/AGENTS.md`) |
| `css-modules/`, `next-react/`, `svelte/`, `tailwind/`, `vanilla-css/`, `vite-react/`, `vue/` | **Delete residual** | Marker/CSS adapters unwired; dist husks only — do not revive |

## For AI Agents

### Working In This Directory

- Integrations must not run the MCP server; they only describe how to reach
  `@vision-control/mcp-server` / `vision-control-mcp`.
- Never add a source-mutating tool or daemon URL (`VC_DAEMON_URL`) back into configs.
- MCP remains read-only (ADR-010/012/020).

### Testing Requirements

```bash
pnpm nx run opencode:test
pnpm nx run pi:test
```

### Common Patterns

- `src/mcp-config.ts` builds typed config objects.
- `examples/*stdio.json` / `*http.json` are copy-paste samples.
- `examples/agent-prompt.md` documents the agent workflow.

## Dependencies

### Internal

- Docs only to mcp-server policy; no hard runtime dependency on browser packages.

### External

- Node-side config only; keep deps minimal.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
