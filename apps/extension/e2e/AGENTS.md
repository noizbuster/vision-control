<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# e2e

## Purpose

Playwright end-to-end specs for the extension: edit flows, flex/grid, journal, MCP query, manifest, plus Appendix-D risk gates.

## Key Files

| File | Description |
|------|-------------|
| `select-element.spec.ts` | Selection flow |
| `reorder.spec.ts` | Reorder e2e |
| `reparent.spec.ts` | Reparent e2e |
| `resize-browser.spec.ts` | Resize browser e2e |
| `journal-undo-redo.spec.ts` | Journal undo/redo |
| `hmr-verification.spec.ts` | HMR verification loop |
| `mcp-context-query.spec.ts` | MCP context query |
| `firefox-compat.spec.ts` | Firefox manifest security posture (no browser binary) |
| `chromium-manifest.spec.ts` | Chromium MV3 manifest checks |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `fixtures/` | Shared e2e fixtures |
| `risk-gates/` | PRD Appendix-D guardrail specs (see risk-gates/AGENTS.md) |

## For AI Agents

### Working In This Directory

- Do not treat test.fixme as green coverage; remaining OUT stubs need explicit rationale.
- Risk gates are load-bearing product guardrails — do not skip casually.
- Requires `pnpm playwright install chromium` then `pnpm nx run extension:e2e`.

### Testing Requirements

`pnpm nx run extension:e2e`

### Common Patterns

- Spec files colocated with helper modules for visual evidence.
- Viewport helpers in viewport.ts

## Dependencies

### Internal

- See parent package.

### External

- See parent package.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
