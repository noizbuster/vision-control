# @vision-control/opencode

OpenCode adapter for Vision Control. This package holds copy-paste MCP config,
an agent workflow guide, and small typed helpers that build the config for you.

It does not run the MCP server. The server lives in `@vision-control/mcp-server`
and ships as the `vision-control-mcp` binary. This package only describes how
OpenCode reaches it.

> Nx tags: `platform:node`, `type:integration`, `scope:opencode`.

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
is **inert data**: diff text, source ranges, a confidence level, and
preconditions. You read it, decide whether to use it, then write the file
yourself through your own file-editing tools. The MCP server never applies it.

## Prerequisites

1. Load the Vision Control extension and edit offline if you only need the panel.
2. For an agent, build and start the MCP bridge:

```bash
pnpm nx run mcp-server:build   # emits packages/mcp-server/dist/bin.js
vision-control mcp             # or: pnpm exec vision-control-mcp
```

The process serves stdio (agent) plus discover + WebSocket bridge on fixed port
**4322**. Pair token prints **once on stderr**. Pair the DevTools panel before
expecting live tool data.

The configs below assume you run them from the workspace root, so
`pnpm exec vision-control-mcp` resolves the binary. If OpenCode runs outside the
workspace, point the command at the built binary directly:

```
node /absolute/path/to/vision-control/packages/mcp-server/dist/bin.js
```

## Connect OpenCode

OpenCode reads MCP servers from the `mcp` block of an `opencode.json` (project
or user config). Add a `vision-control` entry.

### stdio (recommended)

OpenCode spawns the server as a child process and talks JSON-RPC over
stdin/stdout. This is the simplest path.

```json
{
  "mcp": {
    "vision-control": {
      "type": "local",
      "command": ["pnpm", "exec", "vision-control-mcp"],
      "enabled": true
    }
  }
}
```

No daemon env is required. Until the extension pairs, tools return `not_paired`
/ empty. After pair, tools read the extension projection cache. See
[examples/opencode.stdio.json](./examples/opencode.stdio.json).

### loopback HTTP (optional)

Product path for agents is stdio + bridge. Loopback Streamable-HTTP remains
available for tooling that needs a URL. It binds to `127.0.0.1` only and rejects
requests without a valid Bearer token (ADR-013). Agent Bearer (`VC_MCP_TOKEN`) is
**not** the extension pair token. Prefer stdio so you do not fight port 4322 with
the product bridge.

```json
{
  "mcp": {
    "vision-control": {
      "type": "url",
      "url": "http://127.0.0.1:4322/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer change-me"
      }
    }
  }
}
```

See [examples/opencode.http.json](./examples/opencode.http.json).

## Smoke test the connection

1. Start the MCP process; read the pair token from stderr.
2. Pair the Vision Control panel (paste token / auto-detect
   `http://127.0.0.1:4322/discover`).
3. Restart OpenCode if needed, then ask:

```
Call vision_get_active_session and report the session id and connection state.
```

## Tools

Five read/projection tools and four coordination signals (ADR-020 C5). None of
them write source. Capture and diagnostics are not product tools.

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
leaves the server. There is no unredacted export path (ADR-009).

## Read the context

The headline tool is `vision_get_source_context`. It returns the compiled agent
context for the current selection, redacted, in JSON (default) or Markdown:

```
Call vision_get_source_context with format "markdown" and summarize the goal,
the target element, the pending operations, and any suggested diffs.
```

A redacted sample is in
[examples/exported-context.json](./examples/exported-context.json). Origins may
be empty when maps are unavailable.

## Consume a patch suggestion

For safe, static edits the context can include a `suggestedDiff`. This is
candidate data, never an applied change.

1. Read the suggestion from `vision_get_source_context`.
2. Check `preconditions` and `confidence`.
3. If you accept it, apply the diff through your own file-editing tools.
4. Run the verification loop so the runtime proves the patched source.

If the edit is dynamic or ambiguous, no suggestion is produced. The context
returns an `agent-required` signal instead.

## Verification and the patch lifecycle

1. Read state: `vision_get_changeset`, `vision_get_source_context`,
   `vision_get_verification_plan`.
2. Apply the file change yourself.
3. `vision_mark_patch_started({ patchId, description })`.
4. Save the file. HMR reloads the page.
5. `vision_request_verification()`.
6. `vision_mark_patch_completed({ patchId, success })`.

Read the result with `vision_get_verification_plan`. A green verification means
the source you wrote produces the visual state the user asked for.

## Programmatic config

```ts
import { buildOpenCodeConfig, buildStdioEntry } from "@vision-control/opencode";

const config = buildOpenCodeConfig(buildStdioEntry());
console.log(JSON.stringify(config, null, 2));
```

`buildStdioEntry()` does not emit `VC_DAEMON_URL`. `buildHttpEntry(opts)` takes a
token only from the caller; builders never embed a real secret.

## Troubleshooting

**The `vision-control` server is not listed by OpenCode.** Confirm the server
builds and the binary starts:

```bash
pnpm nx run mcp-server:build
node packages/mcp-server/dist/bin.js   # pair token on stderr; stdout is JSON-RPC
```

**A tool responds `not_paired` or empty.** Pair the extension panel. Live data
comes from the extension projection cache, not a daemon URL.

**Port 4322 is busy.** Only one MCP product process may bind discover/bridge.
Stop the other instance.

**There is no tool that applies a patch.** Intentional. Write source through your
own file tools and verify through HMR. See
[docs/agents/mcp-policy.md](../../docs/agents/mcp-policy.md).

For more, see [docs/troubleshooting.md](../../docs/troubleshooting.md).

## Sample agent prompts

Full prompts: [examples/agent-prompt.md](./examples/agent-prompt.md).

**Inspect and report.**

```
Use vision_get_active_session to confirm the connection, then
vision_get_source_context with format "markdown". Summarize the user's goal,
the selected element, the pending operations, and any suggested diff. Do not
edit any files.
```

**Apply a high-confidence suggestion safely.**

```
From vision_get_source_context, find the suggestedDiff with confidence "high".
Verify its preconditions hold. Mark the patch started with
vision_mark_patch_started, apply the diff to the source file, then mark it
completed with vision_mark_patch_completed. Read vision_get_verification_plan
and report whether every assertion passed.
```

**Verify after a manual edit.**

```
I edited src/Button.tsx by hand. Call vision_request_verification, then read
vision_get_verification_plan. If any assertion failed, tell me which DOM property
diverges and do not edit anything else.
```

## Scripts

```bash
pnpm nx run opencode:build
pnpm nx run opencode:typecheck
pnpm nx run opencode:test
```
