# ADR-019: Extension as source of truth

## Status

Accepted (2026-07-15). Supersedes the daemon-as-source-of-truth and
daemon-as-extension-backend claims in
[ADR-007](./ADR-007-loopback-daemon.md) and the SoT clause in
[ADR-010](./ADR-010-readonly-mcp.md). Companion:
[ADR-020](./ADR-020-mcp-bridge-projection.md) (optional single-process MCP
bridge). Product CLI codemod and share paths from
[ADR-014](./ADR-014-codemod-outside-mcp.md) and
[ADR-015](./ADR-015-share-bundles-collaboration-trust.md) are superseded for the
CLI surface; panel export and agent file tools remain.

## Context

v0.2.0 centered the product on an always-on loopback daemon. The daemon held
session state, workspace index, source resolution, and context compilation. The
extension was a client. The MCP server was a read view over daemon state
(ADR-007, ADR-010).

That model failed product honesty. Framework and monorepo diversity made
reliable workspace source linking a liability. Marker HIGH paths, component-props
AST, and workspace bind forced a Node backend for ordinary visual editing. Users
could not edit offline. Dual caches (daemon vs extension) invited dual SoT bugs.

The pivot: the browser extension alone owns visual editing, undo history,
context export, and best-effort map origins. No always-on backend is required for
the edit loop. An optional MCP process bridges a coding agent when the user wants
one. Workspace index, marker HIGH product path, and component-props AST leave the
product path.

This ADR locks extension ownership of truth (contracts C1, C4, C6, C7, C8).
ADR-020 locks the optional MCP bridge (C2, C3, C5) and restates loopback-only
rules moved out of ADR-007's backend claims.

### Regression ledger (v0.2.0 → this pivot)

| Feature (v0.2.0) | Disposition | Replacement |
|---|---|---|
| Always-on daemon backend | Drop | Extension SoT; optional single-process MCP bridge |
| Workspace index / workspace bind | Drop | No product path |
| Marker HIGH product path | Drop | Marker integrations delete if unused after unwire |
| Component-props AST | Drop | No replacement |
| CSS Modules / Tailwind / Vue / Svelte workspace adapters | Drop workspace path | CSSOM + maps only |
| CLI context/changes/verify/preview/status/sessions/doctor | Drop | Panel export + MCP tools |
| CLI codemod (ADR-014) | Drop product CLI | Agent file tools |
| CLI share (ADR-015) | Drop product CLI | Panel export |
| Panel edit/preview/journal | Keep | Background session journal |
| MCP tools | Replace | Slim set (ADR-020 / C5) |
| HMR verification | Keep / rehome | Content-owned verify; MCP projects result |
| Context export | Keep / rehome | Panel + MCP `vision_get_source_context` |

## Decision

### Extension is the source of truth

The Chromium extension owns editing state for each tab:

- Selection, preview mutations, and the change journal live in the extension.
- Context snapshots compile from extension data (selection, changeset/IR, journal
  summary, map origins, confidence, redaction report). Origins may be empty.
- Editing works while agent-disconnected. Pairing is optional.
- There is no product path that requires an always-on daemon or workspace bind.

### C1 - Journal SoT ownership

- The background service worker is the **sole writer** to
  `chrome.storage.session` key `journal:v1:${tabId}`.
- Panel and content send mutations via bus messages. They must not dual-write
  storage.
- On panel open, content init, and service-worker wake: rehydrate from
  background.
- On `tabs.onRemoved`: delete that key.
- Storage backend: **session only** (not `chrome.storage.local`).

Offline survival:

| Event | Survive? |
|---|---|
| Panel close/reopen | Yes |
| MV3 service-worker kill | Yes |
| Tab reload | Yes (same `tabId`) |
| Browser restart | No |
| Tab closed | Gone for that tab |

### C4 - Map fetch context + caps

- Map resolution runs in the **content script** (page network, CORS, CSP).
- Background must not fetch arbitrary third-party map URLs without an existing
  Site Access grant.
- No new mandatory host permissions. `chrome.debugger` stays optional, never
  required.
- Caps per selection compile: max 20 maps, max 1 MiB per map, max 2 MiB total,
  500 ms per fetch, 2 s wall clock. On exceed, skip the remainder and set
  `originsTruncated: true` on the snapshot.
