# MCP Server Configuration Examples

Ready-to-paste snippets for connecting an MCP-compatible agent to the Vision
Control MCP bridge. The server is read-only and exposes **nine** tools (ADR-020
C5). See [packages/mcp-server/README.md](../packages/mcp-server/README.md) for
the process shape and [docs/agents/mcp-policy.md](./agents/mcp-policy.md) for the
read-only policy.

The extension is the source of truth. MCP is optional. You do **not** set
`VC_DAEMON_URL`. Live data arrives when the extension pairs over the loopback
bridge on port **4322**.

Before any of these work, build the server once:

```bash
pnpm nx run mcp-server:build   # emits packages/mcp-server/dist/bin.js
```

The examples below assume you run them from the Vision Control workspace root,
so `pnpm exec vision-control-mcp` resolves the built binary. For an agent that
runs outside the workspace, replace the `pnpm exec ...` command with the
absolute path to the built binary:

```
node /absolute/path/to/vision-control/packages/mcp-server/dist/bin.js
```

You can also launch via the product CLI:

```bash
pnpm nx run cli:build
vision-control mcp
```

On start, the process prints the extension pair token **once on stderr**. Pair
the DevTools panel (paste token, or auto-detect `http://127.0.0.1:4322/discover`
then paste). Stdout stays reserved for agent JSON-RPC.

---

## OpenCode (stdio)

Add a `mcp` entry to your `opencode.json` (project or user config):

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
/ empty responses. That is enough to confirm the tool list. After pair, tools
read the extension projection cache.

---

## Claude Code (stdio)

Claude Code reads MCP servers from a `.mcp.json` at the project root, or from
the desktop config (`claude_desktop_config.json`). Both use the `mcpServers`
shape:

```json
{
  "mcpServers": {
    "vision-control": {
      "command": "pnpm",
      "args": ["exec", "vision-control-mcp"]
    }
  }
}
```

After saving, restart Claude Code and the `vision_*` tools become available. Ask
Claude to call `vision_get_active_session` to confirm the connection (expect
`not_paired` until the panel is paired).

---

## Generic stdio transport

Any MCP client that can spawn a stdio server:

```
command: pnpm
args:    ["exec", "vision-control-mcp"]
```

Or, with Node directly and an absolute path:

```
command: node
args:    ["/abs/path/to/vision-control/packages/mcp-server/dist/bin.js"]
```

---

## Loopback HTTP transport (optional)

Product path for agents is **stdio + bridge**. Loopback Streamable-HTTP MCP
remains available for tooling that needs a URL endpoint. It binds to `127.0.0.1`
only and expects a Bearer token (`VC_MCP_TOKEN`). That token is **not** the
extension pair token.

```ts
// vision-control-mcp-http.ts
import { createMcpServer, createStubDeps, startHttpTransport } from "@vision-control/mcp-server";

const port = Number(process.env.VC_MCP_PORT ?? 4322);
const server = createMcpServer(createStubDeps());
await startHttpTransport(server, {
  port,
  auth: { token: process.env.VC_MCP_TOKEN ?? "change-me" },
});
console.log(`MCP HTTP listening on http://127.0.0.1:${port}/mcp`);
```

Note: the product binary already uses fixed port **4322** for discover + bridge.
Do not run a second process on the same port. Prefer stdio for agents.

For an agent that supports URL/streamable-HTTP MCP servers:

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

---

## Discover (extension auto-detect)

Secret-free probe (no token field):

```bash
curl -s http://127.0.0.1:4322/discover
```

Example shape:

```json
{
  "host": "127.0.0.1",
  "port": 4322,
  "wsPath": "/bridge",
  "pairTokenRequired": true,
  "protocolVersion": "2.0.0"
}
```

---

## Verifying the connection

1. Start `vision-control mcp` (or the stdio binary via your agent).
2. Read the pair token from **stderr**.
3. In the Vision Control panel, connect (paste token / auto-detect).
4. Ask the agent to call `vision_get_active_session`.

When paired, session tools return live projection data. When unpaired, they
return `not_paired` / empty, never a stale verification pass.

---

## Troubleshooting

If the agent cannot connect, see [troubleshooting.md](./troubleshooting.md):
"MCP server not listed", "port 4322 busy", "not_paired", and "origin rejected"
cover the common cases.
