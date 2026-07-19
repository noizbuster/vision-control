import { describe, expect, it } from "vitest";

import {
  BRIDGE_CONNECT_MESSAGE_TYPE,
  BRIDGE_DISCONNECT_MESSAGE_TYPE,
  createBridgeConnectMessage,
  createBridgeDisconnectMessage,
  createDaemonConnectMessage,
  createDaemonDisconnectMessage,
  DAEMON_CONNECT_MESSAGE_TYPE,
  DAEMON_DISCONNECT_MESSAGE_TYPE,
  isBridgeConnectMessageType,
  isBridgeDisconnectMessageType,
} from "../panel-background-control-messages.js";

const PAIRING_URL = "vision-control://pair?token=t&port=4321&host=127.0.0.1";

describe("bridge connect message aliases", () => {
  it("emits preferred bridge-connect with pairing payload", () => {
    const message = createBridgeConnectMessage(PAIRING_URL, 42);
    expect(message.messageType).toBe(BRIDGE_CONNECT_MESSAGE_TYPE);
    expect(message.targetRoute).toBe("background");
    expect(message.tabId).toBe(42);
    expect(message.payload).toEqual({ pairingUrl: PAIRING_URL });
    expect(isBridgeConnectMessageType(message.messageType)).toBe(true);
  });

  it("emits preferred bridge-disconnect", () => {
    const message = createBridgeDisconnectMessage(42);
    expect(message.messageType).toBe(BRIDGE_DISCONNECT_MESSAGE_TYPE);
    expect(message.targetRoute).toBe("background");
    expect(message.tabId).toBe(42);
    expect(isBridgeDisconnectMessageType(message.messageType)).toBe(true);
  });

  it("keeps legacy daemon-connect wire type for mid-migration callers", () => {
    const message = createDaemonConnectMessage(PAIRING_URL);
    expect(message.messageType).toBe(DAEMON_CONNECT_MESSAGE_TYPE);
    expect(message.payload).toEqual({ pairingUrl: PAIRING_URL });
    expect(isBridgeConnectMessageType(message.messageType)).toBe(true);
  });

  it("keeps legacy daemon-disconnect wire type for mid-migration callers", () => {
    const message = createDaemonDisconnectMessage();
    expect(message.messageType).toBe(DAEMON_DISCONNECT_MESSAGE_TYPE);
    expect(isBridgeDisconnectMessageType(message.messageType)).toBe(true);
  });

  it("does not treat unrelated message types as bridge connect/disconnect", () => {
    expect(isBridgeConnectMessageType("editor-command")).toBe(false);
    expect(isBridgeDisconnectMessageType("clear-preview")).toBe(false);
  });
});
