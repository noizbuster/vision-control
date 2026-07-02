import { type ProtocolError, protocolError } from "./errors.js";
import { HelloMessageSchema, type WelcomeMessage } from "./message-types.js";
import { isCompatible, parseProtocolVersion } from "./version.js";

/**
 * Capabilities this server advertises. The negotiated welcome only lists the
 * intersection with what the client announced it understands.
 */
const SERVER_CAPABILITIES = ["page-events", "session-events", "error-reporting"] as const;

export type NegotiationResult =
  | { readonly ok: true; readonly welcome: WelcomeMessage }
  | { readonly ok: false; readonly error: ProtocolError };

// Web Crypto API: available in Node 19+ (globalThis.crypto) and all modern
// browsers. Isomorphic — no node:crypto import needed.
const createSessionCredentials = (): { sessionId: string; sessionToken: string } => ({
  sessionId: crypto.randomUUID(),
  sessionToken: crypto.randomUUID(),
});

/**
 * Negotiate a protocol session. Validates the client hello, checks version
 * compatibility, intersects capabilities, and mints session credentials.
 *
 * Returns `{ ok: true, welcome }` on success or `{ ok: false, error }` on any
 * failure (bad payload, bad version, version mismatch). Never throws.
 */
export const negotiateProtocol = (
  clientHello: unknown,
  serverVersion: string,
): NegotiationResult => {
  const helloResult = HelloMessageSchema.safeParse(clientHello);
  if (!helloResult.success) {
    return {
      ok: false,
      error: protocolError("INVALID_PAYLOAD", { issues: helloResult.error.issues }),
    };
  }
  const hello = helloResult.data;

  const clientVersionResult = parseProtocolVersion(hello.clientVersion);
  if (!clientVersionResult.success) {
    return {
      ok: false,
      error: protocolError("INVALID_PAYLOAD", { reason: clientVersionResult.error }),
    };
  }

  const serverVersionResult = parseProtocolVersion(serverVersion);
  if (!serverVersionResult.success) {
    return {
      ok: false,
      error: protocolError("INTERNAL_ERROR", { reason: serverVersionResult.error }),
    };
  }

  if (!isCompatible(clientVersionResult.data, serverVersionResult.data)) {
    return {
      ok: false,
      error: protocolError("PROTOCOL_VERSION_MISMATCH", {
        client: hello.clientVersion,
        server: serverVersion,
      }),
    };
  }

  const credentials = createSessionCredentials();
  const sharedCapabilities = SERVER_CAPABILITIES.filter((cap) =>
    hello.clientCapabilities.includes(cap),
  );

  return {
    ok: true,
    welcome: {
      type: "welcome",
      serverVersion,
      serverCapabilities: sharedCapabilities,
      sessionId: credentials.sessionId,
      sessionToken: credentials.sessionToken,
    },
  };
};
