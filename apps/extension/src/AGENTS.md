<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# src

## Purpose

Extension implementation shared across panel, background, and content contexts: App shell, messaging, journal authority, overlay controllers, components, hooks, verification wiring, host allowlist.

## Key Files

| File | Description |
|------|-------------|
| `App.tsx` | Panel application root |
| `content-injection.ts` | Content script injection helpers |
| `background-tab-lifecycle.ts` | Tab lifecycle in background |
| `background-frame-hello.ts` | Frame hello handshake |
| `host-allowlist.ts` | Host allowlist model |
| `host-permissions.ts` | Host permission helpers |
| `interaction-mode-routing.ts` | Interaction mode routing |
| `inspector-slot-commands.ts` | Inspector slot command bridge |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | React panel components (see components/AGENTS.md) |
| `hooks/` | Panel React hooks (see hooks/AGENTS.md) |
| `journal/` | Background journal authority + bridge snapshot push (see journal/AGENTS.md) |
| `messaging/` | Buses, router, permissions, bridge session (see messaging/AGENTS.md) |
| `overlay/` | Content-runtime overlay controllers (see overlay/AGENTS.md) |
| `styles/` | Panel CSS (see styles/AGENTS.md) |
| `testing/` | Test fixtures for unit tests (see testing/AGENTS.md) |
| `verification/` | Content/background verification wiring (see verification/AGENTS.md) |

## For AI Agents

### Working In This Directory

- Respect context boundaries: panel code must not assume direct DOM of the inspected page.
- Background is journal SoT; content owns preview/verify execution.
- Additive inspector slots — emit data, do not hard-mount panels.

### Testing Requirements

`pnpm nx run extension:test`

### Common Patterns

- Match neighboring file style.

## Dependencies

### Internal

- See parent package.

### External

- See parent package.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
