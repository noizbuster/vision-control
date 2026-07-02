# @vision-control/daemon

Authenticated loopback daemon for Vision Control. A Node binary that binds to
`127.0.0.1`, mints a one-time pairing token, and accepts a single authenticated
WebSocket session per connection for protocol negotiation, source/context reads,
and changeset persistence.

> Nx tags: platform:node, type:app, scope:daemon.

## Run

```bash
pnpm nx run daemon:dev -- --help     # print help, exit 0, never binds
pnpm nx run daemon:dev               # build + run against the discovered workspace
```

## CLI

```
--host <host>        Loopback only: 127.0.0.1, ::1, localhost. Default 127.0.0.1.
                     Non-loopback hosts (incl. 0.0.0.0) are refused.
--port <port>        Bind port. 0 = ephemeral. Default 0.
--workspace <path>   Workspace root containing vision-control.config.ts.
--db <path>          SQLite path. Default <workspace>/.vision-control/daemon.db.
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
