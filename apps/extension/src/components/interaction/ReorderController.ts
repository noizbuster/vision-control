import {
  createOperationId,
  type GridReorderOperation,
  type GridSpanOperation,
  type GroupReorderOperation,
  type Operation,
  type ReorderChildOperation,
} from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { ElementRef } from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import {
  beginReorder,
  buildGroupReorderOperation,
  createPointerId,
  endReorder,
  type ReorderLayoutContext,
  type ReorderState,
  type ReorderTarget,
  updateReorder,
} from "@vision-control/interaction-machine";
import {
  classifyGroupMove,
  classifyLayoutRole,
  classifySemanticIntent,
  type GridUserChoice,
  isNormalFlowRole,
  type LayoutRole,
  resolveGridIntent,
} from "@vision-control/layout-engine";
import { createDropIndicator, type DropIndicatorApi } from "@vision-control/overlay-ui";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
  PREVIEW_ID_ATTR,
  type PreviewDomAdapter,
  type PreviewManager,
} from "@vision-control/preview-engine";

/** Diagnostic surfaced when a reorder cannot or should not be auto-applied. */
export interface ReorderDiagnostic {
  readonly kind:
    | "unsupported-context"
    | "css-order-warning"
    | "unsupported-group-free-move"
    | "grid-a11y-warning"
    | "grid-reorder-rejected";
  readonly message: string;
}

/** Request for a CSS Grid reorder (VC-V1V2-09). */
export interface GridReorderRequest {
  readonly grid: ElementRef;
  readonly child: ElementRef;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly previousGridArea?: string;
  readonly newGridArea: string;
  readonly userChoice: GridUserChoice;
  readonly accessibilitySemanticMatch: boolean;
  readonly visualMatchesReadingOrder: boolean;
}

/** Request for a CSS Grid span resize (VC-V1V2-09). */
export interface GridSpanRequest {
  readonly grid: ElementRef;
  readonly child: ElementRef;
  readonly axis: "column" | "row";
  readonly fromSpan: number;
  readonly toSpan: number;
}

/** Dependencies required by {@link ReorderController}. */
export interface ReorderControllerOptions {
  /** Callback invoked with the final source-intent operation. */
  readonly recordOperation: (operation: Operation) => void;
  /** Callback invoked for diagnostics (unsupported contexts, CSS order warnings). */
  readonly onDiagnostic: (diagnostic: ReorderDiagnostic) => void;
  /** Overlay container where the drop indicator line is rendered. */
  readonly overlayContainer: HTMLElement;
  /** Optional preview manager; a browser-backed one is created when omitted. */
  readonly previewManager?: PreviewManager;
}

/**
 * Coordinates a same-parent reorder gesture in a content-script context.
 *
 * The controller wires raw pointer events to the interaction-machine reorder
 * lifecycle, renders a drop indicator through overlay-ui, applies structural
 * previews via the preview engine, and emits the final `reorder-child`
 * operation through `recordOperation`.
 *
 * It enforces PRD constraint 2: a normal-flow drag never collapses to an
 * absolute/transform source intent. Grid and positioned contexts are rejected
 * with a diagnostic instead.
 */
export class ReorderController {
  private readonly recordOperation: (operation: Operation) => void;
  private readonly onDiagnostic: (diagnostic: ReorderDiagnostic) => void;
  private readonly previewManager: PreviewManager;
  private readonly dom: PreviewDomAdapter;
  private readonly dropIndicator: DropIndicatorApi;

  private selectedElement: Element | null = null;
  private parentElement: Element | null = null;
  private selectedRuntimeId: string | null = null;
  private parentRuntimeId: string | null = null;
  private state: ReorderState | null = null;
  private active = false;
  private multiSelectGroup: MultiSelectGroup | null = null;

  private readonly boundPointerDown: (event: PointerEvent) => void;
  private readonly boundPointerMove: (event: PointerEvent) => void;
  private readonly boundPointerUp: (event: PointerEvent) => void;
  private readonly boundPointerCancel: (event: PointerEvent) => void;
  private readonly boundKeyDown: (event: KeyboardEvent) => void;

