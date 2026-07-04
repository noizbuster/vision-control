/**
 * Projection of the inspector `SelectionSummary` into a JSON-safe
 * {@link TargetSummary} (no live `Element` reference). Shared by the compiler
 * (which then applies selector redaction) and the ChangeSet privacy computer
 * (which needs the projected target for selector matching).
 */

import type { SelectionSummary } from "@vision-control/inspector-core";

import type { TargetSummary } from "./context-schema.js";

export const projectSelectionToTarget = (selection: SelectionSummary): TargetSummary => ({
  identity: {
    ...(selection.identity.runtimeId !== undefined
      ? { runtimeId: selection.identity.runtimeId }
      : {}),
    ...(selection.identity.sourceId !== undefined ? { sourceId: selection.identity.sourceId } : {}),
    ...(selection.identity.fingerprint !== undefined
      ? { fingerprint: selection.identity.fingerprint }
      : {}),
    ...(selection.identity.confidence !== undefined
      ? { confidence: selection.identity.confidence }
      : {}),
    selectors: collectSelectors(selection),
  },
  semantic: {
    tagName: selection.semantic.tagName,
    ...(selection.semantic.role !== undefined ? { role: selection.semantic.role } : {}),
    ...(selection.semantic.name !== undefined ? { name: selection.semantic.name } : {}),
    ...(selection.semantic.description !== undefined
      ? { description: selection.semantic.description }
      : {}),
    textContentPreview: selection.semantic.textContentPreview,
  },
  breadcrumb: selection.breadcrumb.map((item) => ({
    tagName: item.tagName,
    ...(item.id !== undefined ? { id: item.id } : {}),
    ...(item.className !== undefined ? { className: item.className } : {}),
    ...(item.role !== undefined ? { role: item.role } : {}),
    ...(item.selector !== undefined ? { selector: item.selector } : {}),
  })),
  computedStyle: { ...selection.computedStyle },
  boxModel: {
    contentWidth: selection.boxModel.content.width,
    contentHeight: selection.boxModel.content.height,
    positionX: selection.boxModel.position.x,
    positionY: selection.boxModel.position.y,
  },
  classList: selection.classList.map((entry) => ({ name: entry.name, source: entry.source })),
  attributes: selection.attributes.map((entry) => ({ name: entry.name, value: entry.value })),
});

const collectSelectors = (selection: SelectionSummary): string[] => {
  const selectors: string[] = [];
  if (selection.identity.selector !== undefined && selection.identity.selector.length > 0) {
    selectors.push(selection.identity.selector);
  }
  for (const item of selection.breadcrumb) {
    if (
      item.selector !== undefined &&
      item.selector.length > 0 &&
      !selectors.includes(item.selector)
    ) {
      selectors.push(item.selector);
    }
  }
  return selectors;
};
