# @vision-control/bridge-client

Isomorphic client for the optional MCP bridge (ADR-020 C3 / ADR-019 C8).

- Probe `GET http://127.0.0.1:4322/discover` (secret-free)
- Pair over `ws://127.0.0.1:4322/bridge?token=…`
- Persist **endpoint only** (never the raw pair token long-term)
- SW wake policy: reconnect only while the in-memory token is still valid
- Client heartbeats (`session.heartbeat`) under the 15s MCP max gap
- Multi-tab last-focused active session helper

> Nx tags: `platform:isomorphic`, `type:library`, `scope:bridge-client`.

## Scripts

```bash
pnpm nx run bridge-client:build
pnpm nx run bridge-client:typecheck
pnpm nx run bridge-client:test
```