- HIGH confidence requires map + range. No DOM→JSX HIGH without map+range. No
  marker HIGH product path.

### C6 - Verification runtime home

- Verification runs in the **content script** (real DOM) after clear preview.
- Background routes commands. Results flow to the MCP projection cache as
  `{ tabId, sessionId, ts, passed, details }` when paired.
- Unpaired: the panel can run local verify. MCP tools return `not_paired` /
  error. They must **never** return a stale `passed: true`.
- Active MCP session = last focused paired `tabId`. Multi-tab offline journals
  stay independent.

### C8 - Service-worker reconnect

- Add the `alarms` permission only if used for reconnect wake.
- On SW wake: rehydrate journals; attempt WebSocket reconnect to the stored
  endpoint only if an in-memory pair token is still valid; otherwise the UI
  shows re-pair required.
- Heartbeat max gap 15 s without `session.heartbeat` → MCP marks disconnected;
  tools return `not_paired`.

### C7 - Pre-seeded keep / delete inventory

| Package / app | Disposition |
|---|---|
| `apps/extension` | Keep |
| `apps/daemon` | Delete |
| `packages/daemon-core` | Delete after unwire |
| `packages/daemon-client` | Delete or replace with `bridge-client`; no daemon product path |
| `packages/storage` | Delete if only daemon used |
| `packages/workspace-index` | Delete |
| `packages/source-resolver` | Delete product path if only node/workspace |
| `packages/source-registry` | Delete if unused after marker drop |
| `packages/mcp-server` | Keep (becomes bridge) |
| `packages/cli` | Keep (MCP launcher only) |
| `packages/context-compiler` | Keep (no runtime node deps) |
| `packages/protocol` | Keep |
| `packages/security` | Keep |
| `packages/verification-engine` | Keep |
| `packages/change-ir`, `change-journal`, `preview-engine`, `editor-core`, `inspector-core`, `overlay-ui`, `layout-engine`, `interaction-machine`, `element-identity`, `geometry`, `shared-ui`, `logger`, `testing` | Keep (trim daemon helpers in testing) |
| `packages/map-origins` (new) | Keep (create) |
| `integrations/vite-react`, `next-react` marker plugins | Delete if unused after unwire |
| `integrations/tailwind`, `css-modules`, `vanilla-css`, `vue`, `svelte` | Delete if only workspace/daemon adapters remain |
| `integrations/opencode`, `pi` | Keep; rewrite config (no `VC_DAEMON_URL` required) |
| `apps/playground-*`, `visual-regression-lab` | Keep as fixtures |

Hard-delete work may only remove rows marked Delete (or refined in a later
inventory file that does not reclassify Keep→Delete without plan amendment).

### What this ADR does not decide

- MCP process shape, pair bootstrap, and slim tool names: [ADR-020](./ADR-020-mcp-bridge-projection.md).
- Read-only MCP (no source mutation): still [ADR-010](./ADR-010-readonly-mcp.md).
- Loopback-only bind and no non-loopback expansion: restated in ADR-020;
  historical loopback intent in ADR-007 remains valid as security posture, not
  as daemon-as-backend product path.

## Consequences

- Ordinary visual editing needs only the extension. No Node process for select,
  preview, undo/redo, or panel context export.
- Agents resolve source files themselves from map `sourceUrl` / relative paths.
  There is no workspace root in the product path.
- Later todos unwire then hard-delete daemon and workspace packages per C7.
  This ADR does not delete code; it sets the contract.
- Docs and agent briefs must stop calling the daemon the source of truth.
- Preview remains not a source change. Agents still write source through their
  own file tools and verify after HMR.

## MVP Guardrail

This ADR protects the product from dual SoT, always-on daemon dependency, and
workspace-index liability. It enforces:

- Extension owns journal and edit state (C1).
- No dual-write of journal storage.
- No always-on daemon as the product path for editing.
- No workspace bind required for the edit loop.
- No marker HIGH or component-props AST product path.
- Verification never reports stale pass when unpaired (C6).
- Map caps and never-wrong-HIGH (C4).

It deliberately excludes remote collaboration, non-loopback MCP, and
source-mutating MCP tools (those stay under ADR-010, ADR-013, ADR-018, and
ADR-020).