  constructor(options: ReorderControllerOptions) {
    this.recordOperation = options.recordOperation;
    this.onDiagnostic = options.onDiagnostic;
    this.dom = createBrowserPreviewDomAdapter();
    this.previewManager = options.previewManager ?? createPreviewManager({ dom: this.dom });
    this.dropIndicator = createDropIndicator(options.overlayContainer);

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerCancel = this.handlePointerCancel.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
  }

  /** Set or clear the currently selected element. */
  setSelectedElement(element: Element | null): void {
    this.selectedElement = element;
    this.parentElement = element?.parentElement ?? null;
    this.registerElements();
  }

  /**
   * Set or clear the active multi-select group. When a group is active, the
   * controller can issue a group-reorder of the group's siblings within their
   * shared parent. Pass `null` to revert to single-element reorder.
   */
  setMultiSelectGroup(group: MultiSelectGroup | null): void {
    this.multiSelectGroup = group;
  }

  /**
   * Reorder the active multi-select group's members within their shared parent.
   * `newOrder` is parallel to the group's members: `newOrder[i]` is the target
   * DOM index for member i. The previous order is read from the live DOM.
   *
   * Builds a `group-reorder` operation (per-element source refs + before/after
   * index arrays for a lossless inverse) and records it via `recordOperation`.
   * Preview application is deferred: the preview engine does not yet render V1
   * group kinds (Wave-2 gap), so the operation is recorded as source intent
   * without a live structural preview.
   *
   * Returns the recorded operation, or `null` when no group is active, the
   * context rejects the move, or the order is unchanged.
   */
  reorderGroup(newOrder: readonly number[]): GroupReorderOperation | null {
    const group = this.multiSelectGroup;
    if (group === null || group.commonParent === null) {
      return null;
    }

    const role = this.getParentLayoutRole() ?? "normal-flow-block";
    const candidate = classifyGroupMove({
      sameParent: true,
      sourceParentRole: role,
      targetParentRole: role,
      validContentModel: true,
    });
    if (candidate.kind === "unsupported-group-free-move") {
      this.onDiagnostic({ kind: "unsupported-group-free-move", message: candidate.message });
      return null;
    }
    if (candidate.kind !== "group-reorder") {
      this.onDiagnostic({
        kind: "unsupported-context",
        message: `group reorder not allowed in this context (${candidate.kind})`,
      });
      return null;
    }

    const parent = group.commonParent;
    const previousOrder = group.members.map((m) => {
      const el = document.querySelector(`[${PREVIEW_ID_ATTR}="${m.runtimeId}"]`);
      if (el === null || el.parentElement === null) return -1;
      return Array.from(el.parentElement.children).indexOf(el);
    });
    if (previousOrder.some((i) => i < 0)) {
      this.onDiagnostic({
        kind: "unsupported-context",
        message: "one or more group members are no longer in the DOM (stale selection)",
      });
      return null;
    }

    const unchanged =
      previousOrder.length === newOrder.length && previousOrder.every((v, i) => v === newOrder[i]);
    if (unchanged) return null;

    const operation = buildGroupReorderOperation(group, parent, previousOrder, newOrder);
    this.recordOperation(operation);
    return operation;
  }

