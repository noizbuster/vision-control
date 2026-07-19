# @vision-control/protocol

Versioned protocol envelopes, message contracts, and negotiation for Vision
Control. An isomorphic, self-contained library (only `zod` as a runtime
dependency) consumed by the browser extension and the optional single-process
Node MCP bridge.

> Nx tags: platform:isomorphic, type:library, scope:protocol.

## Public API

| Export | Purpose |
| --- | --- |
| `PROTOCOL_VERSION`, `parseProtocolVersion`, `isCompatible` | Semver version parsing and compatibility |
| `ProtocolEnvelopeSchema`, `parseEnvelope`, `ProtocolEnvelope` | Wire envelope container (payload is `unknown`) |
| `MessageSchema`, `parseMessage`, per-type schemas | Discriminated union of MVP message types |
| `ProtocolErrorSchema`, `protocolError`, `ProtocolErrorCode` | Error taxonomy with HTTP-ish status mapping |
| `negotiateProtocol` | Client hello to welcome handshake with capability intersection |
| `generateJsonSchema` | JSON Schema (Draft 2020-12) output for the envelope + message union |

## Design principles

- **Parse-result pattern.** `parseEnvelope` and `parseMessage` never throw;
  they return `{ success: true, data } | { success: false, error }`.
- **Forward compatibility.** Unknown extra fields in payloads and metadata are
  ignored. Within the same MAJOR version, additive fields keep the wire
  compatible.
- **No `any`.** Payload boundaries use `unknown`; narrowing happens through Zod
  schemas at consumption time.

## Scripts

Run from the repository root:

```bash
pnpm nx run protocol:typecheck   # tsc --noEmit
pnpm nx run protocol:test        # vitest run
pnpm nx run protocol:build       # tsc -p tsconfig.build.json -> dist/
```
