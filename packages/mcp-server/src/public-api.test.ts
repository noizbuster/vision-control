import { describe, expect, it } from "vitest";

import * as mcpServerPublicApi from "./index.js";

describe("mcp-server public API", () => {
  it("does not expose daemon-backed dependencies when the package barrel is imported", () => {
    const exportedNames = Object.keys(mcpServerPublicApi);

    expect(exportedNames).not.toContain("createDaemonMcpDeps");
  });
});
