# @vision-control/daemon

Authenticated loopback daemon for Vision Control. A Node binary that binds to
`127.0.0.1`, mints a one-time pairing token, and accepts a single authenticated
WebSocket session per connection for protocol negotiation, source/context reads,
and changeset persistence.

> Nx tags: platform:node, type:app, scope:daemon.

## Run

The daemon is a long-running loopback process. Start it either through the CLI
(recommended — it resolves and spawns the binary with inherited stdio) or
directly via Nx:

```bash
vision-control daemon                 # via the CLI binary (packages/cli)
pnpm nx run daemon:dev -- --help      # print help, exit 0, never binds
pnpm nx run daemon:dev                # build + run against the discovered workspace
```

On a successful start the daemon prints one JSON line to stdout:

```
{"event":"ready","port":4321,"host":"127.0.0.1","pairingUrl":"vision-control://pair?token=...","pairingHttpUrl":"http://127.0.0.1:4321/pair?token=...&port=4321&host=127.0.0.1","sessionId":"..."}
```

The raw pairing token is shown exactly once; only its SHA-256 hash is persisted.
Default TTL is about 5 minutes. The token stays valid until expiry or revoke
(not single-use for reconnect). `GET /pair` does not consume it.

**Pairing paths**

1. **Auto-open (opt-in)**. The daemon opens `pairingHttpUrl` in your default
   browser only when bound to exact `127.0.0.1` and either `--open` is set or
   `VC_OPEN_PAIRING=1` (root monorepo `pnpm dev` sets this). That is a loopback
   HTML landing page at `/pair`. With the Chromium Vision Control extension
   loaded, the content script can auto-pair. Other browsers only show paste
   instructions. Interactive TTY alone does not open a browser.
2. **Paste into the panel**. Paste `pairingUrl` (`vision-control://pair?...`)
   into the DevTools panel connect field. The custom scheme has no browser or OS
   protocol handler; do not put it in an address bar.
3. **Manual HTTP**. Open `pairingHttpUrl` yourself if auto-open was skipped
   (default, `--no-open`, or bind host is not exact `127.0.0.1`).

The pairing secret is in the HTTP query string, so it can remain in browser
history. Prefer a private window when that matters. The page sends
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

## CLI

```
--host <host>        Loopback only: 127.0.0.1, ::1, localhost. Default 127.0.0.1.
                     Non-loopback hosts (incl. 0.0.0.0) are refused.
--port <port>        Bind port. 0 = ephemeral. Default 0.
--workspace <path>   Workspace root containing vision-control.config.ts.
--db <path>          SQLite path. Default <workspace>/.vision-control/daemon.db.
--open               Force open the local /pair page after ready. Still requires
                     bind host 127.0.0.1.
--no-open            Never open a browser after ready. Wins over --open and
                     VC_OPEN_PAIRING. Default: do not open. Open only with --open
                     or VC_OPEN_PAIRING=1 (root pnpm dev), and only on 127.0.0.1
                     (::1/localhost never auto-open).
--help               Print help and exit without binding.
```

## Config (`vision-control.config.ts`)

Optional TypeScript file at the workspace root. Validated by Zod with defaults
applied for missing fields. Loaded via a dynamic `import()` (Node 22+ native type
stripping; a sibling `.js` file is the fallback).

```ts
export default {
  workspace: { root: "/abs/path/to/workspace" },
  daemon: { port: 0, host: "127.0.0.1" },          // optional overrides
  origins: ["http://localhost:5173"],              // additive to the loopback default
  logging: { level: "info" },                      // "debug" | "info" | "warn" | "error"
};
```

## Security

- Loopback-only bind (PRD §27.1); non-loopback hosts are rejected before listen.
- Every WebSocket upgrade presents a valid pairing token (SHA-256 hash lookup);
  missing/wrong/expired → `UNAUTHORIZED`.
- Origin allowlist enforced on upgrade; disallowed → `ORIGIN_NOT_ALLOWED`.
- Source/context reads require a workspace-bound session (`WORKSPACE_NOT_BOUND`).
- Audit events recorded via `@vision-control/storage#AuditRepository`; logs flow
  through `@vision-control/logger#RedactingLogger`.

## Scripts

Run from the repository root:

```bash
pnpm nx run daemon:build        # tsc -p tsconfig.build.json -> dist/
pnpm nx run daemon:typecheck    # tsc --noEmit -p tsconfig.json
pnpm nx run daemon:test         # vitest run (depends on build; spawns the real binary)
```
