# ADR-009: Privacy redaction policy

## Status

Accepted (2026-07-02).

## Context

The daemon compiles context (JSON and Markdown exports) that a coding agent reads
to understand the page. That context can include DOM structure, computed styles,
element text, and network metadata. Without a redaction policy, sensitive data
can leak into context exports that an agent logs, caches, or sends to an LLM.

The PRD (Appendix D constraint 6, line 2901) requires that sensitive DOM and
network data is not included in context by default.

## Decision

The context compiler applies a redaction layer before any data leaves the daemon.
The policy is deny-by-default: anything that matches a sensitive pattern is
redacted unless explicitly allowed.

Redacted categories:

- **Cookies and auth headers**: never exported. The daemon strips them before
  assembling context.
- **Form values**: password fields, credit card inputs, and hidden auth tokens
  are redacted. Their presence is noted but their values are not.
- **Secrets in text**: strings matching common secret patterns (API keys,
  bearer tokens, private keys) are masked.
- **Network payloads**: request and response bodies are not included. Only method,
  URL, and status are exported.
- **Screenshots**: element screenshot crops are a V1 feature (PRD section 7.2,
  line 296). In the MVP, no screenshots are captured or exported.

The daemon produces a redaction report alongside each context export. The report
lists how many items were redacted and by which rule, without revealing the
redacted values. This gives the agent enough signal to know context was filtered
without exposing the filtered data.

## Consequences

- Context exports are safe to share with an LLM. An agent can log them, cache
  them, or send them upstream without leaking credentials.
- The redaction report is the audit surface. If an agent acts on redacted data,
  the report shows what was hidden.
- False positives are possible: a non-sensitive string that matches a secret
  pattern gets masked. This is acceptable. False negatives (leaking a real
  secret) are the failure mode to avoid.
- The `packages/security` package owns the redaction rules. It is TDD-first
  (ADR-004) because a redaction bug is a security bug.

## MVP Guardrail

Deny-by-default redaction is the privacy floor for a tool that reads DOM and
network data and exports it to an agent. Without it, every context export is a
potential credential leak. This decision protects the MVP from the worst privacy
outcome: shipping a tool that silently exfiltrates passwords or tokens. The
redaction report gives reviewers a way to audit what was filtered without
re-exposing the data. Screenshots are deferred entirely, removing that surface
from the MVP.
