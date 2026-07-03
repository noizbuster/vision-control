/**
 * Stub dependency provider for the MCP server.
 *
 * Returns empty/stub data when no daemon is connected. This lets the MCP
 * server run standalone over stdio for structural testing — every tool
 * responds with a clear "no daemon connected" message rather than failing.
 *
 * The daemon replaces this with a real `McpServerDeps` implementation that
 * reads from storage, the protocol layer, and the running session.
 */

import type { McpServerDeps } from "./types.js";

const NO_DAEMON_NOTE = "no daemon connected — start the daemon and reconnect for live data";

export function createStubDeps(): McpServerDeps {
  return {
    async getActiveSession() {
      return {
        sessionId: "stub",
        workspaceId: "stub",
        connected: false,
        protocolVersion: "1.0.0",
      };
    },
    async getSelection() {
      return {
        sessionId: "stub",
        elementTag: "unknown",
        selector: undefined,
        sourceId: undefined,
        textPreview: undefined,
      };
    },
    async getChangeset() {
      return { sessionId: "stub", operationCount: 0, operations: [] };
    },
    async getSourceContext() {
      return undefined;
    },
    async getVerificationPlan() {
      return { assertions: [], notes: NO_DAEMON_NOTE };
    },
    async getDiagnostics() {
      return [];
    },
    async captureElement() {
      return { captured: false, selector: undefined, sourceId: undefined, note: NO_DAEMON_NOTE };
    },
    async requestVerification() {
      return { acknowledged: false, message: NO_DAEMON_NOTE };
    },
    async clearPreview() {
      return { acknowledged: false, message: NO_DAEMON_NOTE };
    },
    async markPatchStarted() {
      return { acknowledged: false, message: NO_DAEMON_NOTE };
    },
    async markPatchCompleted() {
      return { acknowledged: false, message: NO_DAEMON_NOTE };
    },
  };
}
