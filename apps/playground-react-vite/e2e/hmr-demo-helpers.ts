import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import type {
  ResolvedTarget,
  VerificationDomAdapter,
} from "../../../packages/verification-engine/dist/index.js";

/**
 * Helpers for the real-Vite-HMR demo e2e (`hmr-demo.spec.ts`).
 *
 * Split out of the spec to stay under the 250 pure-LOC ceiling. These helpers
 * own the HMR-demo mechanics: agent-style source file patch (no product
 * codemod — ADR-014 supersession / ADR-020), HMR mutation observation,
 * post-HMR DOM snapshotting, and the snapshot-backed `ResolvedTarget` that
 * lets the verification engine read the real post-HMR browser DOM from the
 * Node test process.
 */

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..", "..");
export const FIXTURE_RELATIVE = "apps/playground-react-vite/src/fixtures/HmrDemo.tsx";
export const FIXTURE_ABSOLUTE = resolve(REPO_ROOT, FIXTURE_RELATIVE);
export const SOURCE_ID = "hmr-demo-card-01";
export const SOURCE_SELECTOR = `[data-vc-source="${SOURCE_ID}"]`;
export const INITIAL_PADDING = "12px";
export const PATCHED_PADDING = "24px";

/** A style-edit operation for the HMR demo's padding change. */
export interface PaddingStyleEdit {
  readonly kind: "style-edit";
  readonly id: string;
  readonly timestamp: number;
  readonly runtime: false;
  readonly target: { readonly runtimeId: string };
  readonly property: "padding";
  readonly value: string;
  readonly important: false;
  readonly previousValue: string;
}

/** Build a style-edit operation for a padding value. */
export function paddingEdit(value: string, previousValue: string, id: string): PaddingStyleEdit {
  return {
    kind: "style-edit",
    id,
    timestamp: Date.now(),
    runtime: false,
    target: { runtimeId: SOURCE_ID },
    property: "padding",
    value,
    important: false,
    previousValue,
  };
}

/**
 * Apply a real source-file padding edit the way an agent would: write the
 * fixture on disk. Product CLI codemod is removed (ADR-014 supersession);
 * patch apply is an agent file-tool action, never an MCP tool (ADR-020).
 */
export async function applyPaddingSourcePatch(
  fromPadding: string,
  toPadding: string,
): Promise<{ readonly sourceVerified: boolean }> {
  const content = await readFile(FIXTURE_ABSOLUTE, "utf-8");
  const needle = `padding: "${fromPadding}"`;
  const replacement = `padding: "${toPadding}"`;
  if (!content.includes(needle)) {
    throw new Error(`applyPaddingSourcePatch: cannot find "${needle}" in ${FIXTURE_RELATIVE}`);
  }
  const next = content.replace(needle, replacement);
  await writeFile(FIXTURE_ABSOLUTE, next, "utf-8");
  const after = await readFile(FIXTURE_ABSOLUTE, "utf-8");
  return { sourceVerified: after.includes(replacement) && !after.includes(needle) };
}

/**
 * Install a MutationObserver in the page BEFORE the source edit, so the HMR-
 * driven DOM mutation is captured. Mirrors `waitForHmrComplete` from
 * `packages/verification-engine/src/hmr-detector.ts`: MutationObserver on
 * `document.body` with childList + subtree + attributes + characterData,
 * stability window of 100ms.
 *
 * Returns a promise that resolves `true` when DOM stability is detected after
 * at least one mutation (HMR happened) or `false` on timeout.
 */
export function armHmrObserver(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return new Promise<boolean>((resolvePromise) => {
      const stabilityWindow = 100;
      const timeout = 30_000;
      const deadline = Date.now() + timeout;
      let lastMutation = Date.now();
      let sawMutation = false;

      const observer = new MutationObserver(() => {
        sawMutation = true;
        lastMutation = Date.now();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      const poll = (): void => {
        if (Date.now() >= deadline) {
          observer.disconnect();
          resolvePromise(sawMutation && Date.now() - lastMutation >= stabilityWindow);
          return;
        }
        if (sawMutation && Date.now() - lastMutation >= stabilityWindow) {
          observer.disconnect();
          resolvePromise(true);
          return;
        }
        setTimeout(poll, Math.min(stabilityWindow, deadline - Date.now()));
      };
      setTimeout(poll, stabilityWindow);
    });
  });
}

