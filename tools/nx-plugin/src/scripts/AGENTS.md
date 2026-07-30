<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# scripts

## Purpose

Workspace scripts: boundary conformance checker and bulk scaffold.

## Key Files

| File | Description |
|------|-------------|
| `boundaries.ts` | Boundary checker (pnpm boundaries) |
| `boundaries.test.ts` | Checker tests |
| `scaffold-all.ts` | Bulk scaffold |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Fail on node→browser imports and deep src imports.
- Scan every .ts/.tsx under package src/.
- Do not soft-fail violations.

### Testing Requirements

`pnpm boundaries` and package tests.

### Common Patterns

- Match neighboring file style.

## Dependencies

### Internal

- See parent package.

### External

- See parent package.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
