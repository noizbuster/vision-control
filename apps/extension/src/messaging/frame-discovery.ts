import type { FrameInfo } from "./types.js";

export interface FrameProvider {
  getAllFrames(
    tabId: number,
  ): Promise<readonly chrome.webNavigation.GetAllFrameResultDetails[] | null | undefined>;
}

function frameOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function isRouteable(
  frame: chrome.webNavigation.GetAllFrameResultDetails,
  topOrigin: string,
): boolean {
  if (frame.frameId === 0) {
    return true;
  }
  const origin = frameOrigin(frame.url);
  return origin.length > 0 && origin === topOrigin;
}

/**
 * Classify a raw frame tree into {@link FrameInfo} entries.
 *
 * Same-origin frames are routeable; cross-origin frames are reported as opaque
 * (`routeable: false`) and must not receive edit messages.
 */
export function classifyFrames(
  frames: readonly chrome.webNavigation.GetAllFrameResultDetails[],
  topOrigin: string,
): readonly FrameInfo[] {
  return frames.map((frame) => ({
    frameId: frame.frameId,
    parentFrameId: frame.parentFrameId,
    url: frame.url,
    origin: frameOrigin(frame.url),
    routeable: isRouteable(frame, topOrigin),
  }));
}

export async function discoverFrames(
  tabId: number,
  provider: FrameProvider,
): Promise<readonly FrameInfo[]> {
  const rawFrames = await provider.getAllFrames(tabId);
  if (rawFrames === undefined || rawFrames === null || rawFrames.length === 0) {
    return [];
  }
  const topFrame = rawFrames.find((frame) => frame.frameId === 0);
  const topOrigin = topFrame === undefined ? "" : frameOrigin(topFrame.url);
  return classifyFrames(rawFrames, topOrigin);
}

export function createWebNavigationFrameProvider(): FrameProvider {
  return {
    getAllFrames: async (tabId) => {
      if (typeof chrome === "undefined" || chrome.webNavigation?.getAllFrames === undefined) {
        return undefined;
      }
      return chrome.webNavigation.getAllFrames({ tabId });
    },
  };
}
