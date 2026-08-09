import type { Rect } from "@vision-control/geometry";
import type {
  MoveCandidate,
  MoveDiagnostic,
  ReparentElementDescriptor,
} from "@vision-control/interaction-machine";
import {
  computeMoveInsertion,
  type MoveInsertionResolution,
  resolveBlockAxis,
  resolveFlexAxis,
  validateReparent,
} from "@vision-control/layout-engine";
import { hitTestStack } from "@vision-control/overlay-ui";

import {
  getComputedStyleFor,
  getOrAssignMoveRuntimeId,
  type MoveContainerResult,
  measureMoveContainer,
  rectFor,
} from "../components/interaction/reorder-dom-context.js";

const NON_DROP_CONTAINER_TAGS: Readonly<Record<string, true>> = {
  area: true,
  audio: true,
  base: true,
  br: true,
  button: true,
  canvas: true,
  col: true,
  embed: true,
  hr: true,
  iframe: true,
  img: true,
  input: true,
  link: true,
  meta: true,
  object: true,
  option: true,
  param: true,
  script: true,
  select: true,
  source: true,
  style: true,
  textarea: true,
  track: true,
  video: true,
  wbr: true,
};

const FORM_FIELD_TAGS: Readonly<Record<string, true>> = {
  button: true,
  fieldset: true,
  input: true,
  object: true,
  output: true,
  select: true,
  textarea: true,
};

type DropZone = "inside" | "before" | "after";
type MoveRoot = Document | ShadowRoot;

export interface MoveDropTargetRequest {
  readonly document: Document;
  readonly root: MoveRoot;
  readonly overlayHost: HTMLElement;
  readonly dragged: Element;
  readonly sourceParent: Element;
  readonly pointer: { readonly x: number; readonly y: number };
  readonly movingOrder: number;
  readonly sourceIndex: number;
  readonly idFor?: (element: Element) => string;
  readonly previous?: Extract<MoveDropResolution, { readonly kind: "valid" }> | null;
}

export type MoveDropResolution =
  | {
      readonly kind: "valid";
      readonly insertion: Extract<MoveInsertionResolution, { readonly ok: true }>;
      readonly candidate: MoveCandidate;
      readonly targetElement: Element;
      readonly scrollAnchor: Element;
      readonly key: string;
      readonly zone: DropZone;
      readonly activation: {
        readonly axis: "x" | "y";
        readonly start: number;
        readonly end: number;
      };
      readonly visualBoundary: {
        readonly beforeElement: Element | null;
        readonly afterElement: Element | null;
      };
    }
  | {
      readonly kind: "invalid";
      readonly targetElement: Element;
      readonly rect: Rect | null;
      readonly scrollAnchor: Element;
      readonly key: string;
      readonly diagnostic: MoveDiagnostic;
    }
  | { readonly kind: "none"; readonly scrollAnchor?: Element };

type Slot = {
  readonly parent: Element;
  readonly anchor: Element;
  readonly rawHit: Element;
  readonly zone: DropZone;
  readonly rank: readonly [number, number, number];
  readonly activation: { readonly axis: "x" | "y"; readonly start: number; readonly end: number };
};

const validTargetRect = (element: Element): Rect | null => {
  const rect = rectFor(element);
  return Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
    ? rect
    : null;
};

const isInsideCandidate = (element: Element, request: MoveDropTargetRequest): boolean => {
  if (element.getRootNode() !== request.root) return false;
  if (element === request.dragged || request.dragged.contains(element)) return false;
  if (
    element === request.document.documentElement ||
    element === request.document.head ||
    element === request.document.body
  ) {
    return false;
  }
  if (NON_DROP_CONTAINER_TAGS[element.tagName.toLowerCase()] === true) return false;
  const style = getComputedStyleFor(element);
  return style.display !== "none" && style.display !== "contents" && style.visibility === "visible";
};

const elementChain = (hit: Element, root: MoveRoot): readonly Element[] => {
  const chain: Element[] = [];
  let current: Element | null = hit;
  while (current !== null && current.getRootNode() === root) {
    chain.push(current);
    if (current.parentElement !== null) {
      current = current.parentElement;
      continue;
    }
    break;
  }
  return chain;
};

