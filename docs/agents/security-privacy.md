# Security and Privacy Contract

This guide defines the security and privacy rules for the current Vision Control
product path. It covers extension-owned state, the optional MCP bridge, source
context, and redaction.

Related: [ADR-019](../adr/ADR-019-extension-source-of-truth.md),
[ADR-020](../adr/ADR-020-mcp-bridge-projection.md),
[ADR-009](../adr/ADR-009-privacy-redaction.md),
[ADR-011](../adr/ADR-011-v1-screenshot-crops.md),
[ADR-013](../adr/ADR-013-mcp-loopback-http-policy.md), and
[mcp-policy.md](./mcp-policy.md).

---

## Optional loopback MCP bridge

The extension is the source of truth. There is no daemon product path. When a
user starts `vision-control mcp`, one MCP process serves agent stdio, secret-free
discovery, and the extension bridge at exact `127.0.0.1:4322`.

- **Bind**: bridge discovery and WebSocket pairing accept only `127.0.0.1`.
  Non-loopback configuration and multi-port scan are not product paths.
- **Pairing**: the extension background service worker, not the content script,
  opens the bridge socket. The pair token prints once on stderr and is never sent
  on stdout or in `/discover`.
- **Separate credentials**: the extension pair token and optional HTTP MCP Agent
  Bearer token (`VC_MCP_TOKEN`) are separate secrets.
- **Projection only**: MCP receives extension snapshots and coordination commands.
  It does not own selection or journal state, write source, or mutate the journal.

---

## Source context and confidence

Origins are best-effort CSSOM and source-map data. They may be absent. HIGH
confidence requires both a map and a range. Marker-derived HIGH confidence,
workspace index, and component-props AST are not product paths.

Runtime preview does not prove a source change. Agents and humans write source
with their own file tools. Content-owned verification clears preview, then checks
the real DOM after HMR.

---

## Redaction policy

The redaction layer applies deny-by-default filtering before context export or
MCP projection data leaves the product boundary. See ADR-009.

Redacted categories:

- Cookies and authentication headers
- Form values (passwords, credit cards, hidden auth tokens)
- Secrets in text (API keys, bearer tokens, private keys)
- Network request and response bodies
- Screenshots (deferred entirely in the MVP)

Context exports include a redaction report that lists how many items were
redacted and by which rule, without revealing the values.

Rules for agents:

- Do not attempt to bypass redaction. If context is missing, the redaction policy
  excluded it for a reason.
- Do not log redacted values. If you encounter a value that looks like a secret,
  do not echo it into evidence files or commit messages.

---

## Screenshots (V1)

V1 adds element screenshot crops (PRD section 7.2, line 296). Screenshots are an
image privacy surface that the text redaction layer cannot fully reach, so the
policy is strict (ADR-011):

- **Opt-in only.** No crop is captured unless explicitly requested. Crops are
  excluded from every default context export and every share bundle. A context
  export carries a crop reference only when the caller opts in.
- **Masked and redacted.** Before capture, `[data-private]` regions, credential
  inputs (password, credit card), and hidden auth tokens are masked. The crop is
  re-checked after capture so an overlay or late-rendered value cannot leak.
- **Local storage, short retention.** Crops are written to local artifact
  storage only, with a content hash and path, and a bounded default retention.
  They are never uploaded or relayed.
- **Metadata-only in context.** Context and MCP responses carry a crop as a
  reference plus a redaction report, never as an unredacted image blob.

No screenshot payload may contain passwords, cookies, auth headers, hidden auth
tokens, private keys, bearer tokens, unrelated DOM, or network bodies.

---

## Share bundles (V2)

V2 collaboration defaults to local export/import share bundles (PRD section 7.3,
line 308; ADR-015):

- **Local export/import.** A bundle is a redacted, signed artifact (ChangeSet +
  context, screenshot metadata only when explicitly included and redacted). It
  carries a signature/hash and an audit log. Import reconstructs operations and
  source candidates without secrets.
- **Token-free.** No raw MCP, pair, or session token enters a bundle. A tamper
  or unknown-hash bundle is rejected on import.
- **No network relay.** The default path has no relay, cloud sync, or remote
  session. Remote real-time collaboration is deferred until a separate
  trust-model ADR approves identity, revocation, and encryption.

No share bundle payload may bypass redaction or carry credentials, auth tokens,
or network bodies.

---

## Audit logging

Product logs record security-relevant events:

- Connection attempts (accepted or rejected, with origin)
- Authentication failures (token mismatch, origin mismatch)
- Context exports (with redaction counts)
- Source access (which files were read for resolution)

Logs do not contain redacted values. They contain counts and categories only.

---

## What agents must not do

- **Do not create a daemon-backed product path.** Editing must remain extension
  owned and agent-disconnected capable.
- **Do not bind MCP outside `127.0.0.1`.** Discovery and bridge pairing are
  loopback-only.
- **Do not add a tool that writes source through MCP.** The MCP server is
  read-only. See [mcp-policy.md](./mcp-policy.md).
- **Do not treat marker data as HIGH confidence.** HIGH requires map plus range.
- **Do not disable the redaction layer.** If a test needs unredacted data, use a
  test fixture, not the production redaction bypass.
- **Do not log secrets.** Check evidence files and commit messages for accidental
  credential inclusion.
- **Do not require `chrome.debugger`.** The extension works without it for the
  MVP. It is optional.
