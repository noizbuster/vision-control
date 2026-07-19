import { describe, expect, it } from "vitest";

import {
  bridgeLifecycleSchemas,
  ProjectionTabClosedSchema,
  ProjectionTabFocusedSchema,
  parseMessage,
} from "./index.js";

describe("ADR-020 bridge tab lifecycle catalog", () => {
  it("contains exactly the closed and focused projection facts", () => {
    expect(bridgeLifecycleSchemas).toEqual([ProjectionTabClosedSchema, ProjectionTabFocusedSchema]);
  });

  it.each([
    {
      type: "projection.tab.closed",
      tabId: "tab-7",
      sessionId: "session-7",
    },
    {
      type: "projection.tab.focused",
      tabId: "tab-7",
      sessionId: "session-7",
    },
  ])("parses $type through the public message union", (payload) => {
    const result = parseMessage(payload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(payload);
  });
});
