/**
 * Multi-select membership controller (plan task 2).
 *
 * Owns the selection-group state for the overlay runtime: which elements are
 * currently in the multi-select group, how they toggle (shift+click), and how a
 * marquee hit-test result replaces the set. After every change that yields a
 * valid group (>= 2 members, single frame, single shadow context) it builds the
 * canonical {@link MultiSelectGroup} via {@link createMultiSelectGroup} and
 * publishes a `multi-select-group` panel message so the `useMultiSelect` hook
 * receives it.
 *
 * The controller is pure-ish glue over the tested primitives in editor-core
 * (`evaluateGroupConstraints`, `createMultiSelectGroup`). It never mutates the
 * DOM except to stamp the dev-only `data-vc-preview-id` attribute used as the
 * per-instance runtime id (the same attribute the preview engine and reorder
 * controller rely on).
 */

import type { MultiSelectGroup } from "@vision-control/editor-core";
import { createMultiSelectGroup, evaluateGroupConstraints } from "@vision-control/editor-core";
import {
  createMultiSelectGroupId,
  type ElementRef,
  type MultiSelectMember,
  type MultiSelectShadowKind,
} from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import { PREVIEW_ID_ATTR } from "@vision-control/preview-engine";

import { createMultiSelectGroupMessage } from "../messaging/panel-messages.js";
import type { BusMessage, BusRoute } from "../messaging/types.js";

/**
 * The content runtime runs in a single frame. Cross-origin iframes are opaque
 * (never selectable); same-origin frames host their own runtime. So every
 * member this controller builds is top-frame / light-or-open-shadow only.
 */
const FRAME_ID = "main";
const FRAME_KIND = "top" as const;

/** Narrow bus seam: only `send` is needed to publish panel messages. */
export interface MultiSelectControllerBus {
  readonly send: (route: BusRoute, message: BusMessage) => void;
}

export interface MultiSelectControllerOptions {
  readonly document: Document;
  readonly bus: MultiSelectControllerBus;
}

export interface MultiSelectController {
  /** Toggle `element` in/out of the group (shift+click path). */
  readonly toggle: (element: Element) => void;
  /** Replace the group with `elements` (marquee hit-test path). */
  readonly setFromMarquee: (elements: readonly Element[]) => void;
  /** Drop every member (plain click or mode switch). */
  readonly reset: () => void;
  readonly dispose: () => void;
}

interface Entry {
  readonly member: MultiSelectMember;
  readonly element: Element;
}

export function createMultiSelectController(
  options: MultiSelectControllerOptions,
): MultiSelectController {
  const { document: doc, bus } = options;
  let selection = new Map<string, Entry>();

  const ensurePreviewId = (element: Element): string => {
    const existing = element.getAttribute(PREVIEW_ID_ATTR);
    if (existing !== null) return existing;
    const id = `vc-multi-${crypto.randomUUID()}`;
    element.setAttribute(PREVIEW_ID_ATTR, id);
    return id;
  };

  const buildMember = (element: Element): MultiSelectMember => {
    const root = element.getRootNode();
    const shadowKind: MultiSelectShadowKind =
      root instanceof ShadowRoot && root.mode === "open" ? "open-shadow-root" : "light-dom";
    return {
      runtimeId: ensurePreviewId(element),
      tagName: element.tagName.toLowerCase(),
      frameId: FRAME_ID,
      frameKind: FRAME_KIND,
      shadowKind,
    };
  };

  const toRect = (element: Element): Rect => {
    const dom = element.getBoundingClientRect();
    return { x: dom.left, y: dom.top, width: dom.width, height: dom.height };
  };

  // Root-first ancestry for the common-parent computation. Stops at
  // documentElement; stamps preview ids on ancestors so the common-parent
  // comparison has stable runtime ids.
  const buildParentChain = (element: Element): readonly ElementRef[] => {
    const chain: ElementRef[] = [];
    let current: Element | null = element.parentElement;
    while (current !== null) {
      chain.push({ runtimeId: ensurePreviewId(current), tagName: current.tagName.toLowerCase() });
      if (current === doc.documentElement) break;
      current = current.parentElement;
    }
    return chain.reverse();
  };

  const publish = (entries: readonly Entry[]): void => {
    if (entries.length < 2) return;
    const result = createMultiSelectGroup({
      id: createMultiSelectGroupId(`vc-group-${crypto.randomUUID()}`),
      members: entries.map((entry) => entry.member),
      memberRects: entries.map((entry) => toRect(entry.element)),
      parentChains: entries.map((entry) => buildParentChain(entry.element)),
    });
    if (result.ok) {
      bus.send("panel", createMultiSelectGroupMessage(result.group));
    }
    // A constraint failure here is unreachable: callers pre-check with
    // evaluateGroupConstraints. Stay silent rather than corrupting the group.
  };

  const toggle = (element: Element): void => {
    const member = buildMember(element);
    const trial = new Map(selection);
    if (trial.has(member.runtimeId)) {
      trial.delete(member.runtimeId);
    } else {
      trial.set(member.runtimeId, { member, element });
    }
    // Reject an incompatible add; keep the existing valid selection intact.
    if (!groupAcceptable(trial)) return;
    selection = trial;
    publish([...selection.values()]);
  };

  const setFromMarquee = (elements: readonly Element[]): void => {
    const trial = new Map<string, Entry>();
    for (const element of elements) {
      const member = buildMember(element);
      trial.set(member.runtimeId, { member, element });
    }
    if (!groupAcceptable(trial)) return;
    selection = trial;
    publish([...selection.values()]);
  };

  const reset = (): void => {
    selection = new Map();
  };

  const dispose = (): void => {
    selection = new Map();
  };

  return { toggle, setFromMarquee, reset, dispose };
}

/** True when `trial` either has fewer than 2 members or passes every constraint. */
function groupAcceptable(trial: Map<string, Entry>): boolean {
  const members = [...trial.values()].map((entry) => entry.member);
  if (members.length < 2) return true;
  return evaluateGroupConstraints(members).ok;
}

/** Re-exported for downstream consumers that want the group type in one place. */
export type { MultiSelectGroup };
