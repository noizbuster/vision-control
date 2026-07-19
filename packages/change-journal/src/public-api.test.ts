import { describe, expect, it } from "vitest";

import * as changeJournalPublicApi from "./index.js";

describe("change-journal public API", () => {
  it("does not expose daemon synchronization when the package barrel is imported", () => {
    const exportedNames = Object.keys(changeJournalPublicApi);

    expect(exportedNames).not.toContain("syncToDaemon");
    expect(exportedNames).not.toContain("restoreFromDaemon");
  });
});
