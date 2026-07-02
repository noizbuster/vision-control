export const PACKAGE_NAME = "@vision-control/testing";

export {
  DaemonBinaryMissingError,
  type DaemonHandle,
  resolveDaemonBinaryPath,
  type StartDaemonOptions,
  startDaemon,
  tryStartDaemon,
  withDaemon,
} from "./daemon-process.js";
export {
  appendEvidence,
  evidenceFilePath,
  type WriteEvidenceOptions,
  writeEvidence,
} from "./evidence.js";
export { FakeClock } from "./fake-clock.js";
export { FakeUuidSequencer } from "./fake-uuid.js";
export {
  buildChangeset,
  buildRecord,
  buildSelectionIdentity,
  type ChangesetLike,
  type OperationStub,
  type SelectionIdentityLike,
} from "./fixtures/builders.js";
export {
  buildExtensionLaunchArgs,
  type ExtensionContext,
  type ExtensionLoadOptions,
  ExtensionNotFoundError,
  loadExtension,
  withExtensionContext,
} from "./playwright/extension-loader.js";

export {
  bindSharedClock,
  bindSharedUuid,
  vcTestConfig,
  vcTestSetup,
} from "./vitest-preset.js";
