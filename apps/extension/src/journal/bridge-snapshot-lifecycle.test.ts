import type { BridgeClient } from "@vision-control/bridge-client";
import { createJournal } from "@vision-control/change-journal";
import { describe, expect, it, vi } from "vitest";

import { createBridgeSnapshotPushController } from "./bridge-snapshot-push.js";

function createLifecycleProbe(state: "connected" | "disconnected" = "connected") {
  const clearTab = vi.fn<BridgeClient["clearTab"]>();
  const focusTab = vi.fn<BridgeClient["focusTab"]>();
  const client: Pick<BridgeClient, "state" | "pushSnapshot" | "clearTab" | "focusTab"> = {
    state,
    pushSnapshot: vi.fn(),
    clearTab,
    focusTab,
  };
  const controller = createBridgeSnapshotPushController({
    getClient: () => client,
    getJournal: () => createJournal(),
    getSessionId: (tabId) => `session-${tabId}`,
  });
  return { clearTab, controller, focusTab };
}

describe("bridge snapshot tab lifecycle", () => {
  it("projects a closed tab generation before clearing local snapshot state", () => {
    const probe = createLifecycleProbe();

    probe.controller.clearTab(17);

    expect(probe.clearTab).toHaveBeenCalledWith({ tabId: "17", sessionId: "session-17" });
  });

  it("projects the last-focused paired tab without pushing a new snapshot", () => {
    const probe = createLifecycleProbe();

    probe.controller.focusTab(23);

    expect(probe.focusTab).toHaveBeenCalledWith({ tabId: "23", sessionId: "session-23" });
  });

  it("keeps lifecycle facts local while the bridge is disconnected", () => {
    const probe = createLifecycleProbe("disconnected");

    probe.controller.clearTab(17);
    probe.controller.focusTab(23);

    expect(probe.clearTab).not.toHaveBeenCalled();
    expect(probe.focusTab).not.toHaveBeenCalled();
  });
});
