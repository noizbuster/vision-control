# Troubleshooting

Common issues and how to resolve them. Ordinary editing needs only the
extension. The optional MCP bridge is for coding agents.

---

## Setup and build

### `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`

A dependency with a postinstall script (e.g. `esbuild`) was blocked by pnpm 11's
default build-deny. The workspace allowlist lives in `pnpm-workspace.yaml` under
`allowBuilds`. Add the package there and re-run `pnpm install`.

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
offender line  -  it names the importer file, the specifier, and the rule
(`node-imports-browser` or `deep-import`). Re-tag a package or import only the
package public API (`@vision-control/<name>`).

---

## Extension

### The extension will not load / the panel does not appear

1. Build it: `pnpm nx run extension:build`  -  output lands in
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

### Select / preview / undo do not work without MCP

That is unexpected. The edit loop is extension-only (ADR-019). MCP is optional.
If the overlay is missing, confirm the content script injects on the page
(loopback or a granted Site Access host) and that the panel is open on that tab.

### `debugger` permission is requested

It is in `optional_permissions` only and is never required. The extension works
without it. See ADR-006 and the PRD guardrail.

---

## Optional MCP bridge

### The MCP process will not start / port 4322 busy

```bash
pnpm nx run mcp-server:build
node packages/mcp-server/dist/bin.js
# or: vision-control mcp
```

Port **4322** is fixed for discover + bridge (ADR-020). If another process holds
it, free the port or stop the other instance. There is no multi-port scan product
path. Bind is loopback only (`127.0.0.1`).

### Pair token not found

The pair token prints **once on stderr** when the MCP process starts. It is never
on stdout (that would corrupt agent JSON-RPC) and never in
`GET http://127.0.0.1:4322/discover`. Restart the MCP process to mint a fresh
token if you lost it. Default TTL is about 5 minutes.

### Panel shows not paired / tools return `not_paired`

1. Confirm the MCP process is running and `curl -s http://127.0.0.1:4322/discover`
   returns JSON without a token field.
2. Paste the stderr pair token into the panel connect field (or auto-detect then
   paste).
3. Confirm the background service worker is alive (`chrome://extensions` →
   service worker). On wake, re-pair if the in-memory token expired.

Unpaired tools must return `not_paired` / empty / error. They must **never**
return a stale verification `passed: true` (ADR-019 C6).

### Docs still mention `VC_DAEMON_URL` or "start the daemon"

Those paths are obsolete. There is no always-on daemon product path. Use
`vision-control mcp` for the optional agent bridge. See
[mcp-config-examples.md](./mcp-config-examples.md).

---

## Connection issues

### `connection refused` to `127.0.0.1:4322`

The MCP bridge is not running. Start `vision-control mcp` (or the mcp-server
binary). Ordinary editing does not need this process.

### `origin rejected` (403)

A request's `Origin` header is not on the allowlist for a loopback HTTP surface.
Default allowlist is loopback origins plus `chrome-extension://`. The product
bridge is extension WebSocket pair + agent stdio; do not expose non-loopback
binds (ADR-020).

### `UNAUTHORIZED` (401)

Wrong or missing Bearer token on optional HTTP MCP transport, or wrong extension
pair token on the bridge. Agent Bearer (`VC_MCP_TOKEN`) is a **separate** secret
from the extension pair token. Restart MCP to mint a fresh pair token on stderr.

---

## MCP server (agent side)

### The MCP server is not listed by the agent

Confirm the server builds and the binary runs:

```bash
pnpm nx run mcp-server:build
node packages/mcp-server/dist/bin.js   # starts stdio + bridge; pair token on stderr
```

Then check the agent config points at the right command. From outside the
workspace, use the absolute path to `packages/mcp-server/dist/bin.js` instead of
`pnpm exec vision-control-mcp`. See [mcp-config-examples.md](./mcp-config-examples.md).

### MCP HTTP `406 Not Acceptable`

The Streamable HTTP transport requires the request to advertise
`Accept: application/json, text/event-stream`. A bare `fetch` without that header
gets 406. Custom clients must set it.

### MCP tool responds `not_paired` or empty

The extension has not paired, or the projection cache has no snapshot yet. Pair
the panel, select an element, and retry. This is not a daemon URL problem; there
is no `VC_DAEMON_URL` on the product path.

### `vision_apply_deterministic_patch` is missing

That is intentional, not a bug. The MCP server is read-only; there is no
source-changing tool and there will not be one. See
[mcp-policy.md](./agents/mcp-policy.md). The agent writes source through its own
file-writing mechanism and verifies through HMR.

---

## Context and redaction

### Expected data is missing from a context export

The redaction layer (ADR-009) masks secrets, cookies, auth headers, form values,
and high-entropy tokens before export. If a value looks like a secret it is
redacted by category, and the privacy report lists how many items were redacted
and by which rule  -  without revealing the values. Do not attempt to bypass it;
if legitimate data is masked, adjust the source so it does not resemble a
secret, or read it through a non-sensitive path.

Origins may be empty when maps are unavailable or caps are hit (ADR-019 C4).
That is valid; HIGH confidence requires map + range.

### `redactObject` masks a shared object reference as `[REDACTED:circular]`

The redaction walker uses a `WeakSet` to break cycles, which also flags a
legitimate DAG shared reference. The context compiler avoids this by storing
indexes (primitives) instead of nested object aliases. If you hit it in your own
data, flatten the shared reference to an index or id.

---

## Getting more detail

- Architecture decisions: [docs/adr/](./adr/). Prefer ADR-019/020 for SoT and MCP.
- Security and privacy contract: [docs/agents/security-privacy.md](./agents/security-privacy.md)
  and the user-facing [security-privacy-overview.md](./security-privacy-overview.md).
- Verification rules: [docs/agents/verification.md](./agents/verification.md).
- Workspace health: `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
