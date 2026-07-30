<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# risk-gates

## Purpose

Seven PRD Appendix-D risk-gate specs: isolation, privacy, stale preview, semantic drag collapse, overlay visuals, source-map false positives, auth failures.

## Key Files

| File | Description |
|------|-------------|
| `tab-frame-isolation.spec.ts` | Tab/frame isolation |
| `privacy-export-redaction.spec.ts` | Export redaction |
| `stale-preview-verification.spec.ts` | Stale preview must not pass verification |
| `drag-semantic-collapse.spec.ts` | No absolute-position collapse on normal flow |
| `overlay-visuals.spec.ts` | Overlay visual guard |
| `source-mapping-false-positives.spec.ts` | Source map false positive guard |
| `daemon-auth-failures.spec.ts` | Auth failure postures (legacy name; bridge auth) |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- These are release guardrails. Failures block ship.
- Prefer fixing product code over weakening gates.

### Testing Requirements

Included in `pnpm nx run extension:e2e`.

### Common Patterns

- Match neighboring file style.

## Dependencies

### Internal

- See parent package.

### External

- See parent package.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
