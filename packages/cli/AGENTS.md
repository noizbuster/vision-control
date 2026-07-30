<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# cli

## Purpose

Product CLI — MCP launcher only under ADR-020. `vision-control mcp` spawns the single-process MCP binary (stdio + loopback :4322). Removed legacy commands are listed explicitly and must stay removed.

Package: `@vision-control/cli` · Nx project typically `cli`.

## Key Files

| File | Description |
|------|-------------|
| `src/bin.ts` | CLI binary entry |
| `src/index.ts` | parseCommand / runCli / HELP_TEXT / REMOVED_COMMANDS |
| `src/commands/mcp.ts` | MCP spawn launcher |
| `src/commands/index.ts` | Command barrel |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/commands/` | CLI commands (MCP only) |

## For AI Agents

### Working In This Directory

- Do not reintroduce codemod/daemon/start commands (ADR-014/019/020).
- Launcher should build/use mcp-server dist binary path resolution.
- Help text must describe read-only MCP posture.

### Testing Requirements

```bash
pnpm nx run cli:typecheck
pnpm nx run cli:test
pnpm nx run cli:build
```

index tests for parse/help/removed commands.

### Common Patterns

- REMOVED_COMMANDS list as permanent regression guard.

### Anti-Patterns

- No source-mutating CLI product path.
- No multi-port scan flags.

## Dependencies

### Internal

- Spawns `@vision-control/mcp-server` binary

### External

- None beyond workspace catalog norms.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
