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

## Loopback only

The daemon binds to `127.0.0.1` (and IPv6 `::1`). It is never reachable from the
network. Non-loopback bind addresses are refused before the server starts.

- No web page can talk to the daemon. Even if a page guesses the port, the
  **origin allowlist** rejects it before any logic runs. The default allowlist is
  loopback origins plus the extension's own origin.
- The MCP HTTP transport (when used) also binds to loopback only.

A diagram of the trust boundary:

```
[ web page ]  --X-->  daemon (127.0.0.1)   origin rejected
[ extension ] --ok--> daemon               pairing token + allowed origin
[ agent ]     --ok--> MCP server (stdio / 127.0.0.1)   token-gated
```

---

## Authentication

Every connection to the daemon carries a **pairing token**:

- A random 32-byte secret generated when the daemon starts.
- Stored only as a **SHA-256 hash** — the raw token is shown once in the ready
  line and never persisted.
- Validated with a constant-time comparison to prevent timing side-channels.
- Required on every WebSocket upgrade; missing/wrong/expired returns
  `UNAUTHORIZED`.

The MCP HTTP transport (when used) requires a Bearer token on every request.
Unauthenticated requests are rejected before the transport sees them, so no
context is leaked.

---

## No secrets in exports

Before any data leaves the daemon, the **redaction layer** strips sensitive
material:

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

## Source paths stay opaque

The build injects a `data-vc-source` marker into the rendered DOM in **dev mode
only** so the panel can map an element back to its source location. The marker
is an **opaque token**, never a filesystem path. The daemon resolves the token
to a location at runtime.

- **Dev only.** Production builds skip the marker transform entirely. There is no
  flag to enable it in production (ADR-008).
- **No filesystem paths in the DOM.** Absolute paths are rejected at the storage
  boundary; only workspace-relative paths cross trust boundaries.
- **Markers never modify source files.** They are injected into rendered output
  at build time.

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

## Audit logging

The daemon writes structured logs for security-relevant events: connection
attempts (accepted/rejected, with origin), authentication failures, context
exports (with redaction counts), and source access. Logs contain counts and
categories, never redacted values. All logs flow through a `RedactingLogger`.

---

## What you control

- **Origins**: add dev-server origins via `origins` in
  `vision-control.config.ts`. Unknown origins are rejected.
- **Port**: run the daemon on a fixed loopback port with `--port`, or let it pick
  an ephemeral one (the default).
- **Token lifetime**: tokens are valid until expiry or revoke. Restart the daemon
  to mint a fresh one.

---

## References

- Engineering contract: [docs/agents/security-privacy.md](./agents/security-privacy.md).
- ADR-007 loopback daemon, ADR-008 dev-only source markers, ADR-009 privacy
  redaction, ADR-010 read-only MCP.
- If something behaves unexpectedly, see [troubleshooting.md](./troubleshooting.md).
