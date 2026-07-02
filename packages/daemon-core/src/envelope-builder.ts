import {
  PROTOCOL_VERSION,
  type ProtocolEnvelope,
  type ProtocolError,
} from "@vision-control/protocol";

/** Injectable clock/id defaults. */
export interface EnvelopeBuilderDeps {
  readonly now?: () => number;
  readonly uuid?: () => string;
}

const defaultNow = (): number => Date.now();
const defaultUuid = (): string => globalThis.crypto.randomUUID();

/** Build a protocol envelope around `payload` with a fresh messageId. */
export function buildEnvelope(
  messageType: string,
  payload: unknown,
  deps: EnvelopeBuilderDeps = {},
  extra?: Pick<ProtocolEnvelope, "sessionId" | "correlationId">,
): ProtocolEnvelope {
  const now = deps.now ?? defaultNow;
  const uuid = deps.uuid ?? defaultUuid;
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId: uuid(),
    messageType,
    timestamp: now(),
    payload,
    ...(extra?.sessionId !== undefined ? { sessionId: extra.sessionId } : {}),
    ...(extra?.correlationId !== undefined ? { correlationId: extra.correlationId } : {}),
  };
}

/** Build an error envelope carrying `error`. */
export function buildErrorEnvelope(
  error: ProtocolError,
  deps: EnvelopeBuilderDeps = {},
  correlationId?: string,
): ProtocolEnvelope {
  return buildEnvelope("error", { type: "error", ...error }, deps, { correlationId });
}

/** Serialize an envelope for the wire. */
export const serializeEnvelope = (envelope: ProtocolEnvelope): string => JSON.stringify(envelope);
