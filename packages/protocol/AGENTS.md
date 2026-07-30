<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# protocol

## Purpose

Versioned protocol envelopes, message contracts, negotiation, and error taxonomy shared by extension and MCP bridge. Isomorphic; zod-only runtime dep.

Package: `@vision-control/protocol` · Nx project typically `protocol`.

## Key Files

| File | Description |
|------|-------------|
| `src/envelope.ts` | ProtocolEnvelope schema/parse |
| `src/message-types.ts` | Discriminated message union |
| `src/negotiation.ts` | Hello/welcome capability intersect |
| `src/version.ts` | PROTOCOL_VERSION helpers |
| `src/errors.ts` | ProtocolError taxonomy |
| `src/json-schema.ts` | generateJsonSchema |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/catalog/` | Message catalogs (see `src/catalog/AGENTS.md`) |
| `src/__fixtures__/` | Fixtures |

## For AI Agents

### Working In This Directory

- Bump version carefully; keep isCompatible honest.
- Regenerate docs/json-schemas when envelope changes.
- Bridge lifecycle messages must stay secret-free on discover.

### Testing Requirements

```bash
pnpm nx run protocol:typecheck
pnpm nx run protocol:test
pnpm nx run protocol:build
```

index, bridge-lifecycle tests.

### Common Patterns

- Zod discriminated unions.
- HTTP-ish error status mapping.

### Anti-Patterns

- Do not put pair tokens in envelope types that flow through discover.

## Dependencies

### Internal

- None beyond workspace public APIs as needed.

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
