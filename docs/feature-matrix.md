# Vision Control Feature Matrix

Status of every feature by release track. **MVP** = v0.1.0 scope (PRD 7.1).
**V1** = v0.2.0 V1 scope (PRD 7.2). **V2** = v0.2.0 V2 scope (PRD 7.3, partial).

Legend: **done** (implemented and tested), **partial** (implemented with a
documented scope boundary), **advisory** (suggestions only, never auto-applied),
**deferred** (explicitly out of scope for v0.2.0).

---

## Extension / editing surface

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| Single-element selection + inspector | done | — | Shadow-DOM overlay, picker, breadcrumb. |
| Style / class / text editors | done | — | CSS property allowlist; `runtime` flag. |
| Semantic resize + guarded reparent | done | — | Normal-flow drag never collapses to absolute. |
| Flex reorder | done | — | Single-element. |
| Multi-select (marquee + group) | — | done | Group overlay; parallel-triples reducer. |
| Group move (reorder / reparent) | — | done | Per-element source refs; D41 guard. |
| Auto Layout (Hug / Fill / Fixed) | — | done | Context-sensitive per parent layout. |
| CSS Grid reorder + grid-span | — | done | DOM-order vs grid-area; a11y reading-order guard. |
| Alignment + distribution (10 cmds) | — | done | Parent layout property or child alignment, never transforms. |
| Breakpoint context + scoped edits | — | done | `applyToBase` guard; breakpoint confidence UI. |
| Component props editing | — | done | Safe source-ownership rules; cross-boundary opt-in. |
| Confidence detail UI | — | done | Method/reason badges; selected + alternatives. |

## Source resolution

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| Dev-only source markers (Vite + React) | done | — | Opaque `data-vc-source`; production untouched. |
| Source registry + resolver | done | — | Never-wrong-HIGH cascade. |
| Workspace file index | done | — | Node-only. |
| CSS class-token scanning | done | — | Line-based. |
| Tailwind token-aware editing | — | done | v3 config parse; v4-ready seam. |
| CSS Modules mapping | — | done | Manifest + source-map; compose tracing. |
| Next.js integration | — | done | App + pages router; webpack loader. |
| Vue adapter | — | done | Lightweight template scanner; diagnostics. |
| Svelte adapter | — | done | Lightweight markup scanner; diagnostics. |
| CSS-in-JS adapters | — | done | Static=HIGH; dynamic=agent-required. |
| Pseudo-element editing | — | done | `::before`/`::after` preview seam. |
| Vanilla CSS | — | done | Plain CSS class tokens. |
| Design token registry | — | done | Multi-source ingest; conflict detection. |

## Suggestions, verification, and context

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| HMR verification engine | done | — | Preview cleared before assertions. |
| Change IR + inverses | done (8 kinds) | done (+14 kinds) | Lossless undo/redo. |
| Deterministic patch suggestions | — | done | Inert `suggestedDiff` data; no MCP write tool. |
| Optional direct codemod | — | done | Local CLI/agent action; `--confirm` + source verify. |
| Context export (JSON + Markdown) | done | done | V1 sections added. |
| MCP server (read-only, 11 tools) | done | — | stdio + loopback HTTP. No source-mutating tool. |
| Element screenshot crops | — | done | Opt-in, redacted, short-retention (ADR-011). |

## V2 capabilities (partial)

| Feature | V2 (v0.2.0) | Status | Notes |
|---|---|---|---|
| Firefox support | partial | Tested-scope parity | Build/package validates; no broad hosts, optional debugger (ADR-016). Browser-driven checks are stubbed. |
| Accessibility repair | advisory | Advisory suggestions | Role/name, label/control, focus order, DOM-vs-visual order, keyboard nav. Never auto-mutates (ADR-017). |
| Collaboration / sharing | partial | Local bundles only | Redacted, signed, token-free export/import. Remote deferred (ADR-018). |
| Pi / OpenCode adapters | done | Examples | MCP config builders + workflow docs. |

## Explicitly deferred (not in v0.2.0)

- Remote real-time collaboration (ADR-018: needs identity, revocation,
  encryption, transport policy).
- Firefox parity beyond the tested matrix (ADR-016).
- Automated accessibility repair beyond advisory suggestions (ADR-017).
- Turbopack marker injection (diagnostic-only; webpack path is supported).
- Dynamic CSS-in-JS HIGH-confidence resolution (always agent-required).
- Tailwind v4 theme variable resolution (v4-ready seam exists; not implemented).

See [known-limitations.md](./known-limitations.md) for details.
