# change-ir schema version

Current: **2.1.0** (see `CHANGE_IR_SCHEMA_VERSION` in `changeset-schema.ts`).

## Versioning rule

The change-ir operation union is versioned semver-style. Adding an operation
kind is a MINOR bump (additive): older consumers that do not recognise the new
`kind` discriminator will reject it via `z.discriminatedUnion` rather than
silently misinterpreting it, so the wire is safe within a major. Removing or
renaming a kind, or changing a field shape, is a MAJOR bump.

## 2.1.0 (additive — paired flex resize)

Added the `resize-flex-pair` operation. One operation carries the durable
container and primary target identities, exactly one `primary` and one
`neighbor` member, both members' before/after flex triples and used main sizes,
the container rectangle transition, every non-pair rectangle witness, logical
and physical axis metadata, and the signed delta.

The canonical writer emits `2.1.0`. `ChangeSetSchema`, `serializeChangeSet`, and
`deserializeChangeSet` accept a valid `2.0.0` document through the explicit
compatibility boundary and return `2.1.0`. A stale `2.0.0` document cannot carry
`resize-flex-pair`; that kind is rejected until the version is 2.1.0.

Pair inversion swaps every member/container/witness before/after value and
negates delta. Pair merge conflicts use six common CSS slots: `flex-grow`,
`flex-shrink`, and `flex-basis` for each of the two members.

Real Chromium coverage in `apps/extension/e2e/flex-pair-flow.spec.ts` proves the
kind remains one preview transaction, one journal row, and one Undo/Redo command
through row/column/reverse/RTL/vertical flows. This coverage does not change the
wire shape, so the canonical version remains `2.1.0` (context `1.2.0`, extension
snapshot `1.1.0`).

## 2.0.0 (breaking — PRD §12.2 ChangeSet reshape)

The ChangeSet **container** was reshaped to the full PRD §12.2 shape. The
operation union itself is unchanged (the 22 kinds from 1.0.0/1.1.0 carry
through), so this is a container-level breaking change, not an operation-level
one.

New required fields on every ChangeSet:

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `"2.0.0"` | legacy literal; canonicalized to `"2.1.0"` on ingestion |
| `workspaceId` | `string` | workspace the set belongs to |
| `page` | `PageContext` | `{ url, title }` — page the set was captured against |
| `viewport` | `ViewportContext` | `{ width, height }` — viewport in effect |
| `title?` | `string` | optional human label |
| `userInstruction?` | `string` | optional natural-language instruction |
| `selectedTargets` | `ElementRef[]` | elements in scope |
| `sourceResolutions` | `SourceResolution[]` | resolved source mappings |
| `verificationPlan` | `VerificationPlan` | `{ assertions, notes }` |
| `privacyReport` | `PrivacyReport` | `{ redactions, totalRedacted, note? }` |

Carried forward from v1: `id`, `sessionId`, `createdAt`, `updatedAt`,
`operations`, `committed`, `supersededBy?`. `createdAt`/`updatedAt` stay epoch
milliseconds (the PRD §12.2 interface sketches them as `string`, but the
existing serialization contract and every consumer use epoch ms; the format is
unchanged to keep the wire stable within the reshape).

A v1 (≤ 1.1.0) document does **not** parse against the v2 schema — it is
missing `schemaVersion` and the required context fields. Use
`migrateChangeset_1_to_2(v1Json)` to lift a v1 document to a valid current set. The
migrator applies the R8 binding defaults for the absent fields (empty
`selectedTargets`/`sourceResolutions`, sentinel `page`/`viewport`, stub
`verificationPlan`/`privacyReport` carrying a "recompute via engine" note,
`workspaceId` defaulting to the `"<unknown>"` sentinel) and re-validates the
result through the canonical schema. The migration is covered by round-trip and
rejection tests in `changeset-schema.test.ts` and `serialization.test.ts`.

The new context types (`PageContext`, `ViewportContext`, `SourceResolution`,
`VerificationPlan`) live in `src/context.ts`; the real `PrivacyReport` lives in
`src/privacy.ts` (the v1 `PrivacyReportPlaceholder` was replaced).

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
