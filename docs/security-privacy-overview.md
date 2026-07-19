# Security and Privacy Overview

A plain-language summary of how Vision Control protects your workspace and your
data. This is the user-facing overview; the full engineering contract lives in
[docs/agents/security-privacy.md](./agents/security-privacy.md) and the
referenced ADRs.

---

## The core guarantee

Visual edits you make in the panel are **previews, not source changes**. They
live in a reversible preview layer until you (or a coding agent) apply a real
patch to your source files. Vision Control itself never writes your source. The
runtime preview is always clearable with one action.

---

## Loopback bridge only

There is no daemon product path. When an agent connection is needed, one MCP
process serves agent stdio plus discovery and the extension bridge at
`127.0.0.1:4322`. Non-loopback bridge configuration is refused.

- The extension background service worker pairs with the bridge. The content
  script never opens the MCP socket.
- `GET http://127.0.0.1:4322/discover` contains no secret. The bridge shares the
  fixed port with that endpoint and does not use a multi-port scan.
- Optional HTTP MCP uses a separate Agent Bearer token. It does not make MCP a
  source of truth or a source-writing service.

A diagram of the trust boundary:

```
[ inspected page ]  --X-->  MCP bridge socket
[ extension background ] --ok--> MCP bridge (paired on 127.0.0.1:4322)
[ agent ] --ok--> MCP server (stdio or optional HTTP MCP)
```

---

## Authentication

The extension pair token is distinct from the optional HTTP MCP Agent Bearer
token (`VC_MCP_TOKEN`). The MCP process prints the pair token once on stderr,
never on stdout or in `/discover`. The token is valid for five minutes and is
not stored long-term by the extension.

The optional HTTP MCP transport requires its Bearer token on every request.

---

## No secrets in exports

Before panel context export or MCP projection data leaves the extension/MCP
boundary, the **redaction layer** strips sensitive material:

- Cookies and authentication headers.
- Form values (passwords, credit cards, hidden auth tokens).
- Secrets in text (API keys, bearer tokens, private keys — matched by known
  shapes like `sk_live_…`, `ghp_…`, `AKIA…`, plus a high-entropy catch-all).
- Sensitive object keys (`password`, `token`, `apiKey`, `cookie`,
  `authorization`, …) mask their whole value.
- Screenshots are deferred entirely in the MVP.

A **privacy report** travels with each context export: it counts how many items
were redacted and by which rule, without ever revealing the values.

The redaction layer cannot be disabled through the MCP server. There is no
unredacted export path.

---

## Origins and source context

Best-effort origins come from CSSOM and source maps. They may be empty. HIGH
confidence requires both a map and a range. Marker-derived HIGH confidence and a
workspace-index source-resolution path are not product behavior (ADR-019).

Runtime preview remains separate from source. An agent or human applies the
source patch with its own file tools, then a content-script verification checks
the real DOM after the preview is cleared.

---

## Read-only MCP

The MCP server exposes **read-only tools** plus a few coordination signals
(request verification, clear preview, mark patch started/completed). There is no
tool that writes source, and there will not be one in the MVP.

This keeps the preview-to-source distinction meaningful: the agent reads context
through MCP, writes source through its own file-writing mechanism, and verifies
through HMR. The MCP server never applies a patch. See
[mcp-policy.md](./agents/mcp-policy.md).

---

## Product boundary

The extension owns selection, preview, and journal state. The MCP process keeps
only a paired projection cache and coordination queue. The supported product
startup is `vision-control mcp`; package-level legacy exports do not establish a
daemon-backed product path.

---

## References

- Engineering contract: [docs/agents/security-privacy.md](./agents/security-privacy.md).
- ADR-019 extension source of truth, ADR-020 MCP bridge projection, ADR-009
  privacy redaction, and ADR-010 read-only MCP.
- If something behaves unexpectedly, see [troubleshooting.md](./troubleshooting.md).
