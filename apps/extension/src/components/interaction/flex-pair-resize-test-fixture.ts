import { buildPreviewSelector } from "@vision-control/preview-engine";
import { vi } from "vitest";

import type { InteractionHarness } from "../../overlay/interaction-wiring.test-fixtures.js";
import { requireSelectionContext } from "../../overlay/interaction-wiring.test-fixtures.js";

export interface FlexPairDomFixture {
  readonly container: HTMLElement;
  readonly primary: HTMLElement;
  readonly neighbor: HTMLElement;
  readonly witness: HTMLElement;
}

const pixelValue = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const usedMainSize = (element: HTMLElement): number => {
  const style = getComputedStyle(element);
  const basis = pixelValue(style.flexBasis);
  if (style.boxSizing === "border-box") return basis;
  return (
    basis +
    pixelValue(style.paddingLeft) +
    pixelValue(style.paddingRight) +
    pixelValue(style.borderLeftWidth) +
    pixelValue(style.borderRightWidth)
  );
};

const rect = (x: number, width: number): DOMRect => new DOMRect(x, 0, width, 80);

export function createFlexPairDom(): FlexPairDomFixture {
  const style = document.createElement("style");
  style.textContent = `
    .pair-row { display: flex; flex-flow: row nowrap; width: 400px; height: 80px; }
    .pair-cell { box-sizing: border-box; height: 80px; margin: 0; padding: 0;
      border: 0px solid transparent; transform: none; zoom: 1; }
    .pair-primary { box-sizing: content-box; flex: 1 1 138px; min-width: 50px;
      max-width: 300px; padding: 0 10px; border: 0 solid; border-width: 0 1px; }
    .pair-neighbor { box-sizing: border-box; flex: 2 1 140px; min-width: 50px;
      max-width: none; }
    .pair-witness { box-sizing: border-box; flex: 0 0 100px; min-width: 50px;
      max-width: none; }
  `;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.className = "pair-row";
  const primary = document.createElement("div");
  primary.className = "pair-cell pair-primary";
  const neighbor = document.createElement("div");
  neighbor.className = "pair-cell pair-neighbor";
  const witness = document.createElement("div");
  witness.className = "pair-cell pair-witness";
  container.append(primary, neighbor, witness);
  document.body.appendChild(container);

  vi.spyOn(container, "getBoundingClientRect").mockImplementation(() => rect(0, 400));
  vi.spyOn(primary, "getBoundingClientRect").mockImplementation(() =>
    rect(0, usedMainSize(primary)),
  );
  vi.spyOn(neighbor, "getBoundingClientRect").mockImplementation(() =>
    rect(usedMainSize(primary), usedMainSize(neighbor)),
  );
  vi.spyOn(witness, "getBoundingClientRect").mockImplementation(() =>
    rect(usedMainSize(primary) + usedMainSize(neighbor), usedMainSize(witness)),
  );
  return { container, primary, neighbor, witness };
}

export function createIdenticalFlexPairDom(): FlexPairDomFixture {
  const style = document.createElement("style");
  style.textContent = `
    .identical-row { display: flex; flex-flow: row nowrap; width: 300px; height: 80px; }
    .identical-cell { box-sizing: border-box; flex: 0 0 100px; min-width: 40px;
      max-width: none; width: 100px; height: 80px; margin: 0; padding: 0;
      border: 0px solid transparent; transform: none; zoom: 1; }
  `;
  document.head.appendChild(style);
  const container = document.createElement("div");
  container.className = "identical-row";
  const primary = document.createElement("div");
  const neighbor = document.createElement("div");
  const witness = document.createElement("div");
  primary.className = "identical-cell";
  neighbor.className = "identical-cell";
  witness.className = "identical-cell";
  container.append(primary, neighbor, witness);
  document.body.appendChild(container);
  vi.spyOn(container, "getBoundingClientRect").mockImplementation(() => rect(0, 300));
  vi.spyOn(primary, "getBoundingClientRect").mockImplementation(() =>
    rect(0, usedMainSize(primary)),
  );
  vi.spyOn(neighbor, "getBoundingClientRect").mockImplementation(() =>
    rect(usedMainSize(primary), usedMainSize(neighbor)),
  );
  vi.spyOn(witness, "getBoundingClientRect").mockImplementation(() =>
    rect(usedMainSize(primary) + usedMainSize(neighbor), usedMainSize(witness)),
  );
  return { container, primary, neighbor, witness };
}

export function selectFlexPrimary(harness: InteractionHarness, fixture: FlexPairDomFixture): void {
  harness.controllers.onSelectionChange(requireSelectionContext(fixture.primary));
}

export function previewCss(): string {
  return document.querySelector("style[data-vc-preview-stylesheet]")?.textContent ?? "";
}

export function applyPriorPairRules(
  harness: InteractionHarness,
  fixture: FlexPairDomFixture,
): readonly [string, string] {
  const context = requireSelectionContext(fixture.primary).resize;
  const primarySelector = buildPreviewSelector(context.target.ref.runtimeId);
  const neighborSnapshot = context.directChildren[1];
  if (neighborSnapshot === undefined) throw new Error("neighbor snapshot missing");
  const neighborSelector = buildPreviewSelector(neighborSnapshot.ref.runtimeId);
  harness.previewManager.stylesheet.applyRule(primarySelector, "color: red;");
  harness.previewManager.stylesheet.applyRule(neighborSelector, "opacity: .75;");
  return [primarySelector, neighborSelector];
}
