# Vision Control Design System

## 1. Atmosphere & Identity

Vision Control feels like a precise browser workbench: compact, technical, and
visible only when it helps the user edit. The signature is a high-contrast
DevTools overlay language, with dark floating controls, bright outlines, and
minimal chrome that stays subordinate to the inspected page.

## 2. Color

### Palette

| Role | Token | Value | Usage |
|---|---|---|---|
| Overlay ink | `--vc-ink` | `oklch(98% 0.005 260)` | Primary text in page overlays |
| Overlay surface | `--vc-surface` | `oklch(18% 0.015 260)` | Floating labels and inspector panels |
| Hover outline | `--vc-hover` | `oklch(68% 0.2 240)` | Hover target outline |
| Selection outline | `--vc-select` | `oklch(65% 0.22 85)` | Selected target outline |
| Interactive handle | `--vc-handle` | `oklch(60% 0.2 260)` | Resize handles and focused affordances |
| Valid drop | `--vc-drop-valid` | `oklch(70% 0.22 145)` | Accepted drop targets |
| Invalid drop | `--vc-drop-invalid` | `oklch(60% 0.22 25)` | Rejected drop targets and warnings |
| Muted border | inspector local | `oklch(30% 0.02 260)` | Inspector field and panel borders |
| Muted text | inspector local | `oklch(70% 0.03 260)` | Inspector labels and row captions |

### Rules

- Page overlays use the `--vc-*` token set declared in
  `packages/overlay-ui/src/styles.ts`.
- Inspector-only colors may remain local to
  `apps/extension/src/overlay/property-inspector.ts` until extracted into a
  shared browser overlay token module.
- Colors are functional state signals, not decoration.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|---|---:|---:|---:|---:|---|
| Overlay body | `11px` | 400 | 1.3 | 0 | Labels, controls, overlay metadata |
| Overlay label | `9px` | 400-700 | 1.3 | `0.04em` only for uppercase labels | Badges, captions, inspector section labels |

### Font Stack

- Primary/mono: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

### Rules

- Overlay text remains compact because it competes with the inspected page.
- Do not use hero-scale or marketing typography in runtime overlays.

## 4. Spacing & Layout

### Base Unit

Runtime overlays use 2px and 4px steps for tight browser chrome. Larger app
panels should use the repository's existing 4px rhythm.

| Token | Value | Usage |
|---|---:|---|
| `--vc-space-1` | `2px` | Label vertical padding |
| `--vc-space-2` | `4px` | Inline gaps, compact padding |
| `--vc-space-3` | `6px` | Label horizontal padding |

### Rules

- Floating overlay controls must use stable dimensions and must not resize the
  inspected page.
- Runtime overlay positioning is viewport-relative and never changes source
  layout.

## 5. Components

### Selection Overlay

- **Structure**: shadow-root outline, floating label, confidence badge.
- **Variants**: hover, selected, drop indicator, parent outline, resize handles.
- **Spacing**: `--vc-space-*`, `--vc-outline-width`, `--vc-handle-size`.
- **States**: hidden, hover, selected, drag/drop valid, drag/drop invalid.
- **Accessibility**: overlay artifacts stay inside the shadow DOM and do not
  leak into page DOM queries.
- **Motion**: fast positional transitions only where they do not fight direct
  manipulation.

### Floating Property Inspector

- **Structure**: fixed shadow-root panel, draggable header, compact sections,
  chips, inputs, and style controls.
- **Variants**: hidden, shown for selected element, source-badged element.
- **Spacing**: compact 2px-8px controls to preserve page visibility.
- **States**: default, hover/focus on controls, active drag on header.
- **Accessibility**: controls use native inputs/buttons; drag handle remains the
  element-name header and does not alter page layout.
- **Motion**: direct pointer tracking; no layout animation during drag.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|---|---:|---|---|
| Micro | `120ms` | `ease-out` | Outline and target-state updates |
| Direct manipulation | immediate | none | Dragging overlays and handles |

### Rules

- Direct manipulation follows the pointer with no easing.
- Overlay pointer handlers must stop at the shadow-root surface and must not
  trigger page selection or editing side effects.

## 7. Depth & Surface

### Strategy

Mixed depth: runtime outlines are border-first; floating controls use dark
surfaces with subtle borders and shadows because they sit above arbitrary page
content.

| Level | Value | Usage |
|---|---|---|
| Floating inspector | `0 8px 24px oklch(0% 0 0 / 0.4)` | On-page inspector panel |
| Selected outline | local layered shadow | Selected target emphasis |
| Compact controls | muted 1px border | Inputs, chips, badges |

### Rules

- Do not add decorative cards inside overlay panels.
- Depth exists to keep controls readable on unknown webpages.

## 8. DevTools Panel

The Chromium DevTools panel is a separate surface from the page overlay. It
uses the panel token set in `apps/extension/src/styles/variables.css`, not the
overlay OKLCH tokens in `packages/overlay-ui`. Do not conflate the two.

### Atmosphere

Precise browser workbench: compact, dark-first when DevTools is dark, subordinate
chrome, high information density without flat endless scroll.

### Panel tokens

| Role | Token | Source |
|---|---|---|
| Surfaces | `--vc-bg-1` … `--vc-bg-3` | `variables.css` |
| Text | `--vc-text-1` … `--vc-text-3` | `variables.css` |
| Border / accent / status | `--vc-border`, `--vc-accent`, `--vc-success`, `--vc-warning`, `--vc-error` | `variables.css` |
| Spacing | `--vc-space-1` … `--vc-space-6` (4px rhythm) | `variables.css` |
| Radii / type | `--vc-radius-*`, `--vc-text-xs` … `--vc-text-lg` | `variables.css` |
| Focus | `--vc-focus-ring` | `variables.css` (panel shell) |
| Sticky chrome | `--vc-z-sticky` | `variables.css` (panel shell) |

Theme class: `.app--dark` / `.app--light` on the panel root. Prefer
`chrome.devtools.panels.themeName` (`"dark"` → dark, otherwise light); fall back
to `prefers-color-scheme`.

### Shell regions

| Region | Class | Behavior |
|---|---|---|
| Header | `.app__header` | Sticky: title, connection status, collapsible pairing, inspected URL |
| Main | `.app__main` | Scrollable primary work area |
| Diagnostics | `.app__diagnostics` | Collapsed by default: tab / session / frame tree / site access |
| Primary | `.app__primary` | Inspector + additive editor surfaces |
| Journal | `.app__journal` | Sticky bottom change journal + grouped actions |

### Density rules

- Inspector sections use collapsible disclosure (native `details`/`summary` or
  equivalent with `aria-expanded`).
- Style editor is the primary edit surface; **Computed Style is collapsed by
  default** so the same 17 properties are not double-rendered open.
- Journal toolbar groups: History (Undo/Redo/Clear) | Agent prompt | Export menu.
- Pairing form is collapsible; edit loop must work agent-disconnected.
- Debug chrome (tab/session/frames) stays in Diagnostics, not above the work surface.

### Accessibility

- Prefer native `button`, `details`/`summary`, `fieldset`.
- Visible `:focus-visible` rings via `--vc-focus-ring`.
- Preserve existing `aria-label`, `aria-live`, `aria-pressed`, `role="alert"` patterns.
- Preserve all existing `data-testid`s.

### Accepted debt (this pass)

- No Layers / full DOM tree product feature (PRD §8.1 left column deferred).
- Verification is status-only in the panel (preview note); no new
  panel→`request_verification` messaging architecture.
- Overlay tokens remain separate from panel tokens; no forced OKLCH unification.
- `packages/shared-ui` stays unpopulated; panel uses local components + CSS.
