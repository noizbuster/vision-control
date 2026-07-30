<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# element-identity

## Purpose

Isomorphic element identity primitives: ElementRef, fingerprints, selectors, selection identity, multi-select identity, runtime/source separation helpers. Leaf dependency for geometry, layout, IR, overlay.

Package: `@vision-control/element-identity` · Nx project typically `element-identity`.

## Key Files

| File | Description |
|------|-------------|
| `src/element-ref.ts` | ElementRef + schema |
| `src/fingerprint.ts` | computeFingerprint |
| `src/selection-identity.ts` | Selection identity model |
| `src/multi-select-identity.ts` | Multi-select identity |
| `src/selectors.ts` | Selector helpers |
| `src/runtime-source-separation.ts` | Runtime vs source identity separation |
| `src/dom-free.test.ts` | DOM-free guard |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/__fixtures__/` | Fixtures |

## For AI Agents

### Working In This Directory

- Identity must survive HMR better than raw CSS selectors alone — prefer durable fields.
- Keep package DOM-free; callers supply attributes/snapshots.

### Testing Requirements

```bash
pnpm nx run element-identity:typecheck
pnpm nx run element-identity:test
pnpm nx run element-identity:build
```

index + multi-select identity + dom-free tests.

### Common Patterns

- Zod schemas next to types.
- Fixture-driven identity cases.

### Anti-Patterns

- No document.querySelector inside this package.
- No chrome.* APIs.

## Dependencies

### Internal

- None beyond workspace public APIs as needed.

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