  /**
   * Resolve a CSS Grid reorder through the V1 grid-aware flow (VC-V1V2-09):
   * cell-inferred indices/areas → user-visible DOM-order-vs-grid-area choice →
   * semantic source intent. The accessibility guard lives in the layout-engine
   * `resolveGridIntent`: a visual grid placement never silently rewrites DOM
   * order.
   *
   * When the resolution is `grid-area` and the placement desyncs visual order
   * from DOM reading order, a `grid-a11y-warning` diagnostic is surfaced (the
   * operation is still recorded — grid-area does not touch the DOM). When the
   * resolution is `rejected`, a `grid-reorder-rejected` diagnostic is surfaced
   * and nothing is recorded.
   *
   * Returns the recorded `grid-reorder` operation, or `null` when rejected.
   */
  reorderGrid(request: GridReorderRequest): GridReorderOperation | null {
    const resolution = resolveGridIntent({
      userChoice: request.userChoice,
      fromIndex: request.fromIndex,
      toIndex: request.toIndex,
      ...(request.previousGridArea !== undefined
        ? { previousGridArea: request.previousGridArea }
        : {}),
      newGridArea: request.newGridArea,
      accessibilitySemanticMatch: request.accessibilitySemanticMatch,
      visualMatchesReadingOrder: request.visualMatchesReadingOrder,
    });

    if (resolution.kind === "rejected") {
      this.onDiagnostic({ kind: "grid-reorder-rejected", message: resolution.reason });
      return null;
    }

    if (resolution.a11yWarning !== null) {
      this.onDiagnostic({ kind: "grid-a11y-warning", message: resolution.a11yWarning });
    }

    const operation: GridReorderOperation = {
      id: createOperationId(),
      kind: "grid-reorder",
      runtime: false,
      timestamp: Date.now(),
      origin: "canvas-drag",
      confidence: 1,
      grid: request.grid,
      child: request.child,
      placement: resolution.kind,
      fromIndex: request.fromIndex,
      toIndex: request.toIndex,
      ...(resolution.kind === "grid-area" && resolution.previousGridArea !== undefined
        ? { previousGridArea: resolution.previousGridArea }
        : {}),
      ...(resolution.kind === "grid-area" ? { newGridArea: resolution.newGridArea } : {}),
    };
    this.recordOperation(operation);
    return operation;
  }

  /**
   * Resize a grid child's column or row span (VC-V1V2-09). Builds and records a
   * `grid-span` operation with the before/after span pair (lossless inverse via
   * change-ir). Returns the recorded operation, or `null` for a no-op resize.
   */
  resizeGridSpan(request: GridSpanRequest): GridSpanOperation | null {
    if (request.fromSpan === request.toSpan || request.toSpan < 1) {
      return null;
    }
    const operation: GridSpanOperation = {
      id: createOperationId(),
      kind: "grid-span",
      runtime: false,
      timestamp: Date.now(),
      origin: "canvas-drag",
      confidence: 1,
      grid: request.grid,
      child: request.child,
      axis: request.axis,
      fromSpan: request.fromSpan,
      toSpan: request.toSpan,
    };
    this.recordOperation(operation);
    return operation;
  }

  /** Attach global pointer and keyboard listeners. */
  attach(): void {
    if (this.active) return;
    this.active = true;
    document.addEventListener("pointerdown", this.boundPointerDown, true);
    document.addEventListener("pointermove", this.boundPointerMove, true);
    document.addEventListener("pointerup", this.boundPointerUp, true);
    document.addEventListener("pointercancel", this.boundPointerCancel, true);
    document.addEventListener("keydown", this.boundKeyDown, true);
  }

  detach(): void {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener("pointerdown", this.boundPointerDown, true);
    document.removeEventListener("pointermove", this.boundPointerMove, true);
    document.removeEventListener("pointerup", this.boundPointerUp, true);
    document.removeEventListener("pointercancel", this.boundPointerCancel, true);
    document.removeEventListener("keydown", this.boundKeyDown, true);
    this.dropIndicator.hideDropIndicator();
    this.state = null;
  }

  /** Whether the controller is currently listening for events. */
  isActive(): boolean {
    return this.active;
  }

  private registerElements(): void {
    if (this.selectedElement !== null && this.selectedRuntimeId !== null) {
      this.dom.registerElement(this.selectedRuntimeId, this.selectedElement);
    }
    if (this.parentElement !== null && this.parentRuntimeId !== null) {
      this.dom.registerElement(this.parentRuntimeId, this.parentElement);
    }
  }

