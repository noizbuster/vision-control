# @vision-control/pi

Pi adapter for Vision Control. This package holds copy-paste MCP config, an
agent workflow guide, and small typed helpers that build the config for you.

It does not run the MCP server. The server lives in `@vision-control/mcp-server`
and ships as the `vision-control-mcp` binary. This package only describes how Pi
reaches it.

> Nx tags: `platform:node`, `type:integration`, `scope:pi`.

## The one rule you must internalize

The Vision Control MCP server is **read-only**. There is no tool that writes
source, applies a patch, runs a codemod, or mutates the change journal. There is
no tool that applies a deterministic patch, and there will not be one. See
[docs/agents/mcp-policy.md](../../docs/agents/mcp-policy.md), and ADRs
[010](../../docs/adr/ADR-010-readonly-mcp.md),
[012](../../docs/adr/ADR-012-deterministic-patch-suggestions.md), and
[020](../../docs/adr/ADR-020-mcp-bridge-projection.md).

The **extension** is the source of truth (ADR-019). MCP is an optional projection
bridge. You do **not** set `VC_DAEMON_URL`. There is no always-on daemon product
path.

When the context contains a deterministic patch suggestion (`suggestedDiff`), it
is **inert data**. You read it, decide whether to use it, then write the file
yourself through your own file-editing tools. The MCP server never applies it.

## Prerequisites

1. Load the Vision Control extension and edit offline if you only need the panel.
2. For an agent, build and start the MCP bridge:

```bash
pnpm nx run mcp-server:build
vision-control mcp
```

The process serves stdio (agent) plus discover + WebSocket bridge on fixed port
**4322**. Pair token prints **once on stderr**. Pair the DevTools panel before
expecting live tool data.

The configs below assume you run them from the workspace root, so
`pnpm exec vision-control-mcp` resolves the binary. If Pi runs outside the
workspace, point the command at the built binary directly:

```
node /absolute/path/to/vision-control/packages/mcp-server/dist/bin.js
```

## Connect Pi

Pi reaches an MCP server over stdio (a spawned child process) or loopback HTTP
(a URL endpoint). The exact name and shape of Pi's server-entry setting evolves
independently of this repo, so map the fields below onto Pi's current MCP client
settings. The transport contract is what matters and is stable.

### stdio (recommended)

Transport fields:

- transport: `stdio`
- command: `["pnpm", "exec", "vision-control-mcp"]`

No daemon env is required. Until the extension pairs, tools return `not_paired`
/ empty. See [examples/pi.stdio.json](./examples/pi.stdio.json).

### loopback HTTP (optional)

Product path for agents is stdio + bridge. Loopback Streamable-HTTP remains
available for tooling. Agent Bearer (`VC_MCP_TOKEN`) is **not** the extension
pair token.

- transport: `http`
- url: `http://127.0.0.1:4322/mcp`
- headers: `{ "Authorization": "Bearer change-me" }`

See [examples/pi.http.json](./examples/pi.http.json).

## Smoke test the connection

1. Start the MCP process; read the pair token from stderr.
2. Pair the Vision Control panel.
3. Ask Pi:

```
Call vision_get_active_session and report the session id and connection state.
```

## Tools

Five read/projection tools and four coordination signals (ADR-020 C5). None of
them write source.

**Read / projection**

| Tool | What it returns |
| --- | --- |
| `vision_get_active_session` | session id, connection state, protocol version |
| `vision_get_selection` | the selected element's identity and summary |
| `vision_get_changeset` | the current changeset with per-operation summaries |
| `vision_get_source_context` | the compiled, redacted agent context (JSON or Markdown) |
| `vision_get_verification_plan` | last plan/result projection (may be empty) |

**Coordination (signals, not source writes)**

| Tool | What it does |
| --- | --- |
| `vision_clear_preview` | clear all runtime preview mutations |
| `vision_request_verification` | ask the content runtime to verify after HMR |
| `vision_mark_patch_started` | signal that an external patch cycle began |
| `vision_mark_patch_completed` | signal that an external patch cycle ended |

Every response flows through `@vision-control/security#redactObject` before it
leaves the server (ADR-009).

## Read the context

```
Call vision_get_source_context with format "markdown" and summarize the goal,
the target element, the pending operations, and any suggested diffs.
```

Sample: [examples/exported-context.json](./examples/exported-context.json).
Origins may be empty when maps are unavailable.

## Consume a patch suggestion

`suggestedDiff` is inert data. Read it, check preconditions, apply with your own
file tools, then verify. Dynamic or ambiguous edits return `agent-required`.

## Verification and the patch lifecycle

1. Read state with the projection tools.
2. Apply the file change yourself.
3. `vision_mark_patch_started` → save → HMR → `vision_request_verification` →
   `vision_mark_patch_completed`.
4. Read `vision_get_verification_plan`.

## Programmatic config

```ts
import { buildPiConfig, buildStdioEntry } from "@vision-control/pi";

const config = buildPiConfig(buildStdioEntry());
console.log(JSON.stringify(config, null, 2));
```

`buildStdioEntry()` does not emit `VC_DAEMON_URL`.

## Troubleshooting

**The server is not listed by Pi.** Build and start the binary; check the command
path. Outside the workspace, use the absolute path to
`packages/mcp-server/dist/bin.js`.

**A tool responds `not_paired` or empty.** Pair the extension panel. There is no
`VC_DAEMON_URL` product path.

**Port 4322 is busy.** Only one MCP product process may bind discover/bridge.

**There is no tool that applies a patch.** Intentional. See
[docs/agents/mcp-policy.md](../../docs/agents/mcp-policy.md).

For more, see [docs/troubleshooting.md](../../docs/troubleshooting.md).

## Sample agent prompts

Full prompts: [examples/agent-prompt.md](./examples/agent-prompt.md).

```
Use vision_get_active_session to confirm the connection, then
vision_get_source_context with format "markdown". Summarize the user's goal,
the selected element, the pending operations, and any suggested diff. Do not
edit any files.
```

```
From vision_get_source_context, find the suggestedDiff with confidence "high".
Verify its preconditions hold. Mark the patch started with
vision_mark_patch_started, apply the diff to the source file, then mark it
completed with vision_mark_patch_completed. Read vision_get_verification_plan
and report whether every assertion passed.
```

```
I edited src/Button.tsx by hand. Call vision_request_verification, then read
vision_get_verification_plan. If any assertion failed, tell me which DOM property
diverges and do not edit anything else.
```

## Scripts

```bash
pnpm nx run pi:build
pnpm nx run pi:typecheck
pnpm nx run pi:test
```
