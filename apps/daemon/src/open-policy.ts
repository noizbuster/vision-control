/** Inputs for the pure browser auto-open decision (no process/TTY side effects). */
export interface OpenBrowserPolicyInput {
  readonly isTty: boolean;
  readonly openFlag: boolean;
  readonly noOpenFlag: boolean;
  readonly bindHost: string;
}

/**
 * Decide whether the daemon should attempt to open the pairing page in a browser.
 *
 * Rules (in order):
 * 1. `--no-open` always wins (including when both flags are set).
 * 2. Only exact bind host `127.0.0.1` may auto-open (`::1` / `localhost` never).
 * 3. `--open` forces an attempt even when not a TTY.
 * 4. Otherwise open only on an interactive TTY.
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
  return input.isTty;
}
