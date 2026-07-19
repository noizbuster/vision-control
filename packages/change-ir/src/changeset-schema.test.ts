import { describe, expect, it } from "vitest";

import {
  appendOperation,
  CHANGE_IR_SCHEMA_VERSION,
  ChangeSetSchema,
  createChangeSet,
  migrateChangeset_1_to_2,
  migrateChangeset_2_0_to_2_1,
  removeOperation,
  withPrivacyReport,
} from "./index.js";
import {
  BASE_TIME,
  flexPairOperation,
  legacy20Defaults,
  styleEdit,
} from "./test-support/change-ir-fixtures.js";

const legacy20Document = () => ({
  ...legacy20Defaults,
  id: "cs-legacy-20001",
  sessionId: "sess-legacy-2001",
  operations: [styleEdit()],
  createdAt: BASE_TIME,
  updatedAt: BASE_TIME + 1,
  committed: false,
});

describe("canonical changeset schema", () => {
  it("creates an empty 2.1.0 changeset with all required context", () => {
    const changeSet = createChangeSet({
      workspaceId: "ws-create001",
      sessionId: "sess-create001",
      now: BASE_TIME,
    });
    expect({
      schemaVersion: changeSet.schemaVersion,
      operations: changeSet.operations,
      committed: changeSet.committed,
      page: changeSet.page,
      viewport: changeSet.viewport,
    }).toEqual({
      schemaVersion: "2.1.0",
      operations: [],
      committed: false,
      page: { url: "<unknown>", title: null },
      viewport: { width: 0, height: 0 },
    });
    expect(CHANGE_IR_SCHEMA_VERSION).toBe("2.1.0");
  });

  it("appends and removes operations without mutating or prematurely migrating legacy input", () => {
    const appended = appendOperation(legacy20Document(), styleEdit());
    expect(appended.schemaVersion).toBe("2.0.0");
    expect(appended.operations).toHaveLength(2);
    const removed = removeOperation(appended, "op-style-00001");
    expect(removed.operations).toEqual([]);
  });

  it("stamps a privacy report without mutating the input", () => {
    const original = createChangeSet({
      workspaceId: "ws-privacy",
      sessionId: "sess-privacy",
      now: BASE_TIME,
    });
    const report = {
      redactions: [
        {
          field: "target.attributes.value",
          patternId: "password-input",
          description: "masked",
          source: "selector" as const,
        },
      ],
      totalRedacted: 1,
    };
    const stamped = withPrivacyReport(original, report);
    expect(stamped.privacyReport).toEqual(report);
    expect(original.privacyReport.totalRedacted).toBe(0);
  });

  it("honors explicit context and labels", () => {
    const changeSet = createChangeSet({
      workspaceId: "ws-override",
      sessionId: "sess-override",
      page: { url: "https://localhost/app", title: "App" },
      viewport: { width: 1920, height: 1080 },
      title: "Custom",
      userInstruction: "fix header",
    });
    expect({
      page: changeSet.page,
      viewport: changeSet.viewport,
      title: changeSet.title,
      userInstruction: changeSet.userInstruction,
    }).toEqual({
      page: { url: "https://localhost/app", title: "App" },
      viewport: { width: 1920, height: 1080 },
      title: "Custom",
      userInstruction: "fix header",
    });
  });
});

describe("changeset migrations", () => {
  it("canonicalizes a literal 2.0.0 document to 2.1.0 without losing data", () => {
    const migrated = migrateChangeset_2_0_to_2_1(legacy20Document());
    expect(migrated).toEqual({ ...legacy20Document(), schemaVersion: "2.1.0" });
  });

  it("rejects a stale 2.0.0 document carrying the 2.1-only pair kind", () => {
    const stale = { ...legacy20Document(), operations: [flexPairOperation()] };
    expect(() => migrateChangeset_2_0_to_2_1(stale)).toThrow();
    expect(ChangeSetSchema.safeParse(stale).success).toBe(false);
  });

  it("migrates v1 context with literal defaults into canonical 2.1.0", () => {
    const migrated = migrateChangeset_1_to_2({
      id: "cs-v1-0001",
      sessionId: "sess-v1-0001",
      operations: [styleEdit()],
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME + 1,
      committed: true,
    });
    expect({
      schemaVersion: migrated.schemaVersion,
      workspaceId: migrated.workspaceId,
      page: migrated.page,
      viewport: migrated.viewport,
      selectedTargets: migrated.selectedTargets,
      sourceResolutions: migrated.sourceResolutions,
      verificationPlan: migrated.verificationPlan,
      privacyReport: migrated.privacyReport,
      committed: migrated.committed,
    }).toEqual({
      schemaVersion: "2.1.0",
      workspaceId: "<unknown>",
      page: { url: "<unknown>", title: null },
      viewport: { width: 0, height: 0 },
      selectedTargets: [],
      sourceResolutions: [],
      verificationPlan: {
        assertions: [],
        notes: "migrated from v1 — recompile via verification engine",
      },
      privacyReport: {
        redactions: [],
        totalRedacted: 0,
        note: "migrated v1 — recompute via redaction engine",
      },
      committed: true,
    });
  });

  it("preserves v1 supersession and rejects malformed legacy operations", () => {
    const valid = migrateChangeset_1_to_2({
      id: "cs-v1-0001",
      sessionId: "sess-v1-0001",
      operations: [styleEdit()],
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
      committed: false,
      supersededBy: "cs-v1-newer01",
    });
    expect(valid.supersededBy).toBe("cs-v1-newer01");
    expect(() =>
      migrateChangeset_1_to_2({
        id: "cs-v1-0001",
        sessionId: "sess-v1-0001",
        operations: [{ kind: "style-edit", id: "x" }],
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      }),
    ).toThrow();
  });
});
