import type {
  GridReorderOperation,
  GridSpanOperation,
  GroupReorderOperation,
  Operation,
} from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { Rect } from "@vision-control/geometry";
import type {
  ReorderLayoutContext,
  ReorderState,
  ReorderTarget,
} from "@vision-control/interaction-machine";
import {
  classifySemanticIntent,
  isNormalFlowRole,
  type LayoutRole,
} from "@vision-control/layout-engine";
import { createDropIndicator, type DropIndicatorApi } from "@vision-control/overlay-ui";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
  type PreviewDomAdapter,
  type PreviewManager,
} from "@vision-control/preview-engine";

import {
  createReorderCommandActions,
  type GridReorderRequest,
  type GridSpanRequest,
  type ReorderCommandActions,
  type ReorderDiagnostic,
  resolveKeyboardReorder,
} from "./reorder-command-actions.js";
import {
  getOrAssignMoveRuntimeId,
  layoutRoleForElement,
  type MovePlacementDiagnostic,
  measureReorderContainer,
  rectFor,
} from "./reorder-dom-context.js";
import {
  createReorderPointerGesture,
  type ReorderPointerGesture,
} from "./reorder-pointer-gesture.js";

export type {
  GridReorderRequest,
  GridSpanRequest,
  ReorderDiagnostic,
} from "./reorder-command-actions.js";

export interface ReorderControllerOptions {
  readonly recordOperation: (operation: Operation) => void;
  readonly onDiagnostic: (diagnostic: ReorderDiagnostic) => void;
  readonly onMoveRejection?: (diagnostic: MovePlacementDiagnostic) => void;
  readonly overlayContainer: HTMLElement;
  readonly previewManager?: PreviewManager;
}

export class ReorderController {
  private readonly recordOperation: (operation: Operation) => void;
  private readonly onDiagnostic: (diagnostic: ReorderDiagnostic) => void;
  private readonly onMoveRejection: (diagnostic: MovePlacementDiagnostic) => void;
  private readonly previewManager: PreviewManager;
  private readonly dom: PreviewDomAdapter;
  private readonly dropIndicator: DropIndicatorApi;
  private readonly gesture: ReorderPointerGesture;
  private readonly commands: ReorderCommandActions;
  private selectedElement: Element | null = null;
  private parentElement: Element | null = null;
  private selectedRuntimeId: string | null = null;
  private parentRuntimeId: string | null = null;
  private readonly boundKeyDown: (event: KeyboardEvent) => void;

  constructor(options: ReorderControllerOptions) {
    this.recordOperation = options.recordOperation;
    this.onDiagnostic = options.onDiagnostic;
    this.onMoveRejection = options.onMoveRejection ?? (() => {});
    this.dom = createBrowserPreviewDomAdapter();
    this.previewManager = options.previewManager ?? createPreviewManager({ dom: this.dom });
    this.dropIndicator = createDropIndicator(options.overlayContainer);
    this.gesture = createReorderPointerGesture({
      document,
      resolveStart: (event) => this.resolvePointerStart(event),
      readContext: () => this.layoutContext(),
      onStateChange: (state) => this.updateDropIndicator(state),
      onRelease: (result) => {
        if (result.operation !== null) {
          this.previewManager.applyOperation(result.operation);
          this.recordOperation(result.operation);
        }
      },
    });
    this.commands = createReorderCommandActions({
      recordOperation: this.recordOperation,
      onDiagnostic: this.onDiagnostic,
      getParentLayoutRole: () =>
        this.parentElement === null ? null : layoutRoleForElement(this.parentElement),
    });
    this.boundKeyDown = this.handleKeyDown.bind(this);
  }

  setSelectedElement(element: Element | null): void {
    this.selectedElement = element;
    this.parentElement = element?.parentElement ?? null;
    this.selectedRuntimeId = null;
    this.parentRuntimeId = null;
  }

  setMultiSelectGroup(group: MultiSelectGroup | null): void {
    this.commands.setMultiSelectGroup(group);
  }

  reorderGroup(newOrder: readonly number[]): GroupReorderOperation | null {
    return this.commands.reorderGroup(newOrder);
  }

  reorderGrid(request: GridReorderRequest): GridReorderOperation | null {
    return this.commands.reorderGrid(request);
  }

  resizeGridSpan(request: GridSpanRequest): GridSpanOperation | null {
    return this.commands.resizeGridSpan(request);
  }

