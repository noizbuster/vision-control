<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# editors

## Purpose

Command editors for style, class, text, pseudo-elements, and props.

## Key Files

| File | Description |
|------|-------------|
| `StyleEditor.tsx` | CSS style editor |
| `ClassEditor.tsx` | Class list editor |
| `TextEditor.tsx` | Text content editor |
| `PseudoElementEditor.tsx` | Pseudo-element editor |
| `PropsPanel.tsx` | Component props panel (message-fed) |
| `EditorToolbar.tsx` | Shared editor toolbar |
| `index.ts` | Barrel |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Editors issue commands via hooks/bus; they do not patch source files.
- PropsPanel renders on data arrival only.

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
