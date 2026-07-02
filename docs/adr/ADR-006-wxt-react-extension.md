# ADR-006: WXT and React Chromium extension architecture

## Status

Accepted (2026-07-02).

## Context

The MVP requires a Chromium DevTools panel that lets the user pick an element,
inspect it, and issue edit commands (PRD section 7.1, lines 264-283). The
extension needs four execution contexts: a DevTools panel (React UI), a content
script (page interaction, overlay injection), a background service worker
(messaging bridge), and a Shadow DOM overlay (selection highlights that do not
pollute the host page's DOM or CSS).

The PRD (line 2679) lists WXT as the extension framework. WXT wraps Vite and
provides a conventional structure for manifest v3 extensions with React, content
scripts, background scripts, and DevTools panels.

The overlay must live in a Shadow DOM to isolate its styles from the host page
and to survive React reconciliation in the host app (PRD risk R1, line 2613).

## Decision

Build the extension with WXT and React. The four contexts are:

1. **DevTools panel** (`apps/extension`): a React app registered as a DevTools
   panel. Houses the inspector UI, editor controls, and change journal.
2. **Content script**: injected into the page. Handles element picking (hover
   outline, click selection) and owns the Shadow DOM overlay root.
3. **Background service worker**: bridges messages between the panel, the content
   script, and the daemon client.
4. **Shadow DOM overlay** (`packages/overlay-ui`): renders selection outlines,
   resize handles, and breadcrumbs inside a shadow root attached to the page.
   Styles are scoped so host page CSS never bleeds in.

The core geometry and IR packages (`packages/geometry`, `packages/change-ir`)
are DOM-independent. They never touch browser globals directly. Browser global
access goes through adapter interfaces (PRD section 35.2, line 2507), keeping the
core testable in isolation.

## Consequences

- The extension requires manifest v3. Background logic runs in a service worker,
  which has no DOM access. State that survives service worker suspension must be
  persisted or kept in the daemon.
- The Shadow DOM overlay adds a layer of indirection for coordinate math.
  Element bounding boxes come from the light DOM; overlay positioning is computed
  relative to the shadow root's host.
- WXT handles hot reload during development. Production builds are minified and
  packaged as a `.zip` for manual load or store submission.
- The overlay package is `platform:browser` only. It cannot be imported by any
  node package (enforced by the boundary checker, ADR-003).

## MVP Guardrail

This decision fixes the extension to Chromium manifest v3 and single-element
selection. Multi-select, group move, Firefox support, and collaboration are V1 or
later (PRD sections 7.2, 7.3). By choosing WXT now, the extension gets a
conventional, maintainable structure without over-engineering for features that
are out of scope. The Shadow DOM overlay isolation prevents the most common MVP
bug: host page CSS or React reconciliation breaking the selection highlight.
