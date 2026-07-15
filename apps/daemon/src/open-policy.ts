/** Inputs for the pure browser auto-open decision (no process/TTY side effects). */
export interface OpenBrowserPolicyInput {
  readonly isTty: boolean;
  readonly openFlag: boolean;
  readonly noOpenFlag: boolean;
  readonly bindHost: string;
  /** True when root monorepo `pnpm dev` set `VC_OPEN_PAIRING=1` (exact match only). */
  readonly openFromMonorepoDev: boolean;
}

/**
 * Decide whether the daemon should attempt to open the pairing page in a browser.
 *
 * Rules (in order):
 * 1. `--no-open` always wins (including when both flags are set).
 * 2. Only exact bind host `127.0.0.1` may auto-open (`::1` / `localhost` never).
 * 3. `--open` forces an attempt.
 * 4. `openFromMonorepoDev` (`VC_OPEN_PAIRING=1` from root `pnpm dev`) opens.
 * 5. Otherwise do not open (interactive TTY alone is not enough).
 */
export function shouldOpenBrowser(input: OpenBrowserPolicyInput): boolean {
  if (input.noOpenFlag) {
    return false;
  }
  if (input.bindHost !== "127.0.0.1") {
    return false;
  }
  if (input.openFlag) {
    return true;
  }
  if (input.openFromMonorepoDev) {
    return true;
  }
  return false;
}
