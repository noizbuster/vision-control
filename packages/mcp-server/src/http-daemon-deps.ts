/**
 * Loopback HTTP daemon client → {@link DaemonMcpDepsServices}.
 *
 * {@link createHttpDaemonServices} adapts a daemon reachable over loopback HTTP
 * (the URL passed via `VC_DAEMON_URL`) into the read-side service ports that
 * {@link createDaemonMcpDeps} consumes. Each read method fetches fresh JSON from
 * the daemon; a network error or non-200 response resolves to `undefined`, so
 * {@link createDaemonMcpDeps} degrades honestly to a "no active session" shape
 * rather than throwing or silently swapping in stub data.
 *
 * The daemon read contract (served under `VC_DAEMON_URL`):
 *
 *   GET `${baseUrl}/mcp-read/active-session`
 *     → 200 `ActiveSessionRead` | 404 (no active session)
 *   GET `${baseUrl}/mcp-read/selection?sessionId=<id>`
 *     → 200 `SelectionChangedRead` | 404
 *   GET `${baseUrl}/mcp-read/changeset?sessionId=<id>`
 *     → 200 `CurrentChangesetRead` | 404
 *
 * This is the loopback HTTP daemon client: it uses plain `fetch` (the Node 22+
 * global), narrowed through a small {@link DaemonHttpResponse} interface so
 * tests inject a fake without depending on the global `Response` shape. The
 * `@vision-control/daemon-client` package is WebSocket + pairing-token based and
 * is NOT used here — the stdio binary has no pairing token and speaks plain HTTP
 * to the daemon, which keeps `mcp-server` free of that runtime dependency.
 *
 * Wire payloads are narrowed through explicit type guards (parse-don't-validate
 * at the network boundary); no `any` or `as` reaches the decoded values.
 */

import type {
  ActiveSessionRead,
  ChangesetServiceRead,
  CurrentChangesetRead,
  DaemonMcpDepsServices,
  SelectionChangedRead,
  SessionServiceRead,
} from "./daemon-deps.js";
import type { ChangesetOperationSummary } from "./types.js";

/** Read paths the daemon serves under `VC_DAEMON_URL`. */
export const ACTIVE_SESSION_PATH = "/mcp-read/active-session";
export const SELECTION_PATH = "/mcp-read/selection";
export const CHANGESET_PATH = "/mcp-read/changeset";

/** Narrow response surface the client depends on (global `fetch` satisfies it). */
export interface DaemonHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/** Injectable HTTP fetcher. Defaults to the Node 22+ global `fetch`. */
export type DaemonHttpFetch = (url: string) => Promise<DaemonHttpResponse>;

export interface CreateHttpDaemonServicesOptions {
  /** Override the global fetch (tests inject a fake). */
  readonly fetch?: DaemonHttpFetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeActiveSession(value: unknown): ActiveSessionRead | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.sessionId !== "string") return undefined;
  if (typeof value.workspaceId !== "string") return undefined;
  if (typeof value.connected !== "boolean") return undefined;
  if (typeof value.protocolVersion !== "string") return undefined;
  return {
    sessionId: value.sessionId,
    workspaceId: value.workspaceId,
    connected: value.connected,
    protocolVersion: value.protocolVersion,
    ...(typeof value.clientVersion === "string" ? { clientVersion: value.clientVersion } : {}),
  };
}

function decodeSelectionChanged(value: unknown): SelectionChangedRead | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.elementId !== "string") return undefined;
  if (typeof value.elementTag !== "string") return undefined;
  return {
    elementId: value.elementId,
    elementTag: value.elementTag,
    ...(typeof value.selector === "string" ? { selector: value.selector } : {}),
    ...(typeof value.sourceId === "string" ? { sourceId: value.sourceId } : {}),
    ...(typeof value.textPreview === "string" ? { textPreview: value.textPreview } : {}),
  };
}

function decodeOperation(value: unknown, index: number): ChangesetOperationSummary | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === "string" ? value.id : `op-${index}`;
  const kind = typeof value.kind === "string" ? value.kind : "unknown";
  const runtime = typeof value.runtime === "boolean" ? value.runtime : false;
  const description = typeof value.description === "string" ? value.description : kind;
  return {
    id,
    kind,
    runtime,
    description,
    ...(typeof value.breakpoint === "string" ? { breakpoint: value.breakpoint } : {}),
    ...(typeof value.suggestedDiff === "string" ? { suggestedDiff: value.suggestedDiff } : {}),
    ...(typeof value.artifactId === "string" ? { artifactId: value.artifactId } : {}),
    ...(typeof value.groupId === "string" ? { groupId: value.groupId } : {}),
    ...(typeof value.targetCount === "number" ? { targetCount: value.targetCount } : {}),
  };
}

function decodeCurrentChangeset(value: unknown): CurrentChangesetRead | undefined {
  if (!isRecord(value)) return undefined;
  if (!Array.isArray(value.operations)) return undefined;
  const operations = value.operations
    .map((op, i) => decodeOperation(op, i))
    .filter((op): op is ChangesetOperationSummary => op !== undefined);
  return {
    ...(typeof value.changesetId === "string" ? { changesetId: value.changesetId } : {}),
    operations,
  };
}

/** Fetch + decode one read model; any failure resolves to `undefined`. */
async function fetchReadModel<T>(
  fetchImpl: DaemonHttpFetch,
  url: string,
  decode: (value: unknown) => T | undefined,
): Promise<T | undefined> {
  let response: DaemonHttpResponse;
  try {
    response = await fetchImpl(url);
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return undefined;
  }
  return decode(parsed);
}

/**
 * Build {@link DaemonMcpDepsServices} backed by loopback HTTP reads against
 * `baseUrl` (the `VC_DAEMON_URL` value). Session + changeset read ports are
 * wired; the other ports are intentionally absent so {@link createDaemonMcpDeps}
 * degrades gracefully (selection returns the unknown-element shape, coordination
 * tools report "not wired", etc.).
 */
export function createHttpDaemonServices(
  baseUrl: string,
  options: CreateHttpDaemonServicesOptions = {},
): DaemonMcpDepsServices {
  const fetchImpl: DaemonHttpFetch = options.fetch ?? globalThis.fetch;

  const sessionService: SessionServiceRead = {
    async getActive(): Promise<ActiveSessionRead | undefined> {
      return fetchReadModel(fetchImpl, `${baseUrl}${ACTIVE_SESSION_PATH}`, decodeActiveSession);
    },
    async getLastSelection(sessionId: string): Promise<SelectionChangedRead | undefined> {
      const url = `${baseUrl}${SELECTION_PATH}?sessionId=${encodeURIComponent(sessionId)}`;
      return fetchReadModel(fetchImpl, url, decodeSelectionChanged);
    },
  };

  const changesetService: ChangesetServiceRead = {
    async getCurrent(sessionId: string): Promise<CurrentChangesetRead | undefined> {
      const url = `${baseUrl}${CHANGESET_PATH}?sessionId=${encodeURIComponent(sessionId)}`;
      return fetchReadModel(fetchImpl, url, decodeCurrentChangeset);
    },
  };

  return { sessionService, changesetService };
}
