<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# fixtures

## Purpose

One-case-per-file adversarial components: iframes, shadow DOM, portals, identical buttons, CSS modules/grid, flex resize, HMR, private fields, transforms, etc.

## Key Files

| File | Description |
|------|-------------|
| `MvpBoard.tsx` | MVP board composition |
| `HmrDemo.tsx` | HMR demo |
| `CrossOriginIframe.tsx` | Cross-origin iframe case |
| `ShadowDomOpen.tsx` | Open shadow root |
| `ShadowDomClosed.tsx` | Closed shadow root |
| `ResizeFlex.tsx` | Flex resize case |
| `CssGridCase.tsx` | CSS grid case |
| `PrivateFields.tsx` | Sensitive field labels for redaction tests |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Add new cases as focused components; wire into App board.
- Keep private/sensitive-looking fields fake — still good redaction targets.

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
