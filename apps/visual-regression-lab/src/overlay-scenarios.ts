/**
 * Overlay render scenarios for the visual-regression-lab (PRD §31.6).
 *
 * Each scenario drives the REAL overlay-ui factories (`createOverlayElement` +
 * `createSnapGuides`) with fixed, deterministic geometry so a captured render
 * is byte-stable across runs. PRD §31.6 names: selected outline, box model,
 * drop indicator, snapping guide, resize handles, plus the dark/light themes.
 * The lab additionally covers the remaining PRD §8.2 artifacts the overlay
 * ships: parent outline, flex/grid axis, rotation handle, changed badge, and
 * drag ghost — and a `full-composite` scene rendering all of them together.
 */

import type { Rect } from "@vision-control/geometry";
import type { SnapCandidate } from "@vision-control/layout-engine";
import type { OverlayElement, SnapGuides } from "@vision-control/overlay-ui";

/** Handle the scenarios use to mutate a mounted overlay. */
export interface ScenarioContext {
  readonly overlay: OverlayElement;
  readonly snapGuides: SnapGuides;
}

export interface OverlayScenario {
  readonly id: string;
  readonly render: (ctx: ScenarioContext) => void;
}

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, width: w, height: h });

const SNAP_BOUNDS: Rect = rect(0, 0, 480, 320);

const SNAP_CANDIDATES: readonly SnapCandidate[] = [
  { kind: "edge", axis: "x", value: 120, distance: 3 },
  { kind: "center", axis: "y", value: 160, distance: 5 },
  { kind: "spacing-token", axis: "x", value: 240, token: "space-4", distance: 8 },
];

/** Every scenario the lab renders, in stable order. */
export const OVERLAY_SCENARIOS: readonly OverlayScenario[] = [
  {
    id: "selected-outline",
    render: ({ overlay }) => {
      overlay.setSelection({
        rect: rect(40, 32, 200, 64),
        label: "button.primary",
        confidence: "high",
      });
    },
  },
  {
    id: "box-model",
    render: ({ overlay }) => {
      overlay.setBoxModel({
        rect: rect(80, 70, 160, 120),
        margin: { top: 12, right: 12, bottom: 12, left: 12 },
        border: { top: 2, right: 2, bottom: 2, left: 2 },
        padding: { top: 8, right: 8, bottom: 8, left: 8 },
      });
    },
  },
  {
    id: "drop-indicator",
    render: ({ overlay }) => {
      overlay.setDropIndicator(rect(50, 110, 300, 3));
    },
  },
  {
    id: "snapping-guide",
    render: ({ snapGuides }) => {
      snapGuides.setSnapGuides(SNAP_CANDIDATES, { bounds: SNAP_BOUNDS });
    },
  },
  {
    id: "resize-handles",
    render: ({ overlay }) => {
      overlay.setResizeHandles(rect(60, 50, 180, 140));
    },
  },
  {
    id: "parent-outline",
    render: ({ overlay }) => {
      overlay.setParentOutline(rect(20, 16, 420, 280));
    },
  },
  {
    id: "flex-grid-axis",
    render: ({ overlay }) => {
      overlay.setFlexGridAxis({
        rect: rect(24, 20, 400, 240),
        kind: "flex",
        direction: "horizontal",
      });
    },
  },
  {
    id: "rotation-handle",
    render: ({ overlay }) => {
      overlay.setRotationHandle(rect(100, 90, 120, 120));
    },
  },
  {
    id: "changed-badge",
    render: ({ overlay }) => {
      overlay.setChangedBadge({ rect: rect(70, 60, 160, 80), label: "changed" });
    },
  },
  {
    id: "drag-ghost",
    render: ({ overlay }) => {
      overlay.setDragGhost({ rect: rect(96, 88, 140, 100), kind: "ghost" });
    },
  },
  {
    id: "full-composite",
    render: ({ overlay, snapGuides }) => {
      overlay.setParentOutline(rect(8, 8, 464, 304));
      overlay.setBoxModel({
        rect: rect(40, 40, 200, 140),
        margin: { top: 10, right: 10, bottom: 10, left: 10 },
        border: { top: 1, right: 1, bottom: 1, left: 1 },
        padding: { top: 6, right: 6, bottom: 6, left: 6 },
      });
      overlay.setFlexGridAxis({
        rect: rect(40, 40, 400, 140),
        kind: "grid",
        direction: "vertical",
      });
      overlay.setSelection({
        rect: rect(60, 60, 160, 100),
        label: "card.featured",
        confidence: "medium",
      });
      overlay.setDropIndicator(rect(60, 168, 320, 3));
      overlay.setResizeHandles(rect(60, 60, 160, 100));
      overlay.setRotationHandle(rect(60, 60, 160, 100));
      overlay.setChangedBadge({ rect: rect(60, 60, 160, 100), label: "edited" });
      overlay.setDragGhost({ rect: rect(240, 80, 120, 90), kind: "placeholder" });
      snapGuides.setSnapGuides(SNAP_CANDIDATES, { bounds: SNAP_BOUNDS });
    },
  },
];

/** Look up a scenario by id (throws if missing — guards against drift). */
export function getScenario(id: string): OverlayScenario {
  const found = OVERLAY_SCENARIOS.find((s) => s.id === id);
  if (found === undefined) {
    throw new Error(`unknown overlay scenario: ${id}`);
  }
  return found;
}
