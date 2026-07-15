# C7 package inventory (ADR-019)

Checked-in keep/delete inventory for the extension-SoT / MCP-bridge pivot.
Source of truth for dispositions: [ADR-019 C7](./adr/ADR-019-extension-source-of-truth.md).
Hard-delete (task 21) may only remove rows marked **Delete** here. Do not
reclassify Keep → Delete without a plan amendment.

**Unwire status (task 20):** product entrypoints no longer require the daemon,
workspace index, component-props AST, or marker HIGH path.

**Hard-delete status (task 21):** all **Delete** rows removed from the workspace
graph (apps/daemon, daemon-core, daemon-client, storage, workspace-index,
source-resolver, source-registry, marker/workspace integrations).

| Package / app | Disposition | Unwire notes (task 20) |
|---|---|---|
| `apps/extension` | **Keep** | Product path uses `bridge-client` only; no `daemon-client` runtime dep |
| `apps/daemon` | **Delete** | Removed from root `pnpm dev`; `dev` target renamed `dev-legacy` |
| `packages/daemon-core` | **Delete** after unwire | Not imported by product entrypoints |
| `packages/daemon-client` | **Delete or replace** with `bridge-client` | Extension product path replaced; package remains for daemon until task 21 |
| `packages/storage` | **Delete** if only daemon used | Unwired from product path; still used by daemon |
| `packages/workspace-index` | **Delete** | No product runtime path; may remain as extension e2e devDep until task 21 |
| `packages/source-resolver` | **Delete** product path if only node/workspace | Component-props product path unwired; type-only remnants may remain until task 21 |
| `packages/source-registry` | **Delete** if unused after marker drop | No product runtime path; e2e/dev remnants until task 21 |
| `packages/mcp-server` | **Keep** (bridge) | Single-process stdio + bridge :4322; no daemon |
| `packages/cli` | **Keep** (MCP launcher only) | Task 19 |
| `packages/context-compiler` | **Keep** | No runtime node deps |
| `packages/protocol` | **Keep** | |
| `packages/security` | **Keep** | |
| `packages/verification-engine` | **Keep** | Content-owned verify |
| `packages/change-ir`, `change-journal`, `preview-engine`, `editor-core`, `inspector-core`, `overlay-ui`, `layout-engine`, `interaction-machine`, `element-identity`, `geometry`, `shared-ui`, `logger`, `testing` | **Keep** | Trim daemon helpers in testing later if needed |
| `packages/map-origins` | **Keep** | CSSOM + maps only; no marker HIGH product path |
| `packages/bridge-client` | **Keep** | Replaces daemon-client on the product path |
| `integrations/vite-react`, `next-react` marker plugins | **Delete** if unused after unwire | Unwired from product path; packages remain until task 21 |
| `integrations/tailwind`, `css-modules`, `vanilla-css`, `vue`, `svelte` | **Delete** if only workspace/daemon adapters remain | Unwired from product path |
| `integrations/opencode`, `pi` | **Keep** | Config rewrite (no `VC_DAEMON_URL`) is task 22 |
| `apps/playground-*`, `visual-regression-lab` | **Keep** as fixtures | Root `pnpm dev` runs extension + playground-react-vite only |

## Product path rules after unwire

1. Ordinary edit loop: extension only (select, preview, journal, panel export).
2. Optional agent: `vision-control mcp` / MCP bridge on loopback :4322.
3. Root `pnpm dev` must not start `apps/daemon`.
4. No workspace bind, marker HIGH, or component-props AST product path.
5. Hard-delete is task 21 only.
