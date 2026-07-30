<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# inspector-core

## Purpose

Browser library that builds inspector read models and edit commands from DOM: selection summary, box model, breadcrumbs, classes, attributes, semantic summary, source confidence, structural/position commands.

Package: `@vision-control/inspector-core` · Nx project typically `inspector-core`.

## Key Files

| File | Description |
|------|-------------|
| `src/inspector.ts` | Inspector orchestration |
| `src/selection-summary.ts` | Selection summary builder |
| `src/dom-adapter.ts` | DOM access boundary |
| `src/commands.ts` | Command surface |
| `src/structural-commands.ts` | Structural edit commands |
| `src/position-command.ts` | Position commands |
| `src/source-confidence.ts` | Source confidence scoring |
| `src/redaction.ts` | Inspector summary redaction |
| `src/css-validation.ts` | CSS property/value validation |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- DOM only through `dom-adapter.ts` where applicable.
- Redact sensitive field values before panel/MCP projection.
- Source confidence must not claim HIGH marker paths as product SoT (ADR-019).

### Testing Requirements

```bash
pnpm nx run inspector-core:typecheck
pnpm nx run inspector-core:test
pnpm nx run inspector-core:build
```

inspector, selection-summary, structural-commands, source-confidence tests.

### Common Patterns

- Builder functions per summary facet.
- Command error types centralized.

### Anti-Patterns

- Do not bypass redaction.
- Do not require chrome.debugger.

## Dependencies

### Internal

- change-ir
- element-identity
- geometry
- layout-engine
- overlay-ui
- security

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