  reportMoveDiagnostic(diagnostic: MovePlacementDiagnostic): void {
    this.onDiagnostic(diagnostic);
  }

  attach(): void {
    if (this.gesture.isActive()) return;
    this.gesture.attach();
    document.addEventListener("keydown", this.boundKeyDown, true);
  }

  detach(): void {
    if (!this.gesture.isActive()) return;
    this.gesture.detach();
    document.removeEventListener("keydown", this.boundKeyDown, true);
    this.dropIndicator.hideDropIndicator();
  }

  isActive(): boolean {
    return this.gesture.isActive();
  }

  private ensureRuntimeIds(): boolean {
    if (this.selectedElement === null || this.parentElement === null) return false;
    this.selectedRuntimeId = getOrAssignMoveRuntimeId(this.selectedElement);
    this.parentRuntimeId = getOrAssignMoveRuntimeId(this.parentElement);
    this.dom.registerElement(this.selectedRuntimeId, this.selectedElement);
    this.dom.registerElement(this.parentRuntimeId, this.parentElement);
    return true;
  }

  private selectedIndex(): number {
    return this.parentElement === null || this.selectedElement === null
      ? -1
      : Array.from(this.parentElement.children).indexOf(this.selectedElement);
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
    if (intent.kind === "unsupported-grid" || intent.kind === "unsupported-free-move") {
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

  private layoutContext(): ReorderLayoutContext | null {
    if (this.parentElement === null || this.parentRuntimeId === null) return null;
    const result = measureReorderContainer(this.parentElement, this.selectedElement);
    if (!result.ok) {
      this.onMoveRejection(result.diagnostic);
      this.reportMoveDiagnostic(result.diagnostic);
      return null;
    }
    return {
      parent: {
        runtimeId: this.parentRuntimeId,
        tagName: this.parentElement.tagName.toLowerCase(),
      },
      children: result.measurement.children,
      layoutRole: result.measurement.layoutRole,
      flow: result.measurement.flow,
    };
  }

  private updateDropIndicator(state: ReorderState | null): void {
    if (state?.kind !== "dragging" || this.parentElement === null) {
      this.dropIndicator.hideDropIndicator();
      return;
    }
    const parentRect = rectFor(this.parentElement);
    const { axis, position } = state.insertion.indicator;
    const rect: Rect =
      axis === "x"
        ? { x: position - 1, y: parentRect.y, width: 2, height: parentRect.height }
        : { x: parentRect.x, y: position - 1, width: parentRect.width, height: 2 };
    this.dropIndicator.showDropIndicator(rect, axis === "x" ? "vertical" : "horizontal");
  }

  private resolvePointerStart(event: PointerEvent): ReorderTarget | null {
    if (
      this.selectedElement === null ||
      !(event.target instanceof Element) ||
      !this.selectedElement.contains(event.target)
    )
      return null;
    this.parentElement = this.selectedElement.parentElement;
    if (!this.ensureRuntimeIds()) return null;
    const context = this.layoutContext();
    if (context === null || !this.checkContext(context.layoutRole)) return null;
    const fromIndex = this.selectedIndex();
    if (fromIndex < 0 || this.selectedRuntimeId === null || this.parentRuntimeId === null)
      return null;
    return {
      element: {
        runtimeId: this.selectedRuntimeId,
        tagName: this.selectedElement.tagName.toLowerCase(),
      },
      parent: {
        runtimeId: this.parentRuntimeId,
        tagName: this.parentElement?.tagName.toLowerCase() ?? "",
      },
      fromIndex,
      startPoint: { x: event.clientX, y: event.clientY },
    };
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.selectedElement === null) return;
    const direction = event.key;
    this.parentElement = this.selectedElement.parentElement;
    if (!this.ensureRuntimeIds()) return;
    const context = this.layoutContext();
    if (context === null || !this.checkContext(context.layoutRole)) return;
    const fromIndex = this.selectedIndex();
    if (this.selectedRuntimeId === null || this.parentRuntimeId === null) return;
    const operation = resolveKeyboardReorder({
      direction,
      fromIndex,
      childCount: this.parentElement?.children.length ?? 0,
      parentRuntimeId: this.parentRuntimeId,
      childRuntimeId: this.selectedRuntimeId,
    });
    if (operation === null) return;
    this.previewManager.applyOperation(operation);
    this.recordOperation(operation);
    event.preventDefault();
  }
}
