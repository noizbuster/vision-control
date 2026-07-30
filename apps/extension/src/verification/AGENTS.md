<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# verification

## Purpose

Extension wiring for verification-engine: content verification runner binding, background command router/results, bridge command kinds, local result authority.

## Key Files

| File | Description |
|------|-------------|
| `content-verification.ts` | Content-side verification execution |
| `content-command-wiring.ts` | Content command wiring |
| `background-command-router.ts` | Background command router |
| `background-command-result-wiring.ts` | Result wiring to panel/bridge |
| `bridge-command-kinds.ts` | Bridge command kind constants |
| `index.ts` | Barrel |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Verification asserts source after preview clear — never cheat with preview state.
- Unpaired/stale results must not report passed:true (ADR-019 C6).
- Background routes; content executes against the live DOM.

### Testing Requirements

Covered by parent package Nx targets.

### Common Patterns

- Match neighboring file style.

## Dependencies

### Internal

- See parent package.

### External

- See parent package.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
