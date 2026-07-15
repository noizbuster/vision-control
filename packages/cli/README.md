# @vision-control/cli

Product CLI for Vision Control. Under ADR-020 the surface is the **MCP launcher
only** (plus help). `vision-control mcp` spawns the single-process MCP binary
(`packages/mcp-server` dist/bin.js): stdio for the agent plus loopback discover
and bridge on port **4322**.

> Nx tags: `platform:node`, `type:library`, `scope:cli`.

## Build and run

```bash
pnpm nx run mcp-server:build
pnpm nx run cli:build
node packages/cli/dist/bin.js help
node packages/cli/dist/bin.js mcp
```

## Commands

```
vision-control mcp [args...]
vision-control help
```

| Command | Description |
| --- | --- |
| `mcp` | Start the single-process MCP server (stdio + bridge `:4322`). |
| `help`, `--help`, `-h` | Print help. |

Former product commands (`daemon`, `status`, `sessions`, `context`, `changes`,
`verify`, `preview`, `share`, `codemod`, `doctor`) are **removed**. They exit
non-zero with a clear error pointing at `vision-control mcp` (or monorepo
`pnpm check` / `typecheck` / `test` / `build` for health).

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `VC_MCP_BIN` | workspace `packages/mcp-server/dist/bin.js` | Override path to the MCP binary. |

Pair token prints once on MCP **stderr**. Discover is secret-free at
`http://127.0.0.1:4322/discover`. Stdout is reserved for agent JSON-RPC.

## Scripts

```bash
pnpm nx run cli:build
pnpm nx run cli:typecheck
pnpm nx run cli:test
```

## Public API

Programmatic: `runCli(argv)`, `parseCommand`, `runMcp`, `resolveMcpBinary`,
`HELP_TEXT`, `REMOVED_COMMANDS`. Import from `@vision-control/cli`.
