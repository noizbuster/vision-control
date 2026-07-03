import type { Operation, ReorderChildOperation } from "@vision-control/change-ir";
import type { Rect } from "@vision-control/geometry";
import {
  beginReorder,
  commitReorder,
  createPointerId,
  endReorder,
  type ReorderLayoutContext,
  type ReorderState,
  type ReorderTarget,
  updateReorder,
} from "@vision-control/interaction-machine";
import {
  classifyLayoutRole,
  classifySemanticIntent,
  isNormalFlowRole,
  type LayoutRole,
} from "@vision-control/layout-engine";
import { createDropIndicator, type DropIndicatorApi } from "@vision-control/overlay-ui";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
  PREVIEW_ID_ATTR,
  type PreviewDomAdapter,
  type PreviewManager,
} from "@vision-control/preview-engine";

const PREVIEW_DRAG_ID = "preview-drag";

/** Diagnostic surfaced when a reorder cannot or should not be auto-applied. */
export interface ReorderDiagnostic {
  readonly kind: "unsupported-context" | "css-order-warning";
  readonly message: string;
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
  private previewRollback: (() => void) | null = null;
  private active = false;

  private readonly boundPointerDown: (event: PointerEvent) => void;
  private readonly boundPointerMove: (event: PointerEvent) => void;
  private readonly boundPointerUp: (event: PointerEvent) => void;
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
    this.boundKeyDown = this.handleKeyDown.bind(this);
  }

  /** Set or clear the currently selected element. */
  setSelectedElement(element: Element | null): void {
    this.selectedElement = element;
    this.parentElement = element?.parentElement ?? null;
    this.registerElements();
  }

  /** Attach global pointer and keyboard listeners. */
  attach(): void {
    if (this.active) return;
    this.active = true;
    document.addEventListener("pointerdown", this.boundPointerDown, true);
    document.addEventListener("pointermove", this.boundPointerMove, true);
    document.addEventListener("pointerup", this.boundPointerUp, true);
    document.addEventListener("keydown", this.boundKeyDown, true);
  }

  /** Detach all global listeners and clear the active preview. */
  detach(): void {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener("pointerdown", this.boundPointerDown, true);
    document.removeEventListener("pointermove", this.boundPointerMove, true);
    document.removeEventListener("pointerup", this.boundPointerUp, true);
    document.removeEventListener("keydown", this.boundKeyDown, true);
    this.clearPreview();
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
    const runtimeId = `vc-reorder-${crypto.randomUUID()}`;
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
    const children = Array.from(this.parentElement.children).map((child) => {
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
    };
  }

  private buildPreviewOperation(toIndex: number): ReorderChildOperation {
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
      id: PREVIEW_DRAG_ID,
      kind: "reorder-child",
      runtime: false,
      timestamp: Date.now(),
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

  private applyPreviewOperation(toIndex: number): void {
    this.clearPreview();
    const operation = this.buildPreviewOperation(toIndex);
    this.previewRollback = this.previewManager.applyOperation(operation);
  }

  private clearPreview(): void {
    if (this.previewRollback !== null) {
      this.previewRollback();
      this.previewRollback = null;
    }
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
    if (this.selectedElement === null || event.target !== this.selectedElement) {
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
    if (this.state === null) {
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

    if (this.state.kind === "dragging") {
      this.applyPreviewOperation(this.state.toIndex);
    }
  }

  private handlePointerUp(_event: PointerEvent): void {
    if (this.state === null) {
      return;
    }
    this.clearPreview();
    const result = endReorder(this.state);
    this.state = result.state;

    if (result.operation !== null) {
      this.previewRollback = this.previewManager.applyOperation(result.operation);
      this.recordOperation(result.operation);
      this.state = commitReorder(this.state);
    }

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

    const operation = this.buildPreviewOperation(toIndex);
    operation.id = globalThis.crypto.randomUUID();
    this.previewRollback = this.previewManager.applyOperation(operation);
    this.recordOperation(operation);

    event.preventDefault();
  }
}
