/**
 * Stub dependency provider for the MCP server.
 *
 * Returns empty/stub data when the extension is not paired. This lets the MCP
 * server run standalone over stdio for structural testing — every tool
 * responds with a clear "not paired" message rather than failing.
 *
 * Live data arrives via the extension bridge projection (ADR-020). No daemon
 * and no VC_DAEMON_URL are required to start the server.
 */

import type { McpServerDeps } from "./types.js";

const NOT_PAIRED_NOTE = "not paired — pair the extension to the MCP bridge for live data";

export function createStubDeps(): McpServerDeps {
  return {
    async getActiveSession() {
      return {
        sessionId: "none",
        workspaceId: "none",
        connected: false,
        protocolVersion: "2.0.0",
        note: NOT_PAIRED_NOTE,
      };
    },
    async getSelection() {
      return {
        sessionId: "none",
        elementTag: "unknown",
        selector: undefined,
        sourceId: undefined,
        textPreview: undefined,
      };
    },
    async getChangeset() {
      return { sessionId: "none", operationCount: 0, operations: [] };
    },
    async getSourceContext() {
      return undefined;
    },
    async getVerificationPlan() {
      return { assertions: [], notes: NOT_PAIRED_NOTE };
    },
    async getDiagnostics() {
      return [];
    },
    async captureElement() {
      return { captured: false, selector: undefined, sourceId: undefined, note: NOT_PAIRED_NOTE };
    },
    async requestVerification() {
      return { acknowledged: false, message: NOT_PAIRED_NOTE };
    },
    async clearPreview() {
      return { acknowledged: false, message: NOT_PAIRED_NOTE };
    },
    async markPatchStarted() {
      return { acknowledged: false, message: NOT_PAIRED_NOTE };
    },
    async markPatchCompleted() {
      return { acknowledged: false, message: NOT_PAIRED_NOTE };
    },
  };
}
