# @vision-control/cli

Command-line entry point for Vision Control. A small, dependency-light Node
binary (`vision-control`) that drives the daemon, queries the MCP server, and
runs workspace health checks. No external argument parser (manual `argv`
parsing) and no MCP client SDK — tool calls go through raw `fetch` JSON-RPC.

> Nx tags: `platform:node`, `type:library`, `scope:cli`.

## Build and run

```bash
pnpm nx run cli:build      # tsc -p tsconfig.build.json -> dist/
node packages/cli/dist/bin.js help
```

The binary resolves the daemon binary and MCP endpoint from environment
variables (see below).

## Commands

```
vision-control <command> [subcommand] [options]
```

| Command | Description |
| --- | --- |
| `daemon` | Start the Vision Control daemon (spawns the daemon binary with inherited stdio). |
| `status` | Show whether the daemon is reachable at the configured URL. |
| `sessions list` | List active daemon sessions. |
| `context current [--format json\|markdown]` | Show the compiled agent context for the current selection. `json` is the default. |
| `changes current` | Show the current changeset. |
| `verify current` | Request verification of the current changeset. |
| `preview clear` | Clear all runtime preview mutations. |
| `doctor` | Run workspace + runtime health checks. |
| `help`, `--help`, `-h` | Print this help. |

### Examples

```bash
vision-control help
vision-control status
vision-control sessions list
vision-control context current --format markdown
vision-control doctor
```

Data commands (`context`, `changes`, `verify`, `preview`, `sessions`) talk to the
MCP server over its HTTP transport. They require `VC_MCP_URL` (and usually
`VC_MCP_TOKEN`) to be set; otherwise they report that the endpoint is not
configured.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `VC_DAEMON_URL` | `http://127.0.0.1:4321` | Daemon base URL (used by `status`, `doctor`). |
| `VC_MCP_URL` | _(unset)_ | MCP HTTP endpoint, e.g. `http://127.0.0.1:4322/mcp`. Required by data commands. |
| `VC_MCP_TOKEN` | _(unset)_ | MCP session token (`Authorization: Bearer <token>`). |
| `VC_DAEMON_BIN` | `apps/daemon/dist/index.js` | Path to the daemon binary (used by `daemon`). |
| `VC_PLAYGROUND_URL` | `http://127.0.0.1:5173` | Playground URL checked by `doctor`. |

## `doctor` health checks

`vision-control doctor` runs nine checks and exits 0 only if all pass:

1. `install` — `pnpm install --frozen-lockfile` succeeds.
2. `boundaries` — `pnpm boundaries` (package boundary checker) passes.
3. `typecheck` — `pnpm typecheck` passes across all projects.
4. `test` — `pnpm test` passes across all projects.
5. `build` — `pnpm build` passes across all projects.
6. `daemon-binary` — the daemon binary starts (`node <bin> --help` exits 0).
7. `daemon` — the daemon is reachable at `VC_DAEMON_URL` (needs a running daemon).
8. `mcp` — the MCP server responds to `vision_get_active_session` (needs `VC_MCP_URL`).
9. `playground` — the playground at `VC_PLAYGROUND_URL` responds.

Workspace checks (1-5) shell out to `pnpm` and can take several minutes; each
prints a `running...` header so you see progress. Runtime checks (7-9) require
the corresponding service to be running and will report FAIL if it is not.

## Scripts

Run from the repository root:

```bash
pnpm nx run cli:build        # tsc -p tsconfig.build.json -> dist/
pnpm nx run cli:typecheck    # tsc --noEmit -p tsconfig.json
pnpm nx run cli:test         # vitest run
```

## Public API

The package also exports a programmatic API: `runCli(argv)` (returns an exit
code), `parseCommand`, `parseFormat`, `createContext`, and `HELP_TEXT`. Import
from `@vision-control/cli`.
