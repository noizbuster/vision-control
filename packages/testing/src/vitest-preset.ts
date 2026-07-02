import { beforeEach } from "vitest";
import { defineConfig } from "vitest/config";

import type { FakeClock } from "./fake-clock.js";
import type { FakeUuidSequencer } from "./fake-uuid.js";

/**
 * Shared Vitest config preset for Vision-Control packages. Merge or spread
 * into a package's own `vitest.config.ts`. Override `test.environment` for
 * browser packages.
 */
export const vcTestConfig = defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

/**
 * Opt-in shared clock/uuid instances. Bind one once per test file
 * (`bindSharedClock(new FakeClock())`) and {@link vcTestSetup} will reset them
 * between tests. Tests that need strict isolation should construct their own
 * instances instead of using the shared singletons.
 */
let sharedClock: FakeClock | null = null;
let sharedUuid: FakeUuidSequencer | null = null;

/** Register a shared clock (returned for convenience). */
export function bindSharedClock(clock: FakeClock): FakeClock {
  sharedClock = clock;
  return clock;
}

/** Register a shared uuid sequencer (returned for convenience). */
export function bindSharedUuid(uuid: FakeUuidSequencer): FakeUuidSequencer {
  sharedUuid = uuid;
  return uuid;
}

/**
 * Vitest global setup. Call this from a Vitest setup file
 * (`test.setupFiles: ["./vitest.setup.ts"]` where `vitest.setup.ts` imports
 * and invokes this). It resets any shared clock/uuid before each test.
 */
export function vcTestSetup(): void {
  beforeEach(() => {
    sharedClock?.reset();
    sharedUuid?.reset();
  });
}
