# ADR-016: Firefox support level

## Status

Accepted (2026-07-03). Defines the V2 Firefox parity scope and permission
posture.

## Context

The PRD lists "Firefox support" as a V2 feature (PRD section 7.3, line 310). The
MVP extension is Chromium-first via WXT (ADR-006). WXT supports multiple browser
targets, but Firefox has separate manifest requirements, API differences
(`browser.*` vs `chrome.*`), and a different debugger and permissions story.

The risk is that Firefox support silently weakens the permission posture: a
mandatory `chrome.debugger`-equivalent, a broad `<all_urls>` host permission, or
an overclaimed parity beyond what is tested. The relevant guardrails from
[AGENTS.md](../../AGENTS.md): **Do not require `chrome.debugger`** (the extension
works without it), no `<all_urls>`, no broad host permissions. Decision D35 set
loopback-only host permissions for the Chromium build.

## Decision

Firefox support is a V2 capability track at a defined parity scope, with the
same minimal permission posture as Chromium.

- **Parity scope.** Firefox targets inspect and read-only parity at the tested
  scope: element selection, inspector, source marker resolution, context export,
  and verification reads. Features not validated on Firefox produce explicit
  unsupported diagnostics rather than silent behavior differences.
- **Manifest differences.** Build and packaging use WXT browser targets and a
  `browser.*` abstraction where it is safe. Manifest differences are validated by
  a Firefox-specific build/package check, not hand-edited per release.
- **No mandatory debugger.** Firefox support does not require a debugger
  permission. The debugger stays optional, as on Chromium (AGENTS.md; ADR-006
  decision D34).
- **No broad host permissions.** Firefox host permissions stay loopback-scoped
  (localhost, 127.0.0.1, [::1]), mirroring the Chromium posture (D35). There is
  no `<all_urls>` and no broad host permission. A manifest containing either
  fails validation.
- **Separate validation matrix.** Firefox has its own automated compatibility
  checks. The claim of support is bounded by what the matrix tests, not by an
  open-ended "Firefox works" assertion.

## Consequences

- Firefox users get a safe, read-parity experience at V2 without a weakened
  permission posture.
- A feature that cannot be validated on Firefox is reported as unsupported, not
  shipped silently. The final scope-fidelity review (plan F4) checks this.
- Adding a debugger-dependent feature requires opting into the debugger
  explicitly; it is never mandatory.

## MVP Guardrail

This ADR protects the V2 Firefox feature (PRD 7.3, line 310) from weakening the
permission and privacy posture. It restates the AGENTS.md guardrails verbatim: no
mandatory `chrome.debugger`, no `<all_urls>`, no broad host permissions. Firefox
support claims are bounded by the tested parity scope, so the extension cannot
overclaim support where validation is absent.