const activationFor = (
  anchor: Element,
  parent: Element | null,
  pointer: MoveDropTargetRequest["pointer"],
): { readonly zone: DropZone; readonly activation: Slot["activation"] } => {
  const rect = rectFor(anchor);
  const measurement = parent === null ? null : measureMoveContainer(parent, null);
  const flow = measurement?.ok ? measurement.measurement.flow : null;
  const progression =
    flow?.kind === "flex"
      ? resolveFlexAxis(flow.axis)
      : flow?.kind === "block"
        ? resolveBlockAxis(flow.writingMode)
        : { axis: "y" as const, sign: 1 as const };
  const axis = progression.axis;
  const start = axis === "x" ? rect.x : rect.y;
  const size = axis === "x" ? rect.width : rect.height;
  if (!Number.isFinite(start) || !Number.isFinite(size) || size <= 0) {
    return { zone: "inside", activation: { axis, start, end: start } };
  }
  const coordinate = axis === "x" ? pointer.x : pointer.y;
  const fraction =
    progression.sign === 1 ? (coordinate - start) / size : 1 - (coordinate - start) / size;
  const edge = Math.min(size / 3, Math.max(6, size * 0.2), 24);
  if (fraction < edge / size) {
    return { zone: "before", activation: { axis, start, end: start + edge } };
  }
  if (fraction > 1 - edge / size) {
    return { zone: "after", activation: { axis, start: start + size - edge, end: start + size } };
  }
  return {
    zone: "inside",
    activation: { axis, start: start + edge, end: start + size - edge },
  };
};

export const buildMoveElementDescriptor = (
  element: Element,
  runtimeId: string,
): ReparentElementDescriptor => {
  const tagName = element.tagName.toLowerCase();
  const root = element.getRootNode();
  const labels = (element as Element & { readonly labels?: NodeListOf<HTMLLabelElement> | null })
    .labels;
  return {
    ref: { runtimeId, tagName },
    tagName,
    ...(root instanceof ShadowRoot && root.mode === "open" ? { isInShadowRoot: true } : {}),
    ...(FORM_FIELD_TAGS[tagName] === true ? { isFormField: true } : {}),
    ...(labels !== null && labels !== undefined && labels.length > 0
      ? { isLabelControl: true }
      : {}),
  };
};

/**
 * Ranks every same-root hit and ancestor candidate. An invalid inner candidate
 * never terminates the scan, so the highest-ranked valid candidate wins.
 */
