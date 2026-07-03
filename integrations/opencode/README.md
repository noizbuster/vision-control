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
[010](../../docs/adr/ADR-010-readonly-mcp.md) and
[012](../../docs/adr/ADR-012-deterministic-patch-suggestions.md).

When the context contains a deterministic patch suggestion (`suggestedDiff`), it
is **inert data**: diff text, source ranges, a confidence level, and
preconditions. You read it, decide whether to use it, then write the file
yourself through your own file-editing tools. The MCP server never applies it.

## Prerequisites

Build the server once from the workspace root:

```bash
pnpm nx run mcp-server:build   # emits packages/mcp-server/dist/bin.js
```

The configs below assume you run them from the workspace root, so
`pnpm exec vision-control-mcp` resolves the binary. If OpenCode runs outside the
workspace, point the command at the built binary directly:

```
node /absolute/path/to/vision-control/packages/mcp-server/dist/bin.js
```

## Connect OpenCode

OpenCode reads MCP servers from the `mcp` block of an `opencode.json` (project
or user config). Add a `vision-control` entry. Two transports are supported.

### stdio (recommended)

OpenCode spawns the server as a child process and talks JSON-RPC over
stdin/stdout. This is the simplest path and needs no HTTP endpoint.

```json
{
  "mcp": {
    "vision-control": {
      "type": "local",
      "command": ["pnpm", "exec", "vision-control-mcp"],
      "enabled": true,
      "environment": {
        "VC_DAEMON_URL": "http://127.0.0.1:4321"
      }
    }
  }
}
```

`VC_DAEMON_URL` tells the server where the daemon is. Without it, the server
still starts and every tool returns a valid "no daemon connected" response. That
is useful for confirming the tool list before the daemon is running. See
[examples/opencode.stdio.json](./examples/opencode.stdio.json) for a ready file.

### loopback HTTP

If you prefer an HTTP endpoint, the server also serves a loopback
Streamable-HTTP transport. It binds to `127.0.0.1` only and rejects every
request that lacks a valid Bearer token (ADR-013).

Launch the endpoint with a small script (the `vision-control-mcp` binary is
stdio-only):

```ts
import { createMcpServer, createStubDeps, startHttpTransport } from "@vision-control/mcp-server";

const port = Number(process.env.VC_MCP_PORT ?? 4322);
const server = createMcpServer(createStubDeps());
await startHttpTransport(server, {
  port,
  auth: { token: process.env.VC_MCP_TOKEN ?? "change-me" },
});
console.log(`MCP HTTP listening on http://127.0.0.1:${port}/mcp`);
```

Then point OpenCode at it:

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

Replace `change-me` with the token your launcher reads from `VC_MCP_TOKEN`. See
[examples/opencode.http.json](./examples/opencode.http.json).

## Smoke test the connection

After saving the config, restart OpenCode. Confirm the server is reachable by
asking it to call the session tool:

```
Call vision_get_active_session and report the session id and connection state.
```

From a terminal, the CLI doctor checks both the daemon and the MCP endpoint:

```bash
VC_MCP_URL=http://127.0.0.1:4322/mcp VC_MCP_TOKEN=change-me \
  node packages/cli/dist/bin.js doctor
```

## Tools

Seven read-only tools and four coordination signals. None of them write source.

**Read-only**

| Tool | What it returns |
| --- | --- |
| `vision_get_active_session` | session id, workspace, connection state, protocol version |
| `vision_get_selection` | the selected element's identity and summary |
| `vision_get_changeset` | the current changeset with per-operation summaries |
| `vision_get_source_context` | the compiled, redacted agent context (JSON or Markdown) |
| `vision_get_verification_plan` | the assertions planned for the current changeset |
| `vision_get_diagnostics` | preview-specificity conflicts and layout warnings |
| `vision_capture_element` | capture an element's source context by selector or id |

**Coordination (signals, not source writes)**

| Tool | What it does |
| --- | --- |
| `vision_request_verification` | ask the runtime to verify the current changeset after HMR |
| `vision_clear_preview` | clear all runtime preview mutations |
| `vision_mark_patch_started` | signal that an external patch cycle began |
| `vision_mark_patch_completed` | signal that an external patch cycle ended (also triggers verification) |

Every response flows through `@vision-control/security#redactObject` before it
leaves the server. There is no unredacted export path (ADR-009).

## Read the context

The headline tool is `vision_get_source_context`. It returns the full compiled
agent context for the current selection, redacted, in JSON (default) or
Markdown:

```
Call vision_get_source_context with format "markdown" and summarize the goal,
the target element, the pending operations, and any suggested diffs.
```

The JSON form is the one a programmatic agent parses. The Markdown form is the
one you read directly. A redacted sample is in
[examples/exported-context.json](./examples/exported-context.json). The shape is
defined by `CompiledContextSchema` in `@vision-control/context-compiler`.

## Consume a patch suggestion

For safe, static edits (token replacement, an unambiguous CSS declaration or
class change, a CSS Modules local edit, an inline style object edit, static JSX
text, or an unambiguous reorder), the context can include a `suggestedDiff`.
This is candidate data, never an applied change.

