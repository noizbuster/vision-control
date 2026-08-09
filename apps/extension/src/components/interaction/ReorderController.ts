import type {
  GridReorderOperation,
  GridSpanOperation,
  GroupReorderOperation,
  Operation,
} from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { ReorderLayoutContext } from "@vision-control/interaction-machine";
import {
  classifySemanticIntent,
  isNormalFlowRole,
  type LayoutRole,
} from "@vision-control/layout-engine";
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
} from "./reorder-dom-context.js";

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
  private readonly commands: ReorderCommandActions;
  private selectedElement: Element | null = null;
  private parentElement: Element | null = null;
  private selectedRuntimeId: string | null = null;
  private parentRuntimeId: string | null = null;
  private readonly boundKeyDown: (event: KeyboardEvent) => void;
  private attached = false;

  constructor(options: ReorderControllerOptions) {
    this.recordOperation = options.recordOperation;
    this.onDiagnostic = options.onDiagnostic;
    this.onMoveRejection = options.onMoveRejection ?? (() => {});
    this.dom = createBrowserPreviewDomAdapter();
    this.previewManager = options.previewManager ?? createPreviewManager({ dom: this.dom });
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
    if (this.attached) return;
    this.attached = true;
    document.addEventListener("keydown", this.boundKeyDown, true);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    document.removeEventListener("keydown", this.boundKeyDown, true);
  }

  isActive(): boolean {
    return this.attached;
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
