# @vision-control/mcp-server

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes Vision Control's visual editing context to coding agents. One process
serves **stdio** (agent JSON-RPC) plus **loopback discover + WebSocket bridge**
on fixed port **4322** (ADR-020 C2/C3). There is no source-changing tool. See
[docs/agents/mcp-policy.md](../../docs/agents/mcp-policy.md).

> Nx tags: `platform:node`, `type:library`, `scope:mcp-server`.

## Build

```bash
pnpm nx run mcp-server:build   # tsc -p tsconfig.build.json -> dist/
```

## Binary (single process)

The `vision-control-mcp` binary (`src/bin.ts`) starts:

1. **stdio** MCP for the coding agent (stdout reserved for JSON-RPC)
2. **`GET http://127.0.0.1:4322/discover`** — secret-free auto-detect
3. **`ws://127.0.0.1:4322/bridge`** — extension pair + bridge (pair token)

```bash
node packages/mcp-server/dist/bin.js
```

No `VC_DAEMON_URL` and no daemon process are required. Live data arrives when
the extension pairs over the bridge (projection cache; ADR-020).

### Pair token (stderr only)

On start the process prints the extension pair token **once on stderr**. Never
on stdout (would corrupt agent JSON-RPC). Never in the `/discover` body.

Discover JSON shape (no token field):

```json
{
  "host": "127.0.0.1",
  "port": 4322,
  "wsPath": "/bridge",
  "pairTokenRequired": true,
  "protocolVersion": "2.0.0"
}
```

Port **4322** is fixed. If busy, the process fails with a clear error (no
multi-port scan). Bind is loopback only (`127.0.0.1` / `::1` / `localhost`).

Agent Bearer (`VC_MCP_TOKEN` for optional HTTP MCP transport) is a **separate**
secret from the extension pair token.

## Tools

Nine tools (ADR-020 C5): five read/projection + four coordination signals.
None mutate source. Dropped from the product list: `vision_capture_element`,
`vision_get_diagnostics` (absent from `TOOL_NAMES`, not empty stubs).

Every tool response is redacted before it leaves the server (ADR-009). Tools
read from the extension projection cache when paired; unpaired returns
`not_paired` / empty and never a stale verification pass.

## Transports

**stdio** — `startStdioTransport(server)` for local agent integration.

**Bridge** — `startBridgeServer` / `startMcpProcess`: discover + WS on 4322.

**Loopback HTTP MCP** — `startHttpTransport(server, opts)` remains available for
CLI/tooling with Bearer auth; product path for agents is stdio + bridge.

## Public API

- `createMcpServer(deps)` — unconnected `McpServer` with tools registered
- `startMcpProcess` / `startBridgeServer` — single-process bridge foundation
- `createStubDeps()` — unpaired empty projection
- `TOOL_NAMES`, discover/pair helpers from `./bridge`

## Scripts

```bash
pnpm nx run mcp-server:build
pnpm nx run mcp-server:typecheck
pnpm nx run mcp-server:test
```
