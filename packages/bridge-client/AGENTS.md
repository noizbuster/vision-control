<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# bridge-client

## Purpose

Isomorphic MCP bridge client used by the extension: discover (secret-free), pair over loopback WebSocket, heartbeat, endpoint storage, active-session tracking (ADR-020 C3/C8, ADR-019 C8).

Package: `@vision-control/bridge-client` · Nx project typically `bridge-client`.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | Public barrel |
| `src/client.ts` | Bridge client orchestration |
| `src/discover.ts` | GET /discover probe (no secrets) |
| `src/pairing.ts` | Pairing handshake |
| `src/endpoint-store.ts` | Persist endpoint only — never long-term raw pair token |
| `src/reconnect-policy.ts` | SW wake reconnect policy |
| `src/active-session.ts` | Multi-tab last-focused session helper |
| `src/websocket.ts` | WebSocket factory abstractions |
| `src/loopback.ts` | Loopback host guards |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Pair token is in-memory / panel-paste only; never log it or put it on discover.
- Reconnect only while in-memory token remains valid (service worker wake).
- Heartbeats (`session.heartbeat`) must respect MCP max gap (<15s).
- Exact loopback host policy — no multi-port scan product path.

### Testing Requirements

```bash
pnpm nx run bridge-client:typecheck
pnpm nx run bridge-client:test
pnpm nx run bridge-client:build
```

See package README for discover/pair flows.

### Common Patterns

- Endpoint storage separates durable endpoint from ephemeral token.
- Message types align with `@vision-control/protocol`.

### Anti-Patterns

- Do not persist raw pair tokens long-term.
- Do not fetch non-loopback bridges as a product path.
- Do not put secrets in `/discover` responses or client logs.

## Dependencies

### Internal

- @vision-control/protocol

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
