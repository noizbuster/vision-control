import { render } from "@testing-library/react";
import { vi } from "vitest";

import { STORAGE_KEY } from "../host-allowlist.js";
import { HostAllowlistPanel } from "./HostAllowlistPanel.js";

type PermissionRequest = { readonly origins: readonly string[] };
type PermissionRequestMock = ReturnType<
  typeof vi.fn<(details: PermissionRequest) => Promise<boolean>>
>;
type RuntimeSendMessageMock = ReturnType<typeof vi.fn<(message: unknown) => Promise<void>>>;
type StorageGetMock = ReturnType<
  typeof vi.fn<(keys: string | readonly string[]) => Promise<Record<string, readonly string[]>>>
>;
type StorageSetMock = ReturnType<
  typeof vi.fn<(items: Record<string, readonly string[]>) => Promise<void>>
>;
type StorageChange = { readonly newValue: readonly string[] };
type StorageChanges = Record<string, StorageChange>;
type StorageChangeListener = (changes: StorageChanges) => void;

export interface ChromeMock {
  readonly runtime: {
    readonly sendMessage: RuntimeSendMessageMock;
  };
  readonly permissions: {
    readonly request: PermissionRequestMock;
    readonly remove: PermissionRequestMock;
  };
  readonly storage: {
    readonly local: {
      readonly store: Record<string, readonly string[]>;
      readonly get: StorageGetMock;
      readonly set: StorageSetMock;
    };
    readonly onChanged: {
      readonly addListener: (cb: StorageChangeListener) => void;
      readonly removeListener: (cb: StorageChangeListener) => void;
    };
  };
}

export function createChromeMock(
  initialHosts: readonly string[] = [],
  requestResult = true,
  removeResult = true,
): ChromeMock {
  const store: Record<string, readonly string[]> = { [STORAGE_KEY]: [...initialHosts] };
  const changedListeners = new Set<StorageChangeListener>();
  const fireChange = (changes: StorageChanges): void => {
    for (const cb of changedListeners) {
      cb(changes);
    }
  };

  return {
    runtime: {
      sendMessage: vi.fn<(message: unknown) => Promise<void>>().mockResolvedValue(undefined),
    },
    permissions: {
      request: vi
        .fn<(details: PermissionRequest) => Promise<boolean>>()
        .mockResolvedValue(requestResult),
      remove: vi
        .fn<(details: PermissionRequest) => Promise<boolean>>()
        .mockResolvedValue(removeResult),
    },
    storage: {
      local: {
        store,
        get: vi.fn<
          (keys: string | readonly string[]) => Promise<Record<string, readonly string[]>>
        >(async (keys) => {
          const keyArr: readonly string[] = typeof keys === "string" ? [keys] : keys;
          const result: Record<string, readonly string[]> = {};
          for (const key of keyArr) {
            const value = store[key];
            if (value !== undefined) {
              result[key] = value;
            }
          }
          return result;
        }),
        set: vi.fn<(items: Record<string, readonly string[]>) => Promise<void>>(async (items) => {
          const changes: StorageChanges = {};
          for (const [key, newValue] of Object.entries(items)) {
            const copiedValue = [...newValue];
            changes[key] = { newValue: copiedValue };
            store[key] = copiedValue;
          }
          fireChange(changes);
        }),
      },
      onChanged: {
        addListener: (cb: StorageChangeListener) => {
          changedListeners.add(cb);
        },
        removeListener: (cb: StorageChangeListener) => {
          changedListeners.delete(cb);
        },
      },
    },
  };
}

function installChrome(mock: ChromeMock): void {
  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    configurable: true,
    value: mock,
  });
}

export function renderHostAllowlistPanel(mock: ChromeMock): void {
  installChrome(mock);
  render(<HostAllowlistPanel />);
}