A suggestion carries:

- `diff`: unified diff text with full-line context
- `confidence`: `high`, `medium`, or `low`
- `preconditions`: conditions that must hold for the diff to apply cleanly
- `kind`: the suggestion class, e.g. `css-declaration-replace` or `tailwind-token-replace`
- `sourceRanges`: the source lines and columns the diff touches

There is no tool that applies it. The flow is:

1. Read the suggestion from `vision_get_source_context`.
2. Check the `preconditions` and the `confidence`. `high` means a static,
   unambiguous edit backed by marker or source-map evidence. `medium` and `low`
   mean the edit is plausible but needs your judgment.
3. If you accept it, apply the diff through your own file-editing tools.
4. Run the verification loop (next section) so the runtime proves the patched
   source matches the preview.

If the edit is dynamic or ambiguous (`props.className`, a computed class
expression, an ambiguous CSS rule), no suggestion is produced. The context
returns an `agent-required` signal instead, and you reason about the edit
yourself.

## Verification and the patch lifecycle

Every source change goes through an explicit, verifiable path. The MCP server
gives you the coordination signals; you do the writing. The lifecycle:

1. Read the current state: `vision_get_changeset`, `vision_get_source_context`,
   `vision_get_verification_plan`.
2. Decide on the edit. Apply the file change yourself, through your own tools.
3. Tell the runtime a patch cycle is starting:
   `vision_mark_patch_started({ patchId, description })`. This is a coordination
   signal. It records that an external patch began. It does not touch source.
4. Save the file. HMR reloads the page.
5. Ask for verification: `vision_request_verification()`. The runtime runs
   read-only assertions against the post-HMR DOM and reports pass or fail.
6. Close the cycle: `vision_mark_patch_completed({ patchId, success })`. This
   records that the external patch ended and also triggers a verification pass.

`vision_mark_patch_started` and `vision_mark_patch_completed` are signals that
frame the cycle. They never apply, revert, or modify a file. Use a stable
`patchId` across the pair so the runtime can correlate them.

Read the result with `vision_get_verification_plan` and `vision_get_diagnostics`
to see which assertions passed and where the patched DOM diverges from the
preview. A green verification means the source you wrote produces the visual
state the user asked for. A red one means it does not, and you fix the source,
not the preview.

## Programmatic config

The `@vision-control/opencode` package exports typed builders so a script or a
doc generator can emit the config without hand-editing JSON:

```ts
import { buildOpenCodeConfig, buildStdioEntry } from "@vision-control/opencode";

const config = buildOpenCodeConfig(buildStdioEntry());
console.log(JSON.stringify(config, null, 2));
```

`buildStdioEntry()` and `buildHttpEntry(opts)` produce the server entry objects.
`buildOpenCodeConfig(entry)` wraps one under the `vision-control` key. The
builders take a token only from the caller; they never embed a secret.

## Troubleshooting

**The `vision-control` server is not listed by OpenCode.** Confirm the server
builds and the binary starts:

```bash
pnpm nx run mcp-server:build
node packages/mcp-server/dist/bin.js   # starts and waits on stdio
```

Then check that the `opencode.json` `mcp` block points at the right command.
Outside the workspace, replace `pnpm exec vision-control-mcp` with the absolute
path to `packages/mcp-server/dist/bin.js`.

**A tool responds "no daemon connected".** The server is running with stub
deps. Set `VC_DAEMON_URL` in the server environment so it reads live data. With
stub deps, every tool still returns a valid MCP response, which is enough to
confirm the tool list.

**MCP HTTP returns `406 Not Acceptable`.** The Streamable HTTP transport needs
the request to advertise `Accept: application/json, text/event-stream`. A bare
`fetch` without that header gets 406. OpenCode's MCP client sets it; a custom
client must too.

**There is no tool that applies a patch.** That is intentional, not a gap. The
server is read-only. Write source through your own file-editing tools and verify
through HMR. See
[docs/agents/mcp-policy.md](../../docs/agents/mcp-policy.md).

**The HTTP endpoint refuses connections from another machine.** Both transports
are loopback-only (ADR-013). The HTTP transport binds to `127.0.0.1` and rejects
non-loopback origins. Reaching it from another host needs a future ADR; there is
no flag or env var that widens the bind today.

For more, see [docs/troubleshooting.md](../../docs/troubleshooting.md).

## Sample agent prompts

The [examples/agent-prompt.md](./examples/agent-prompt.md) file has full,
copy-paste prompts. The short versions:

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
vision_get_diagnostics. If any assertion failed, tell me which DOM property
diverges and do not edit anything else.
```

In every prompt, file changes happen through the agent's own editing tools, not
through an MCP tool. The MCP server reads context and emits coordination
signals. Nothing more.

## Scripts

Run from the repository root:

```bash
pnpm nx run opencode:build        # tsc -p tsconfig.build.json -> dist/
pnpm nx run opencode:typecheck    # tsc --noEmit -p tsconfig.json
pnpm nx run opencode:test         # vitest run
```
