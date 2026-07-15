# Sample agent prompts for OpenCode

Copy-paste prompts that exercise the read-only MCP workflow. None of them ask
the MCP server to write source. File changes always go through your own
file-editing tools. The MCP server reads context and emits coordination signals.

For the config that makes these work, see
[opencode.stdio.json](./opencode.stdio.json) or
[opencode.http.json](./opencode.http.json), and the
[README](../README.md).

## 1. Inspect and report (no edits)

Use this first to confirm the connection and understand what the user changed.

```
You are connected to the vision-control MCP server.

1. Call vision_get_active_session. Confirm the connection state and report the
   session id.
2. Call vision_get_source_context with format "markdown".
3. Summarize: the user's goal, the selected element, every pending operation,
   and any suggestedDiff.
4. Do not edit any files. Report only.
```

## 2. Apply a high-confidence suggestion safely

The deterministic path. The suggestion is inert data; you apply it yourself.

```
You are connected to the vision-control MCP server. The server is read-only:
there is no tool that writes source.

1. Call vision_get_source_context with format "json".
2. Find the suggestedDiff entry whose confidence is "high". If none exists, stop
   and report that no deterministic suggestion is available.
3. Check every precondition in that suggestion. If any precondition does not
   hold, stop and report which one failed.
4. Call vision_mark_patch_started with a patchId of "patch-button-color" and a
   short description.
5. Apply the diff from the suggestion to the file it names. Use your own
   file-editing tools. Do not call any tool that applies a patch; none exists.
6. Save the file so HMR runs.
  7. Call vision_request_verification. Read vision_get_verification_plan.
  8. Call vision_mark_patch_completed with the same patchId and success set to

   whether every assertion passed.
9. Report which assertions passed and which failed. If any failed, name the DOM
   property that diverges. Do not edit anything else.
```

## 3. Verify after a manual edit

Use this when you (or the user) edited a file by hand and you need to prove the
runtime now matches the preview.

```
You are connected to the vision-control MCP server.

I just edited src/components/Button.tsx by hand.

1. Call vision_request_verification.
2. Call vision_get_verification_plan.
3. Tell me whether the post-HMR DOM matches the preview. If any assertion
   failed, name the property and the expected vs actual value. Do not edit any
   files.
```

## 4. Read the changeset and clear a stale preview

Use this to inspect pending operations and discard a preview that should not
ship.

```
You are connected to the vision-control MCP server.

1. Call vision_get_changeset. List every operation with its id, kind, and
   description.
2. If the changeset contains only runtime preview mutations (runtime: true),
   call vision_clear_preview to discard them.
3. Confirm by calling vision_get_changeset again and reporting the result.
4. Do not edit any files.
```

## 5. Multi-step edit with coordination signals

Use this for a real editing loop that keeps the runtime informed across an
external patch cycle.

```
You are connected to the vision-control MCP server. The server is read-only.

1. Call vision_get_selection and vision_get_source_context with format "json".
   Report the selected element and its source candidate.
2. Plan the edit you intend to make to match the user's goal. Do not apply it
   yet.
3. Call vision_mark_patch_started with patchId "patch-1" and a description of
   the planned edit.
4. Apply the edit through your own file-editing tools and save the file.
5. Call vision_request_verification.
6. Call vision_mark_patch_completed with patchId "patch-1" and success based on
   the verification result.
7. Read vision_get_verification_plan. Summarize pass/fail per assertion.
```

## Rules every prompt follows

- The MCP server is read-only. Never call or invent a tool that writes,
  applies, or codemods source. None exists.
- A `suggestedDiff` is data, not an action. You apply it through your own tools.
- `vision_mark_patch_started` and `vision_mark_patch_completed` are coordination
  signals that frame an external patch cycle. They never modify a file.
- Verification (`vision_request_verification`, `vision_mark_patch_completed`)
  runs read-only assertions against the post-HMR DOM. A pass means the source
  you wrote produces the visual state the user asked for.
