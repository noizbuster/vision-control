import type { BridgeClient } from "@vision-control/bridge-client";
import type { SelectionSummary } from "@vision-control/inspector-core";

import type { MessageBus } from "../messaging/bus.js";
import type { BusMessage } from "../messaging/types.js";
import { installBackgroundCommandResultHandlers } from "../verification/background-command-result-wiring.js";
import {
  type BackgroundCommandRouter,
  createBackgroundCommandRouter,
} from "../verification/background-command-router.js";
import {
  type BackgroundJournalHandlers,
  installBackgroundJournalHandlers,
} from "./background-journal-handlers.js";
import {
  type BridgeSnapshotPushController,
  createBridgeSnapshotPushController,
} from "./bridge-snapshot-push.js";
import { type SessionJournalStorage, SessionJournalStore } from "./session-journal-store.js";

export interface BackgroundJournalRuntimeOptions {
  readonly storage?: SessionJournalStorage;
  readonly bus: MessageBus;
  readonly broadcastToPanel: (message: BusMessage) => void;
  readonly sendToTabContent: (tabId: number, message: BusMessage) => void;
  readonly getClient: () => BridgeClient | undefined;
  readonly getActiveTabId: () => number | undefined;
  readonly getSessionId: (tabId: number) => string | undefined;
  readonly onTaskError: (error: unknown) => void;
}

export interface BackgroundJournalRuntime {
  readonly handlers: BackgroundJournalHandlers;
  readonly commandRouter: BackgroundCommandRouter;
  readonly snapshotPush: BridgeSnapshotPushController;
  readonly handleClientReady: (client: BridgeClient) => void;
  readonly requestLocalVerify: (tabId: number) => void;
  readonly noteSelection: (tabId: number, selection: SelectionSummary | null) => void;
}

export function createBackgroundJournalRuntime(
  options: BackgroundJournalRuntimeOptions,
): BackgroundJournalRuntime {
  const store = new SessionJournalStore({
    ...(options.storage !== undefined ? { storage: options.storage } : {}),
    onTaskError: options.onTaskError,
  });
  void store.restore();

  const snapshotPush = createBridgeSnapshotPushController({
    getClient: options.getClient,
    getJournal: (tabId) => store.get(tabId),
    getSessionId: options.getSessionId,
  });
  const handlers = installBackgroundJournalHandlers({
    store,
    bus: options.bus,
    broadcastToPanel: options.broadcastToPanel,
    sendToTabContent: options.sendToTabContent,
    onJournalChanged: (tabId) => snapshotPush.noteJournalChanged(tabId),
  });
  const commandRouter = createBackgroundCommandRouter({
    getClient: options.getClient,
    getActiveTabId: options.getActiveTabId,
    getJournal: (tabId) => store.get(tabId),
    getSessionId: options.getSessionId,
    sendToTabContent: options.sendToTabContent,
    broadcastToPanel: options.broadcastToPanel,
  });
  installBackgroundCommandResultHandlers(options.bus, commandRouter);

  return {
    handlers,
    commandRouter,
    snapshotPush,
    handleClientReady: (client) => {
      store.runWhenReady(() => {
        commandRouter.attachClient(client);
        const activeTabId = options.getActiveTabId();
        if (activeTabId !== undefined) {
          snapshotPush.pushForTab(activeTabId);
        }
      });
    },
    requestLocalVerify: (tabId) => {
      store.runWhenReady(() => commandRouter.requestLocalVerify(tabId));
    },
    noteSelection: (tabId, selection) => {
      store.runWhenReady(() => snapshotPush.noteSelection(tabId, selection));
    },
  };
}
