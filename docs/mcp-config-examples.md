# MCP Server Configuration Examples

Ready-to-paste snippets for connecting an MCP-compatible agent to the Vision
Control MCP server. The server is read-only and exposes 11 tools — see
[packages/mcp-server/README.md](../packages/mcp-server/README.md) for the full
list and [docs/agents/mcp-policy.md](./agents/mcp-policy.md) for the read-only
policy.

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

To wire live daemon data, set `VC_DAEMON_URL` in the server's environment. With
no env, the server still starts and responds with "no daemon connected" — useful
for verifying the tool list.

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
      "args": ["exec", "vision-control-mcp"],
      "env": {
        "VC_DAEMON_URL": "http://127.0.0.1:4321"
      }
    }
  }
}
```

After saving, restart Claude Code and the `vision_*` tools become available. Ask
Claude to call `vision_get_active_session` to confirm the connection.

---

## Generic stdio transport

Any MCP client that can spawn a stdio server:

```
command: pnpm
args:    ["exec", "vision-control-mcp"]
env:     { "VC_DAEMON_URL": "http://127.0.0.1:4321" }
```

Or, with Node directly and an absolute path:

```
command: node
args:    ["/abs/path/to/vision-control/packages/mcp-server/dist/bin.js"]
env:     { "VC_DAEMON_URL": "http://127.0.0.1:4321" }
```

---

## Loopback HTTP transport

The HTTP transport is a library API, not a standalone binary. Use a small
launcher script when you need an HTTP endpoint (the CLI and `vision-control
doctor` consume it via `VC_MCP_URL`):

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

Run it, then point a client at `http://127.0.0.1:4322/mcp` with an
`Authorization: Bearer <token>` header. The transport binds to `127.0.0.1` only
and rejects requests whose origin is not on the allowlist.

For an agent that supports URL/streamable-HTTP MCP servers, configure the
endpoint directly (OpenCode example):

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

## Verifying the connection

Once configured, the agent should be able to list tools and call
`vision_get_active_session`:

```bash
# From the workspace root, after building:
VC_MCP_URL=http://127.0.0.1:4322/mcp VC_MCP_TOKEN=change-me \
  node packages/cli/dist/bin.js doctor
```

The `doctor` command checks both the daemon (`VC_DAEMON_URL`) and the MCP server
(`VC_MCP_URL`) reachability. See [packages/cli/README.md](../packages/cli/README.md).

---

## Troubleshooting

If the agent cannot connect, see [troubleshooting.md](./troubleshooting.md):
"MCP server not listed", "connection refused", and "origin rejected" cover the
common cases.
