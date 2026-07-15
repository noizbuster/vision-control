# Troubleshooting

Common issues and how to resolve them. Run `vision-control doctor` first — it
reports the state of the workspace gates and runtime services in one pass (see
[packages/cli/README.md](../packages/cli/README.md)).

---

## Setup and build

### `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`

A dependency with a postinstall script (e.g. `better-sqlite3`, `esbuild`) was
blocked by pnpm 11's default build-deny. The workspace allowlist lives in
`pnpm-workspace.yaml` under `allowBuilds`. Add the package there and re-run
`pnpm install`. Native modules (`better-sqlite3`) need a working C++ toolchain.

### `pnpm install` fails with a release-age / `minimumReleaseAge` error

pnpm 11 enforces a ~24h supply-chain policy. The workspace sets
`minimumReleaseAge: 0` to disable it. If it resurfaces after a config change,
confirm that key is present in `pnpm-workspace.yaml`, then re-run
`pnpm install --frozen-lockfile`.

### `corepack enable` errors or `pnpm` is the wrong version

Node 26 does not ship Corepack. Install it explicitly:

```bash
npm i -g corepack
corepack enable
corepack prepare pnpm@11.9.0 --activate
```

`pnpm --version` should print `11.9.0` (the version pinned in
`package.json#packageManager`).

### `pnpm typecheck` / `pnpm test` / `pnpm build` fails

Each package has its own `typecheck`, `test`, and `build` targets. To narrow the
failure, run the target for a single package with the cache busted:

```bash
pnpm nx run <package>:typecheck --skip-nx-cache
```

Nx caches results; a stale cache can mask a new failure in test files (which
`tsconfig.build.json` excludes from emit but `typecheck` includes). Always bust
the cache after adding test files.

### The boundary checker fails (`pnpm boundaries`)

The checker scans every `.ts`/`.tsx` under each package's `src/` and enforces:
no `platform:node` package importing a `platform:browser` package, and no
deep-imports into another package's `src/`. If it fails, read the reported
offender line — it names the importer file, the specifier, and the rule
(`node-imports-browser` or `deep-import`). Re-tag a package or import only the
package public API (`@vision-control/<name>`).

---

## Extension

### The extension will not load / the panel does not appear

1. Build it: `pnpm nx run extension:build` — output lands in
   `apps/extension/.output/chrome-mv3/`.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
   and select that directory.
3. Open DevTools on a loopback page (`http://localhost:*` / `127.0.0.1`). The
   panel appears there with no extra setup. For another local development host,
   such as `http://subshell:10601/`, open the panel on a loopback page first and
   grant that host from **Site Access**. The manifest keeps mandatory host
   permissions loopback-only; non-loopback hosts require an explicit per-host
   grant before inspection.
4. If the panel is missing, check `chrome://extensions` for errors logged by the
   service worker or the panel page.

### `debugger` permission is requested

It is in `optional_permissions` only and is never required for the MVP. The
extension works without it. See ADR-006 and the PRD guardrail.

---

## Daemon

### The daemon will not start

Run `pnpm nx run daemon:dev -- --help` — the `--help` path imports nothing heavy
and exits 0 without binding. If that fails, the binary or its dependencies are
not built: run `pnpm nx run daemon:build` (and `pnpm build` for the
`@vision-control/storage` / `daemon-core` deps).

The real start path opens a SQLite database at
`<workspace>/.vision-control/daemon.db`, runs migrations, mints a pairing token,
and binds to loopback. If it fails after that, the stderr line names the cause.

### `NonLoopbackHostError` / the daemon refuses to bind

The daemon binds to `127.0.0.1` only (PRD section 27.1). Passing
`--host 0.0.0.0` or any non-loopback address is refused before it listens. Use
`127.0.0.1`, `::1`, or `localhost`.

### The daemon prints a pairing URL and then nothing

That is correct. The ready line is emitted once on stdout:

```
{"event":"ready","port":N,"host":"127.0.0.1","pairingUrl":"vision-control://pair?token=…","pairingHttpUrl":"http://127.0.0.1:N/pair?token=…&port=N&host=…","sessionId":"…"}
```

The raw token is shown exactly once; only its SHA-256 hash is stored. The
extension uses it to authenticate the WebSocket upgrade. Tokens stay valid until
they expire (default about 5 minutes) or are revoked. They are not single-use:
reconnect within the TTL reuses the same token. Loading `GET /pair` does not
consume or invalidate the token.

On an interactive TTY bound to `127.0.0.1`, the daemon also tries to open
`pairingHttpUrl` in your default browser (the local `/pair` landing page). Use
`--no-open` to skip that, or `--open` to force an open when stdout is not a TTY.
Auto-open never runs for `::1` or `localhost` binds, and never when `--no-open`
is set. See [apps/daemon/README.md](../apps/daemon/README.md).