export const resolveMoveDropTarget = (request: MoveDropTargetRequest): MoveDropResolution => {
  const idFor = request.idFor ?? getOrAssignMoveRuntimeId;
  const hits = hitTestStack(request.pointer, request.overlayHost, request.root);
  const slots: Slot[] = [];
  const measurementByParent = new Map<Element, MoveContainerResult>();

  for (const [hitRank, rawHit] of hits.entries()) {
    for (const [distance, anchor] of elementChain(rawHit, request.root).entries()) {
      const parent = anchor.parentElement;
      const active = activationFor(anchor, parent, request.pointer);
      const alternatives: readonly DropZone[] =
        active.zone === "inside" ? ["inside", "before", "after"] : [active.zone, "inside"];
      for (const candidateZone of alternatives) {
        const targetParent = candidateZone === "inside" ? anchor : parent;
        if (targetParent === null || !isInsideCandidate(targetParent, request)) continue;
        if (
          slots.some(
            (slot) =>
              slot.parent === targetParent && slot.anchor === anchor && slot.zone === candidateZone,
          )
        ) {
          continue;
        }
        slots.push({
          parent: targetParent,
          anchor,
          rawHit,
          zone: candidateZone,
          rank: [hitRank, distance, alternatives.indexOf(candidateZone)],
          activation: active.activation,
        });
      }
    }
  }

  slots.sort(
    (first, second) =>
      first.rank[0] - second.rank[0] ||
      first.rank[1] - second.rank[1] ||
      first.rank[2] - second.rank[2],
  );
  const valid: Array<Extract<MoveDropResolution, { readonly kind: "valid" }>> = [];
  const invalid: Array<Extract<MoveDropResolution, { readonly kind: "invalid" }>> = [];

  for (const slot of slots) {
    const measurement =
      measurementByParent.get(slot.parent) ??
      measureMoveContainer(
        slot.parent,
        slot.parent === request.sourceParent ? request.dragged : null,
      );
    measurementByParent.set(slot.parent, measurement);
    const runtimeId = idFor(slot.parent);
    const key = `${runtimeId}:${idFor(slot.anchor)}:${slot.zone}`;
    if (!measurement.ok) {
      invalid.push({
        kind: "invalid",
        targetElement: slot.parent,
        rect: validTargetRect(slot.parent),
        scrollAnchor: slot.rawHit,
        key,
        diagnostic: {
          code: measurement.diagnostic.kind,
          message: measurement.diagnostic.message,
        },
      });
      continue;
    }

    const sameParent = slot.parent === request.sourceParent;
    if (!sameParent) {
      const contentModel = validateReparent(slot.parent.tagName, request.dragged.tagName);
      if (!contentModel.ok) {
        invalid.push({
          kind: "invalid",
          targetElement: slot.parent,
          rect: validTargetRect(slot.parent),
          scrollAnchor: slot.rawHit,
          key,
          diagnostic: {
            code: "invalid-drop-target",
            message: `${contentModel.violation.code}: ${contentModel.violation.reason}`,
          },
        });
        continue;
      }
    }

    const candidate: MoveCandidate = {
      targetParent: buildMoveElementDescriptor(slot.parent, runtimeId),
      parentRect: measurement.measurement.rect,
      childCount: measurement.measurement.childCount,
      items: measurement.measurement.items,
      layoutRole: measurement.measurement.layoutRole,
      targetContextPositioned: measurement.measurement.targetContextPositioned,
      flow: measurement.measurement.flow,
    };
    const insertion = computeMoveInsertion({
      parent: candidate.targetParent.ref,
      parentRect: candidate.parentRect,
      childCount: candidate.childCount,
      items: candidate.items,
      movingOrder: request.movingOrder,
      sourceIndex: sameParent ? request.sourceIndex : null,
      pointer: request.pointer,
      flow: candidate.flow,
    });
    if (!insertion.ok) {
      invalid.push({
        kind: "invalid",
        targetElement: slot.parent,
        rect: validTargetRect(slot.parent),
        scrollAnchor: slot.rawHit,
        key,
        diagnostic: insertion.diagnostic,
      });
      continue;
    }

    valid.push({
      kind: "valid",
      candidate,
      insertion,
      targetElement: slot.parent,
      scrollAnchor: slot.rawHit,
      key,
      zone: slot.zone,
      activation: slot.activation,
      visualBoundary: {
        beforeElement:
          insertion.visualBoundary.beforeDomIndex === null
            ? null
            : (measurement.measurement.childElements[insertion.visualBoundary.beforeDomIndex] ??
              null),
        afterElement:
          insertion.visualBoundary.afterDomIndex === null
            ? null
            : (measurement.measurement.childElements[insertion.visualBoundary.afterDomIndex] ??
              null),
      },
    });
  }

  const previous = request.previous;
  if (previous !== null && previous !== undefined) {
    const retained = valid.find((resolution) => resolution.key === previous.key);
    const nestedCandidateOutranksRetained =
      retained !== undefined &&
      valid.some(
        (resolution) =>
          resolution.targetElement !== retained.targetElement &&
          retained.targetElement.contains(resolution.targetElement),
      );
    const coordinate = previous.activation.axis === "x" ? request.pointer.x : request.pointer.y;
    if (
      retained !== undefined &&
      !nestedCandidateOutranksRetained &&
      coordinate >= previous.activation.start - 4 &&
      coordinate <= previous.activation.end + 4
    ) {
      return retained;
    }
  }
  return (
    valid[0] ??
    invalid[0] ??
    (hits[0] === undefined ? { kind: "none" } : { kind: "none", scrollAnchor: hits[0] })
  );
};