/** Snapshot of the source-marked target read from the REAL post-HMR DOM. */
export interface TargetSnapshot {
  readonly found: boolean;
  readonly sourceId: string;
  readonly selector: string;
  readonly tagName: string;
  readonly text: string;
  readonly padding: string;
  readonly connected: boolean;
  readonly runtimeId: string;
}

/** Read the REAL post-HMR DOM snapshot for the source-marked target. */
export async function snapshotTarget(page: Page): Promise<TargetSnapshot> {
  return page.evaluate((sid) => {
    const selector = `[data-vc-source="${sid}"]`;
    const el = document.querySelector(selector);
    if (el === null) {
      return {
        found: false,
        sourceId: sid,
        selector,
        tagName: "",
        text: "",
        padding: "",
        connected: false,
        runtimeId: "",
      } satisfies TargetSnapshot;
    }
    const computed = getComputedStyle(el);
    return {
      found: true,
      sourceId: sid,
      selector,
      tagName: el.tagName.toLowerCase(),
      text: el.textContent ?? "",
      padding: computed.getPropertyValue("padding"),
      connected: el.isConnected,
      runtimeId:
        el.getAttribute("data-vc-runtime-id") ?? el.getAttribute("data-vc-preview-id") ?? "",
    } satisfies TargetSnapshot;
  }, SOURCE_ID);
}

/**
 * FFI sentinel for the Node↔browser boundary. The verification engine's
 * `ResolvedTarget.element` is typed as DOM `Element`, which cannot exist in
 * the Node test process. The snapshot adapter serves all values pre-read from
 * the real post-HMR page DOM; no style/text/existence assertion dereferences
 * this token directly — every read routes through `target.dom.*(target.element)`
 * and the adapter ignores the element argument.
 *
 * The Proxy throws on direct property access as a safety net.
 */
const BROWSER_ELEMENT_TOKEN: Element = new Proxy(
  { tagName: "" },
  {
    get() {
      throw new Error(
        "BROWSER_ELEMENT_TOKEN: direct element access — the snapshot adapter must serve all reads via target.dom.*",
      );
    },
  },
) as unknown as Element;

/**
 * Build a snapshot-backed {@link VerificationDomAdapter} that serves values
 * read from the real post-HMR browser DOM.
 */
function createSnapshotAdapter(snapshot: TargetSnapshot): VerificationDomAdapter {
  return {
    querySelector: () => null,
    querySelectorAll: () => [],
    getText: () => snapshot.text,
    getClasses: () => [],
    getStyle: () => snapshot.padding,
    getRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    getParent: () => null,
    getSiblingIndex: () => 0,
    getAttribute: (_el, name) => {
      if (name === "data-vc-source") return snapshot.sourceId;
      if (name === "data-vc-runtime-id" || name === "data-vc-preview-id") return snapshot.runtimeId;
      return null;
    },
    isConnected: () => snapshot.connected,
    matchesSelector: () => false,
    computeFingerprint: () => "",
    getConsoleEntries: () => [],
  };
}

/** Build a {@link ResolvedTarget} from a page snapshot. */
export function buildSnapshotTarget(snapshot: TargetSnapshot): ResolvedTarget {
  return {
    element: BROWSER_ELEMENT_TOKEN,
    dom: createSnapshotAdapter(snapshot),
    runtimeId: snapshot.runtimeId.length > 0 ? snapshot.runtimeId : `vc-hmr-${SOURCE_ID}`,
    sourceId: snapshot.sourceId,
    selector: snapshot.selector,
    confidence: snapshot.found ? "high" : "low",
  };
}
