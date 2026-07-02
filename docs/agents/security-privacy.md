# Security and Privacy Contract

This guide defines the security and privacy rules for the Vision Control MVP. It
covers the loopback daemon, source path handling, redaction, and audit logging.

Related: [ADR-007](../adr/ADR-007-loopback-daemon.md),
[ADR-008](../adr/ADR-008-dev-only-source-markers.md),
[ADR-009](../adr/ADR-009-privacy-redaction.md).

---

## Loopback daemon

The daemon binds to loopback only (`127.0.0.1`). It is never reachable from the
network.

- **Bind**: loopback. The daemon refuses connections from non-loopback
  interfaces.
- **Session token**: a random secret generated per daemon start. Every request
  from the extension must carry it.
- **Origin allowlist**: the daemon accepts requests only from the extension's
  origin. Unknown origins are rejected before any logic runs.

A web page loaded in the browser cannot talk to the daemon even if it guesses the
port, because the origin check fails first. Another local process cannot talk to
the daemon without the session token.

The daemon and the MCP server are separate processes on separate transports. The
daemon serves the extension. The MCP server serves agent tooling over stdio. They
do not share an auth domain.

---

## Source path handling

Source markers are dev-only and opaque. This is a hard rule. See ADR-008.

- **No absolute paths in the DOM.** The marker attribute (`data-vc-source`)
  carries an opaque token, not a filesystem path. The daemon resolves the token
  to a source location at runtime.
- **No production injection.** The marker transform runs only in dev mode.
  Production builds skip it entirely. There is no flag to enable it in
  production.
- **No source mutation by markers.** Markers are injected into the rendered DOM
  at build time. They never modify source files.

If you add a build integration, the marker transform must be gated behind a dev
check. Never inject markers into a production bundle.

---

## Redaction policy

The context compiler applies deny-by-default redaction before any data leaves the
daemon. See ADR-009.

Redacted categories:

- Cookies and authentication headers
- Form values (passwords, credit cards, hidden auth tokens)
- Secrets in text (API keys, bearer tokens, private keys)
- Network request and response bodies
- Screenshots (deferred entirely in the MVP)

The daemon produces a redaction report with each context export. The report lists
how many items were redacted and by which rule, without revealing the values.

Rules for agents:

- Do not attempt to bypass redaction. If context is missing, the redaction policy
  excluded it for a reason.
- Do not log redacted values. If you encounter a value that looks like a secret,
  do not echo it into evidence files or commit messages.

---

## Audit logging

The daemon writes structured logs for security-relevant events:

- Connection attempts (accepted or rejected, with origin)
- Authentication failures (token mismatch, origin mismatch)
- Context exports (with redaction counts)
- Source access (which files were read for resolution)

Logs do not contain redacted values. They contain counts and categories only.

---

## What agents must not do

- **Do not add a network listener to the daemon.** Loopback only.
- **Do not add a tool that writes source through MCP.** The MCP server is
  read-only. See [mcp-policy.md](./mcp-policy.md).
- **Do not inject source markers into production builds.** Dev only, opaque
  tokens only.
- **Do not disable the redaction layer.** If a test needs unredacted data, use a
  test fixture, not the production redaction bypass.
- **Do not log secrets.** Check evidence files and commit messages for accidental
  credential inclusion.
- **Do not require `chrome.debugger`.** The extension works without it for the
  MVP. It is optional.