### Pasting the `vision-control://pair?...` URL into a browser does nothing

The custom `vision-control://` scheme has no browser or OS protocol handler, so
the address bar treats it as a search query. That is expected. Paste the deep
link into the **Vision Control** DevTools panel's connect field instead (or paste
just the token; the panel fills in daemon defaults).

For a browser-openable path, use the HTTP URL from `pairingHttpUrl` (or open
`http://127.0.0.1:<port>/pair?token=…&port=…&host=…`). That page is a local
landing page: with the Chromium extension loaded it can auto-pair; without the
extension, or in another browser, it only shows paste instructions. There is
still no OS registration of `vision-control://`.

The pairing secret appears in the HTTP URL query string, so it can linger in
browser history until the tab is closed or history is cleared. Prefer a private
window if that matters, and do not share the URL. The page sets
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`, but history is
still a residual risk.

---

## Connection issues

### `connection refused` to the daemon

The daemon is not running, or it is on a different port. `--port 0` (the
default) binds an ephemeral port; the actual port is in the ready line. Set
`VC_DAEMON_URL` to `http://127.0.0.1:<that-port>` for the CLI, or run the daemon
with a fixed `--port`. A web page cannot reach the daemon even if it guesses the
port — the origin check rejects it first.

### `origin rejected` (403)

The request's `Origin` header is not on the allowlist. The default allowlist is
loopback origins plus `chrome-extension://`. To add a dev origin (e.g. a Vite
dev server), list it under `origins` in `vision-control.config.ts`:

```ts
export default {
  origins: ["http://localhost:5173"],
};
```

### `UNAUTHORIZED` (401)

The pairing token was missing, wrong, or expired. The daemon stores only the
token hash; restart the daemon to mint a fresh token, or re-run the pairing flow.
Tokens are valid until expiry or revoke (not single-use), so reconnect uses the
same token within its TTL.

### `WORKSPACE_NOT_BOUND`

The session authenticated but has not bound to a workspace. Source/context reads
are rejected until the extension binds the session. This is an intentional guard:
a valid token alone does not grant source access.

---

## MCP server

### The MCP server is not listed by the agent

Confirm the server builds and the binary runs:

```bash
pnpm nx run mcp-server:build
node packages/mcp-server/dist/bin.js   # starts and waits on stdio
```

Then check the agent config points at the right command. From outside the
workspace, use the absolute path to `packages/mcp-server/dist/bin.js` instead of
`pnpm exec vision-control-mcp`. See [mcp-config-examples.md](./mcp-config-examples.md).

### MCP HTTP `406 Not Acceptable`

The Streamable HTTP transport requires the request to advertise
`Accept: application/json, text/event-stream`. A bare `fetch` without that header
gets 406. The CLI's `callMcpTool` and `vision-control doctor` set it
automatically; custom clients must too.

### MCP tool responds "no daemon connected"

The server is running with stub deps. Set `VC_DAEMON_URL` in the server's
environment so it reads live data. With stub deps, every tool still returns a
valid MCP response — useful for verifying the tool list without a daemon.

### `vision_apply_deterministic_patch` is missing

That is intentional, not a bug. The MCP server is read-only; there is no
source-changing tool and there will not be one in the MVP. See
[mcp-policy.md](./agents/mcp-policy.md). The agent writes source through its own
file-writing mechanism and verifies through HMR.

---

## Context and redaction

### Expected data is missing from a context export

The redaction layer (ADR-009) masks secrets, cookies, auth headers, form values,
and high-entropy tokens before export. If a value looks like a secret it is
redacted by category, and the privacy report lists how many items were redacted
and by which rule — without revealing the values. Do not attempt to bypass it;
if legitimate data is masked, adjust the source so it does not resemble a
secret, or read it through a non-sensitive path.

### `redactObject` masks a shared object reference as `[REDACTED:circular]`

The redaction walker uses a `WeakSet` to break cycles, which also flags a
legitimate DAG shared reference. The context compiler avoids this by storing
indexes (primitives) instead of nested object aliases. If you hit it in your own
data, flatten the shared reference to an index or id.

---

## Getting more detail

- Architecture decisions: [docs/adr/](./adr/).
- Security and privacy contract: [docs/agents/security-privacy.md](./agents/security-privacy.md)
  and the user-facing [security-privacy-overview.md](./security-privacy-overview.md).
- Verification rules: [docs/agents/verification.md](./agents/verification.md).
- Run `vision-control doctor` for a full environment report.
