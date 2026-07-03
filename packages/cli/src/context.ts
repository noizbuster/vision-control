/**
 * Shared CLI context: daemon and MCP endpoint discovery from environment.
 */

export interface CliContext {
  readonly daemonUrl: string;
  readonly mcpEndpoint?: { readonly url: string; readonly token?: string };
}

const DEFAULT_DAEMON_URL = "http://127.0.0.1:4321";

/** Build a CliContext from environment variables. */
export function createContext(env: NodeJS.ProcessEnv = process.env): CliContext {
  const daemonUrl = env.VC_DAEMON_URL ?? DEFAULT_DAEMON_URL;
  const mcpUrl = env.VC_MCP_URL;
  const mcpToken = env.VC_MCP_TOKEN;
  return {
    daemonUrl,
    ...(mcpUrl !== undefined
      ? { mcpEndpoint: { url: mcpUrl, ...(mcpToken !== undefined ? { token: mcpToken } : {}) } }
      : {}),
  };
}
