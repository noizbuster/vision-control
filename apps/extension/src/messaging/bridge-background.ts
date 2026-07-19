import {
  BridgeClient,
  type BridgeEndpoint,
  probeDiscover,
  resolveBridgePairingInput,
} from "@vision-control/bridge-client";

import {
  type BridgeStorageArea,
  connectionStateFromBridge,
  evaluateSwWake,
  loadBridgeEndpoint,
  persistBridgeEndpoint,
} from "./bridge-session.js";
import type { ConnectionState } from "./types.js";

export type BridgeBackgroundController = {
  readonly pairWithInput: (pairingUrl: string) => Promise<void>;
  readonly unpair: () => void;
  readonly getConnectionState: () => ConnectionState;
  readonly runSwWakePolicy: () => Promise<void>;
  readonly getClient: () => BridgeClient | undefined;
};

export type CreateBridgeBackgroundControllerOptions = {
  readonly storage: BridgeStorageArea | undefined;
  readonly onStateChange: (state: ConnectionState) => void;
  /** Called after a successful pair so the command router can attach. */
  readonly onClientReady?: (client: BridgeClient) => void;
};

export function createBridgeBackgroundController(
  options: CreateBridgeBackgroundControllerOptions,
): BridgeBackgroundController {
  let bridgeClient: BridgeClient | undefined;
  let connectionState: ConnectionState = "disconnected";
  let pairGeneration = 0;

  const setState = (state: ConnectionState): void => {
    connectionState = state;
    options.onStateChange(state);
  };

  const pairWithInput = async (pairingUrl: string): Promise<void> => {
    const generation = pairGeneration + 1;
    pairGeneration = generation;
    const discover = await probeDiscover();
    if (generation !== pairGeneration) return;
    const discoverBody = discover.success ? discover.discover : undefined;
    const parsed = resolveBridgePairingInput(pairingUrl, discoverBody);
    if (!parsed.success) {
      setState("disconnected");
      return;
    }

    bridgeClient?.disconnect();
    const client = new BridgeClient({
      onStateChange: (state) => {
        if (generation === pairGeneration) {
          setState(connectionStateFromBridge(state));
        }
      },
    });
    bridgeClient = client;
    setState("connecting");
    try {
      await client.connect(parsed.target);
      const endpoint = client.getEndpoint();
      if (endpoint !== undefined) {
        await persistBridgeEndpoint(options.storage, endpoint);
      }
      if (generation !== pairGeneration || bridgeClient !== client) return;
      setState("connected");
      options.onClientReady?.(client);
    } catch {
      if (bridgeClient === client) {
        bridgeClient = undefined;
        setState("disconnected");
      }
    }
  };

  const unpair = (): void => {
    pairGeneration += 1;
    bridgeClient?.disconnect();
    bridgeClient = undefined;
    setState("disconnected");
  };

  const runSwWakePolicy = async (): Promise<void> => {
    const endpoint = await loadBridgeEndpoint(options.storage);
    const decision = evaluateSwWake(bridgeClient, endpoint);
    if (decision.action === "reconnect") {
      await pairWithInput(buildReconnectPairingUrl(decision.endpoint, decision.token));
      return;
    }
    setState("disconnected");
  };

  return {
    pairWithInput,
    unpair,
    getConnectionState: () => connectionState,
    runSwWakePolicy,
    getClient: () => bridgeClient,
  };
}

function buildReconnectPairingUrl(endpoint: BridgeEndpoint, token: string): string {
  const params = new URLSearchParams({
    token,
    port: String(endpoint.port),
    host: endpoint.host,
  });
  return `vision-control://pair?${params.toString()}`;
}
