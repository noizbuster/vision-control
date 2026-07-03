# @vision-control/mcp-server

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes Vision Control's visual editing context to coding agents over **stdio**
and **loopback HTTP**. It gives an agent read access to page state, the current
changeset, and verification status — and a small set of coordination signals.
**There is no source-changing tool.** See [docs/agents/mcp-policy.md](../../docs/agents/mcp-policy.md)
and PRD section 17.1.

> Nx tags: `platform:node`, `type:library`, `scope:mcp-server`.

## Build

```bash
pnpm nx run mcp-server:build   # tsc -p tsconfig.build.json -> dist/
```

## Binary (stdio)

The `vision-control-mcp` binary (`src/bin.ts`) serves the server over stdio with
stub deps. An agent (OpenCode, Claude Code, Cursor, generic stdio MCP) spawns it
as a child process and communicates via JSON-RPC over stdin/stdout.

```bash
node packages/mcp-server/dist/bin.js
```

With `VC_DAEMON_URL` set, the server is wired to live daemon data; otherwise
every tool responds with a "no daemon connected" message (still a valid MCP
server for testing the tool list).

## Tools

Seven read-only tools and four coordination signals (none mutate source):

**Read-only**

- `vision_get_active_session` — current session id, workspace, connection state, protocol version.
- `vision_get_selection` — the selected element's identity and summary.
- `vision_get_changeset` — the current changeset with per-operation summaries.
- `vision_get_source_context` — compiled, redacted agent context (JSON or Markdown).
- `vision_get_verification_plan` — the plan/assertions for the current changeset.
- `vision_get_diagnostics` — preview-specificity conflicts and layout warnings.
- `vision_capture_element` — capture an element's source context by selector/id.

**Coordination (signals, not source writes)**

- `vision_request_verification` — ask the runtime to verify the current changeset.
- `vision_clear_preview` — clear all runtime preview mutations.
- `vision_mark_patch_started` / `vision_mark_patch_completed` — record that an
  external patch cycle began/ended (the agent applies the patch through its own
  file-writing mechanism; the MCP server never writes).

Every tool response flows through `@vision-control/security#redactObject` before
it leaves the server — there is no unredacted export path (ADR-009).

## Transports

**stdio** — `startStdioTransport(server)` uses `StdioServerTransport`. The
standard transport for local agent integration.

**Loopback HTTP** — `startHttpTransport(server, opts)` uses
`StreamableHTTPServerTransport` and binds to `127.0.0.1` only (never `0.0.0.0`
or a public interface). Every request passes through `checkAuth` (Bearer token +
origin allowlist) before the transport sees it; unauthenticated requests are
rejected with no context leakage.

A minimal HTTP launcher (since `bin.ts` is stdio-only):

```ts
import { createMcpServer, startHttpTransport } from "@vision-control/mcp-server";
import { createStubDeps } from "@vision-control/mcp-server";

const server = createMcpServer(createStubDeps());
await startHttpTransport(server, {
  port: 4322,
  auth: { token: process.env.VC_MCP_TOKEN ?? "change-me" },
});
```

The CLI and `vision-control doctor` reach the HTTP transport at `VC_MCP_URL`
(e.g. `http://127.0.0.1:4322/mcp`) with `VC_MCP_TOKEN`.

## Config examples

See [docs/mcp-config-examples.md](../../docs/mcp-config-examples.md) for
ready-to-paste `mcpServers` snippets for OpenCode, Claude Code, and a generic
stdio + HTTP setup.

## Public API

The factory `createMcpServer(deps)` returns an unconnected `McpServer`; the
`deps` interface (`McpServerDeps`) is injected so the daemon wires a real
implementation while tests inject a fake. Tool names are exported as
`TOOL_NAMES`. `createStubDeps()` provides a no-daemon implementation.

## Scripts

Run from the repository root:

```bash
pnpm nx run mcp-server:build      # tsc -p tsconfig.build.json -> dist/
pnpm nx run mcp-server:typecheck  # tsc --noEmit -p tsconfig.json
pnpm nx run mcp-server:test       # vitest run
```
