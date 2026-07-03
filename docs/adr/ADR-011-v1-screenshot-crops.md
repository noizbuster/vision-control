# ADR-011: V1 element screenshot crops

## Status

Accepted (2026-07-03). Extends [ADR-009](./ADR-009-privacy-redaction.md), which
deferred screenshots entirely from the MVP.

## Context

The PRD lists "element screenshot crop" as a V1 feature (PRD section 7.2, line
296). ADR-009 removed screenshots from the MVP because a captured image of the
DOM is a privacy surface: it can contain entered text, credential inputs, hidden
auth tokens, or unrelated private DOM that the deny-by-default text redaction
layer cannot reach.

The PRD open questions (section 40, line 2698) leave the screenshot retention
period undecided, and Appendix D constraint 6 (line 2901) requires that no
sensitive DOM or network data enters the default context. The V1 work plan
(`.omo/plans/vision-control-v1-v2.md`, todo 15) implements the crop and the
masking/retention policy together, with a hard gate that an unmasked private or
credential field fails the screenshot test.

Relevant guardrails from [AGENTS.md](../../AGENTS.md) and the plan's "Must NOT
have" list: no screenshot, share bundle, context export, evidence file, audit
log, or collaboration payload may contain passwords, cookies, auth headers,
hidden auth tokens, private keys, bearer tokens, unrelated DOM, or network
bodies. See [security-privacy.md](../agents/security-privacy.md).

## Decision

V1 element screenshot crops are opt-in, local, redacted, masked, and
short-retention. The rules:

- **Opt-in capture.** No screenshot is captured unless the user or an explicit
  operation requests it. Screenshots are excluded from every default context
  export and every share bundle. A context export carries screenshot metadata
  (a reference) only when the caller explicitly opts in.
- **Local storage.** Crops are written to local artifact storage only. They are
  never uploaded, relayed, or attached to a network payload. Storage records
  metadata, a content hash, and a path.
- **Redaction and masking.** Before capture, the pipeline masks `[data-private]`
  regions, credential inputs (password, credit card), hidden auth tokens, and
  any region flagged by the ADR-009 redaction rules. The crop is checked a second
  time after capture so an overlay or late-rendered value cannot leak through.
- **Short retention.** The default retention is short and bounded by a cleanup
  task. The retention value answers PRD open question 6 (line 2698) with a
  conservative local default, not an indefinite one.
- **Metadata-only in context.** Context and MCP responses carry the crop as a
  reference plus a redaction report, never as an unredacted image blob.

## Consequences

- A screenshot is never part of the default agent context. An agent that wants a
  visual must request it and receives a redacted artifact plus a report of what
  was masked.
- The verification engine may use a crop as a diff/similarity assertion target,
  but the assertion reads the redacted artifact, and the artifact still obeys
  the retention policy.
- The privacy floor from ADR-009 now extends to the image surface: the failure
  mode to avoid is an unmasked credential in a stored crop, and the V1 test
  suite encodes that failure as a failing test.

## MVP Guardrail

This decision protects the V1 screenshot feature (PRD 7.2, line 296) from
becoming the project's first privacy leak. It restates the AGENTS.md guardrail
that no screenshot payload may contain credentials, auth tokens, or unrelated
private DOM, and that the redaction layer is never bypassed. It deliberately
excludes screenshots from default exports and share bundles until a separate
policy explicitly admits them. A future V2 share bundle (ADR-015) cannot carry a
crop unless the redaction and opt-in rules in this ADR are satisfied first.
