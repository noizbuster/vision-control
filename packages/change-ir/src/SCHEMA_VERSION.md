# change-ir schema version

Current: **1.1.0** (see `CHANGE_IR_SCHEMA_VERSION` in `changeset.ts`).

## Versioning rule

The change-ir operation union is versioned semver-style. Adding an operation
kind is a MINOR bump (additive): older consumers that do not recognise the new
`kind` discriminator will reject it via `z.discriminatedUnion` rather than
silently misinterpreting it, so the wire is safe within a major. Removing or
renaming a kind, or changing a field shape, is a MAJOR bump.

## 1.1.0 (additive — V1 operation kinds)

Added 14 operation kinds on top of the 8 MVP kinds. All are additive: each is a
new `z.literal("kind")` member of `OperationSchema`, every one has an inverse
branch in `computeInverse` (the exhaustive `never` switch makes a missing branch
a compile error), and serialization/deserialization round-trips them generically
through `ChangeSetSchema`.

| Kind | File | Inverse |
| --- | --- | --- |
| `multi-select-group` | `operations/multi-select.ts` | swap `targets`/`previousTargets` |
| `group-reorder` | `operations/multi-select.ts` | swap `previousOrder`/`newOrder` |
| `group-reparent` | `operations/multi-select.ts` | swap source/target parent+indices |
| `align-elements` | `operations/multi-select.ts` | swap `previousValues`/`newValues` |
| `distribute-elements` | `operations/multi-select.ts` | swap `previousGaps`/`newGaps` |
| `set-container-layout` | `operations/container-layout.ts` | swap `value`/`previousValue` |
| `set-child-sizing` | `operations/container-layout.ts` | swap sizing + value pairs |
| `grid-reorder` | `operations/grid.ts` | swap indices + grid areas |
| `grid-span` | `operations/grid.ts` | swap `fromSpan`/`toSpan` |
| `breakpoint-style-edit` | `operations/breakpoint.ts` | swap `value`/`previousValue` |
| `breakpoint-class-edit` | `operations/breakpoint.ts` | swap old/new class |
| `breakpoint-text-edit` | `operations/breakpoint.ts` | swap `newText`/`previousText` |
| `screenshot-crop-ref` | `operations/screenshot.ts` | no-op marker (metadata ref) |
| `suggested-diff` | `operations/suggested-diff.ts` | no-op marker (inert data, ADR-012) |

`screenshot-crop-ref` and `suggested-diff` inverses are no-op markers: they carry
no source state, so the inverse re-emits the same data with a fresh id and
`inverseOf` linking back. `suggested-diff` is NEVER applied by the runtime or the
MCP server — it is inert candidate data (ADR-012).

## 1.0.0 (MVP)

The 8 MVP kinds: `style-edit`, `class-add`, `class-remove`, `class-replace`,
`text-edit`, `reorder-child`, `reparent-element`, `resize-element`.
