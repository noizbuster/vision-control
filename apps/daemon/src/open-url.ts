import { spawn } from "node:child_process";
import { platform as processPlatform } from "node:process";
import { shouldOpenBrowser, type OpenBrowserPolicyInput } from "./open-policy.js";

/** Spawn argv runner for {@link openUrl} (never a shell string). */
export type OpenUrlRunner = (command: string, args: readonly string[]) => Promise<void>;

export type OpenUrlFn = (url: string) => Promise<void>;

export type ResolveOpenCommandResult = {
  readonly command: string;
  readonly args: readonly string[];
};

/** Platform open command as a spawn argv pair (no shell interpolation). */
export function resolveOpenCommand(
  url: string,
  platform: NodeJS.Platform = processPlatform,
): ResolveOpenCommandResult {
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  return { command: "xdg-open", args: [url] };
}

/** Fire-and-forget spawn runner; resolves on spawn, not browser exit. */
export function createDefaultOpenUrlRunner(): OpenUrlRunner {
  return (command, args) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(command, [...args], {
        stdio: "ignore",
        detached: true,
      });
      child.unref();
      let settled = false;
      const settle = (fn: () => void): void => {
        if (!settled) {
          settled = true;
          fn();
        }
      };
      child.once("error", (error) => settle(() => reject(error)));
      child.once("spawn", () => settle(() => resolve()));
      child.once("exit", (code) => {
        if (code === 0 || code === null) {
          settle(() => resolve());
        } else {
          settle(() => reject(new Error(`open command exited with code ${String(code)}`)));
        }
      });
    });
}

/** Open a URL via spawn args array. Inject `runner` in tests. */
export async function openUrl(
  url: string,
  runner: OpenUrlRunner = createDefaultOpenUrlRunner(),
  platform: NodeJS.Platform = processPlatform,
): Promise<void> {
  const { command, args } = resolveOpenCommand(url, platform);
  await runner(command, args);
}

export type MaybeOpenPairingPageInput = {
  readonly pairingHttpUrl: string;
  readonly policy: OpenBrowserPolicyInput;
  readonly openUrl: OpenUrlFn;
  /** Stderr sink for open failures; must not receive URL/token. */
  readonly writeError?: (message: string) => void;
};

/** Open pairing page when policy allows; open failures are non-fatal. */
export async function maybeOpenPairingPage(input: MaybeOpenPairingPageInput): Promise<void> {
  if (!shouldOpenBrowser(input.policy)) {
    return;
  }
  try {
    await input.openUrl(input.pairingHttpUrl);
  } catch {
    const write =
      input.writeError ??
      ((message: string): void => {
        process.stderr.write(message);
      });
    write("failed to open pairing page\n");
  }
}
