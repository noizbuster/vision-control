import type { ReorderChildOperation, ReparentElementOperation } from "@vision-control/change-ir";
import type { Point, Rect } from "@vision-control/geometry";
import type {
  LayoutRole,
  MoveInsertionInput,
  MoveInsertionResolution,
  MoveItemBox,
} from "@vision-control/layout-engine";

import type { PointerId } from "../pointer-ownership.js";
import type { FeasibilityReport, ReparentElementDescriptor } from "./reparent-feasibility.js";

export type MoveOperation = ReorderChildOperation | ReparentElementOperation;

export type MoveCancelReason =
  | "pointer-cancel"
  | "pointer-capture-failed"
  | "lost-pointer-capture"
  | "escape"
  | "selection-changed"
  | "source-detached"
  | "source-changed"
  | "mode-switch"
  | "window-blur"
  | "controller-detached"
  | "invalid-drop"
  | "release-validation-failed";

export type MoveDiagnosticCode =
  | "no-target"
  | "invalid-drop-target"
  | "invalid-geometry"
  | "ambiguous-flex-lines"
  | "css-order-unrepresentable"
  | "unsupported-context"
  | "unsupported-grid"
  | "unsupported-free-move"
  | "unsafe-reparent"
  | "source-changed"
  | "pointer-capture-failed"
  | "release-validation-failed";

export interface MoveDiagnostic {
  readonly code: MoveDiagnosticCode;
  readonly message: string;
}

export interface MoveSource {
  readonly element: ReparentElementDescriptor;
  readonly sourceParent: ReparentElementDescriptor;
  readonly sourceIndex: number;
  readonly startPoint: Point;
  readonly sourceRect: Rect;
  readonly order: number;
  readonly sourceParentRole: LayoutRole;
  readonly sourceContextPositioned: boolean;
}

export interface MoveCandidate {
  readonly targetParent: ReparentElementDescriptor;
  readonly parentRect: Rect;
  readonly childCount: number;
  readonly items: readonly MoveItemBox[];
  readonly layoutRole: LayoutRole;
  readonly targetContextPositioned: boolean;
  readonly flow: MoveInsertionInput["flow"];
}

export type MoveEvaluation =
  | { readonly kind: "invalid"; readonly diagnostic: MoveDiagnostic }
  | {
      readonly kind: "valid";
      readonly intent: "reorder" | "reparent";
      readonly candidate: MoveCandidate;
      readonly insertion: Extract<MoveInsertionResolution, { readonly ok: true }>;
      readonly feasibility: FeasibilityReport | null;
    };

export type MoveState =
  | { readonly kind: "drag-pending"; readonly source: MoveSource; readonly pointerId: PointerId }
  | {
      readonly kind: "dragging";
      readonly source: MoveSource;
      readonly pointerId: PointerId;
      readonly point: Point;
      readonly candidate: MoveCandidate | null;
      readonly evaluation: MoveEvaluation;
    }
  | {
      readonly kind: "dropped";
      readonly source: MoveSource;
      readonly pointerId: PointerId;
      readonly operation: MoveOperation;
    }
  | {
      readonly kind: "committed";
      readonly source: MoveSource;
      readonly pointerId: PointerId;
      readonly operation: MoveOperation | null;
    }
  | {
      readonly kind: "cancelled";
      readonly source: MoveSource;
      readonly pointerId: PointerId;
      readonly reason: MoveCancelReason;
      readonly operation: null;
    };

export interface MoveResult {
  readonly state: MoveState;
  readonly operation: MoveOperation | null;
  readonly diagnostic: MoveDiagnostic | null;
}
