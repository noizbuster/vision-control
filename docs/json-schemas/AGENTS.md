<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# json-schemas

## Purpose

Published JSON Schema documents derived from or aligned with
`@vision-control/protocol` envelopes for external consumers.

## Key Files

| File | Description |
|------|-------------|
| `protocol-envelope.json` | Protocol envelope JSON Schema (Draft 2020-12 family) |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Prefer generating from `protocol`'s `generateJsonSchema` rather than hand-editing
  divergent copies.
- Keep schema in lockstep with `PROTOCOL_VERSION` / envelope changes.

### Testing Requirements

- Protocol package tests cover schema generation; re-export or copy deliberately.

### Common Patterns

- One schema file per public wire contract.

## Dependencies

### Internal

- `@vision-control/protocol`.

### External

- JSON Schema Draft 2020-12.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
