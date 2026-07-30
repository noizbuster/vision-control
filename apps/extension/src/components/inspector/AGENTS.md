<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# inspector

## Purpose

Read-side inspector UI. InspectorPanel takes optional additive slot props for multi-select, alignment, auto-layout, grid placement. Slots render only when data is present.

## Key Files

| File | Description |
|------|-------------|
| `InspectorPanel.tsx` | Main inspector composition |
| `InspectorEditorSlots.tsx` | Editor slot wiring |
| `AlignmentPanel.tsx` | Alignment slot panel |
| `AutoLayoutPanel.tsx` | Auto-layout slot panel |
| `GridPanel.tsx` | Grid placement slot panel |
| `MultiSelectInspectorSection.tsx` | Multi-select section |
| `SourceConfidence.tsx` | Source confidence display |
| `BoxModel.tsx` | Box model view |
| `selection-copy-content.ts` | Copy helpers |
| `auto-layout-operations.ts` | Auto-layout operation helpers |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Additive-slot contract is the rendering gate.
- Wire emission in overlay controllers; do not unconditional mount in App.tsx.

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