  private ensureRuntimeIds(): boolean {
    if (this.selectedElement === null || this.parentElement === null) {
      return false;
    }
    this.selectedRuntimeId = this.getOrAssignRuntimeId(this.selectedElement);
    this.parentRuntimeId = this.getOrAssignRuntimeId(this.parentElement);
    this.registerElements();
    return true;
  }

  private getOrAssignRuntimeId(element: Element): string {
    const existing = element.getAttribute(PREVIEW_ID_ATTR);
    if (existing !== null && existing.length > 0) {
      return existing;
    }
    const runtimeId = `vc-reorder-${createOperationId()}`;
    element.setAttribute(PREVIEW_ID_ATTR, runtimeId);
    return runtimeId;
  }

  private getSelectedIndex(): number {
    if (this.parentElement === null || this.selectedElement === null) {
      return -1;
    }
    return Array.from(this.parentElement.children).indexOf(this.selectedElement);
  }

  private getParentLayoutRole(): LayoutRole | null {
    if (this.parentElement === null) {
      return null;
    }
    const style = window.getComputedStyle(this.parentElement);
    return classifyLayoutRole({
      display: style.display,
      flexDirection: style.flexDirection,
      position: style.position,
    });
  }

  private checkContext(role: LayoutRole): boolean {
    const intent = classifySemanticIntent({
      sameParent: true,
      sourceParentRole: role,
      targetParentRole: role,
      validContentModel: true,
      sourceContextPositioned: false,
      targetContextPositioned: false,
    });

    if (intent.kind === "unsupported-grid") {
      this.onDiagnostic({ kind: "unsupported-context", message: intent.message });
      return false;
    }
    if (intent.kind === "unsupported-free-move") {
      this.onDiagnostic({ kind: "unsupported-context", message: intent.message });
      return false;
    }
    if (!isNormalFlowRole(role)) {
      this.onDiagnostic({
        kind: "unsupported-context",
        message: "reorder is only supported in normal-flow flex or block containers",
      });
      return false;
    }
    return true;
  }

  private checkCssOrderWarning(): void {
    if (this.parentElement === null) return;
    const children = Array.from(this.parentElement.children);
    const hasOrder = children.some((child) => {
      const order = window.getComputedStyle(child).order;
      return order !== "" && order !== "0" && order !== "0px";
    });
    if (hasOrder) {
      this.onDiagnostic({
        kind: "css-order-warning",
        message:
          "Container children use CSS order; visual order may not match DOM order. Review accessibility before applying.",
      });
    }
  }

