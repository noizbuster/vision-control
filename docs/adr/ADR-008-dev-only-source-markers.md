# ADR-008: Dev-only source markers

## Status

Accepted (2026-07-02).

## Context

To map a rendered DOM element back to its source, the build must tag elements
with source location metadata (file path, line, component boundary). This is the
foundation of the source marker pipeline (PRD section 7.1, line 279).

The danger is leakage: if source paths or internal identifiers ship to a
production bundle, they expose the developer's file structure, project layout,
and potentially internal naming. This is a privacy and security risk
(PRD Appendix D constraint 6, line 2901).

## Decision

Source markers are a dev-only build artifact. The Vite and Next integrations
inject an opaque `data-vc-source` attribute onto elements during development.
The attribute carries an encoded reference (never a raw file path) that the
daemon resolves to a source location at runtime.

Rules:

- **No absolute paths.** The marker contains an opaque token, not a filesystem
  path. The daemon maintains a registry that maps tokens to source locations.
  The token is meaningless outside the daemon session.
- **No production injection.** The marker transform runs only in dev mode. The
  production build pipeline skips it entirely. There is no flag to enable it in
  production.
- **No source mutation.** Markers are injected at build time into the rendered
  DOM, not into the source files. The source files are never modified by the
  marker pipeline.

The `integrations/vite-react` plugin implements this for Vite + React. Next.js
support is V1 (PRD section 7.2, line 294).

## Consequences

- In dev mode, elements carry a `data-vc-source` attribute. This is invisible to
  the user but readable by the content script and the daemon.
- The daemon must be running for markers to resolve. Without the daemon, the
  attribute is opaque and harmless.
- The Vite plugin must be careful not to interfere with React's reconciliation.
  Markers are added during the transform pass, not at runtime, so they do not
  trigger re-renders.
- Production bundles are clean. A diff between dev and prod builds shows the
  marker attributes only in dev.

## MVP Guardrail

This decision is the hard line between dev tooling and production safety. Source
paths in production bundles are a privacy violation. By making markers dev-only
and opaque, the MVP guarantees that no source structure leaks to a deployed app.
This protects against the most common cause of marker leakage: a flag left on by
accident. There is no production escape hatch, by design. See
[docs/agents/security-privacy.md](../agents/security-privacy.md) for the full
security contract.
