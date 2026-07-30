<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# catalog

## Purpose

Message catalogs spanning bridge and historical browser↔daemon directions. Prefer bridge catalog for ADR-020 paths.

## Key Files

| File | Description |
|------|-------------|
| `bridge.ts` | Bridge messages |
| `browser-to-daemon.ts` | Historical browser→daemon catalog |
| `daemon-to-browser.ts` | Historical daemon→browser catalog |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Do not revive daemon SoT semantics when editing historical catalogs.
- New product messages go through bridge-compatible types.

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