  private buildLayoutContext(role: LayoutRole): ReorderLayoutContext | null {
    if (this.parentElement === null || this.parentRuntimeId === null) {
      return null;
    }
    const parentStyle = window.getComputedStyle(this.parentElement);
    const children = Array.from(this.parentElement.children)
      .filter((child) => child !== this.selectedElement)
      .map((child) => {
        const rect = child.getBoundingClientRect();
        return { rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } };
      });
    return {
      parent: {
        runtimeId: this.parentRuntimeId,
        tagName: this.parentElement.tagName.toLowerCase(),
      },
      children,
      layoutRole: role,
      flexDirection: parentStyle.flexDirection,
    };
  }

  private buildOperation(toIndex: number): ReorderChildOperation {
    const selectedRuntimeId = this.selectedRuntimeId;
    const parentRuntimeId = this.parentRuntimeId;
    if (
      selectedRuntimeId === null ||
      parentRuntimeId === null ||
      this.selectedElement === null ||
      this.parentElement === null
    ) {
      throw new Error("ReorderController: no selected element");
    }
    const fromIndex = this.getSelectedIndex();
    return {
      id: createOperationId(),
      kind: "reorder-child",
      runtime: false,
      timestamp: Date.now(),
      origin: "canvas-drag",
      confidence: 1,
      parent: {
        runtimeId: parentRuntimeId,
      },
      child: {
        runtimeId: selectedRuntimeId,
      },
      fromIndex,
      toIndex,
    };
  }

  private updateDropIndicator(state: ReorderState): void {
    if (state.kind !== "dragging" || this.parentElement === null) {
      this.dropIndicator.hideDropIndicator();
      return;
    }
    const parentRect = this.parentElement.getBoundingClientRect();
    const axis = state.insertion.indicator.axis;
    const position = state.insertion.indicator.position;
    const rect: Rect =
      axis === "x"
        ? {
            x: position - 1,
            y: parentRect.top,
            width: 2,
            height: parentRect.height,
          }
        : {
            x: parentRect.left,
            y: position - 1,
            width: parentRect.width,
            height: 2,
          };
    this.dropIndicator.showDropIndicator(rect, axis === "x" ? "vertical" : "horizontal");
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.state !== null && this.state.kind !== "committed") {
      return;
    }
    if (this.selectedElement === null || event.target !== this.selectedElement) {
      return;
    }
    this.parentElement = this.selectedElement.parentElement;
    if (!this.ensureRuntimeIds()) {
      return;
    }
    const role = this.getParentLayoutRole();
    if (role === null || !this.checkContext(role)) {
      return;
    }
    this.checkCssOrderWarning();

    const fromIndex = this.getSelectedIndex();
    if (fromIndex < 0) {
      return;
    }

    const selectedRuntimeId = this.selectedRuntimeId;
    const parentRuntimeId = this.parentRuntimeId;
    if (selectedRuntimeId === null || parentRuntimeId === null) {
      return;
    }

    const target: ReorderTarget = {
      element: {
        runtimeId: selectedRuntimeId,
        tagName: this.selectedElement.tagName.toLowerCase(),
      },
      parent: {
        runtimeId: parentRuntimeId,
        tagName: this.parentElement?.tagName.toLowerCase() ?? "",
      },
      fromIndex,
      startPoint: { x: event.clientX, y: event.clientY },
    };

    this.state = beginReorder(target, createPointerId(String(event.pointerId)));
    event.preventDefault();
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.state === null || this.state.pointerId !== String(event.pointerId)) {
      return;
    }
    const role = this.getParentLayoutRole();
    if (role === null) {
      return;
    }
    const context = this.buildLayoutContext(role);
    if (context === null) {
      return;
    }
    this.state = updateReorder(this.state, event.clientX, event.clientY, context);
    this.updateDropIndicator(this.state);
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.state === null || this.state.pointerId !== String(event.pointerId)) {
      return;
    }
    const { operation } = endReorder(this.state);

    if (operation !== null) {
      this.previewManager.applyOperation(operation);
      this.recordOperation(operation);
    }

    this.state = null;
    this.dropIndicator.hideDropIndicator();
  }

  private handlePointerCancel(event: PointerEvent): void {
    if (this.state === null || this.state.pointerId !== String(event.pointerId)) {
      return;
    }
    this.state = null;
    this.dropIndicator.hideDropIndicator();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.selectedElement === null) {
      return;
    }
    const direction = event.key;
    if (
      direction !== "ArrowUp" &&
      direction !== "ArrowDown" &&
      direction !== "ArrowLeft" &&
      direction !== "ArrowRight"
    ) {
      return;
    }
    if (!this.ensureRuntimeIds()) {
      return;
    }
    const role = this.getParentLayoutRole();
    if (role === null || !this.checkContext(role)) {
      return;
    }
    this.checkCssOrderWarning();

    const fromIndex = this.getSelectedIndex();
    const childCount = this.parentElement?.children.length ?? 0;
    const delta = direction === "ArrowUp" || direction === "ArrowLeft" ? -1 : 1;
    const toIndex = Math.max(0, Math.min(childCount - 1, fromIndex + delta));

    if (toIndex === fromIndex) {
      return;
    }

    const operation = this.buildOperation(toIndex);
    this.previewManager.applyOperation(operation);
    this.recordOperation(operation);

    event.preventDefault();
  }
}
