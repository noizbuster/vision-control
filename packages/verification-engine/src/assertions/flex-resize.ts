import type { FlexTriple, ResizeFlexPairOperation } from "@vision-control/change-ir";
import { resolveFlexPair } from "../flex-resize-resolution.js";
import type { AssertionEntry, AssertionResult, ResolvedTarget } from "../types.js";
import { buildFlexResizeGeometryAssertions } from "./flex-resize-geometry.js";
import {
  isAssertionResult,
  normalizeCss,
  observe,
  resolutionFailure,
  resolveOrFailure,
} from "./flex-resize-support.js";

function flexTripleMatches(
  target: ResolvedTarget,
  element: Element,
  expected: FlexTriple,
): boolean {
  return (
    normalizeCss(target.dom.getStyle(element, "flex-grow")) === normalizeCss(expected.flexGrow) &&
    normalizeCss(target.dom.getStyle(element, "flex-shrink")) ===
      normalizeCss(expected.flexShrink) &&
    normalizeCss(target.dom.getStyle(element, "flex-basis")) === normalizeCss(expected.flexBasis)
  );
}

function actualFlex(target: ResolvedTarget, element: Element): string {
  return ["flex-grow", "flex-shrink", "flex-basis"]
    .map((property) => `${property}:${normalizeCss(target.dom.getStyle(element, property))}`)
    .join(",");
}

function assertIdentity(
  target: ResolvedTarget,
  operation: ResizeFlexPairOperation,
): AssertionResult {
  const resolution = resolveFlexPair(target, operation);
  return resolution.kind === "failed"
    ? resolutionFailure("resize-flex-pair:identity", resolution.message)
    : observe({
        name: "resize-flex-pair:identity",
        passed: true,
        expected: `${operation.witnesses.length + 3} conjunctively resolved refs`,
        actual: `${operation.witnesses.length + 3} refs resolved by selector occurrence and fingerprint`,
        success: "Container, members, and witnesses resolved conjunctively after HMR.",
        failure: "Paired identity failed.",
      });
}

function assertStructure(
  target: ResolvedTarget,
  operation: ResizeFlexPairOperation,
): AssertionResult {
  const resolved = resolveOrFailure("resize-flex-pair:structure", target, operation);
  if (isAssertionResult(resolved)) return resolved;
  const expected = [
    resolved.primary,
    resolved.neighbor,
    ...resolved.witnesses.map((witness) => witness.element),
  ];
  const distinct = new Set([resolved.container, ...expected]).size === expected.length + 1;
  const direct = expected.every((element) => target.dom.getParent(element) === resolved.container);
  const readDirectChildren = target.dom.getDirectChildren;
  if (readDirectChildren === undefined) {
    return observe({
      name: "resize-flex-pair:structure",
      passed: false,
      expected: "direct-child adapter lens available",
      actual: "direct-child adapter lens missing",
      success: "Direct-child adapter lens is available.",
      failure: "Cannot prove complete flex-item coverage without the direct-child adapter lens.",
    });
  }
  const children = readDirectChildren(resolved.container);
  const display = normalizeCss(target.dom.getStyle(resolved.container, "display"));
  const flexContainer = display === "flex" || display === "inline-flex";
  const actual = children.elements.filter((element) => {
    const childDisplay = normalizeCss(target.dom.getStyle(element, "display"));
    const position = normalizeCss(target.dom.getStyle(element, "position"));
    return (
      childDisplay !== "none" &&
      childDisplay !== "contents" &&
      position !== "absolute" &&
      position !== "fixed"
    );
  });
  const exactSet =
    actual.length === expected.length &&
    actual.every((element) => expected.includes(element)) &&
    expected.every((element) => actual.includes(element));
  const passed = distinct && direct && flexContainer && exactSet && !children.hasNonWhitespaceText;
  return observe({
    name: "resize-flex-pair:structure",
    passed,
    expected: `${expected.length} distinct direct in-flow flex items and no direct text`,
    actual: `${actual.length} in-flow item(s); distinct=${distinct}; direct=${direct}; text=${children.hasNonWhitespaceText}`,
    success: "Pair members and witnesses exactly cover direct in-flow flex items.",
    failure: "Pair members and witnesses do not exactly cover direct in-flow flex items.",
  });
}

function assertFlex(target: ResolvedTarget, operation: ResizeFlexPairOperation): AssertionResult {
  const resolved = resolveOrFailure("resize-flex-pair:flex", target, operation);
  if (isAssertionResult(resolved)) return resolved;
  const primaryMatches = flexTripleMatches(
    target,
    resolved.primary,
    operation.members[0].after.flex,
  );
  const neighborMatches = flexTripleMatches(
    target,
    resolved.neighbor,
    operation.members[1].after.flex,
  );
  return observe({
    name: "resize-flex-pair:flex",
    passed: primaryMatches && neighborMatches,
    expected: "both recorded after flex triples",
    actual: `primary(${actualFlex(target, resolved.primary)}); neighbor(${actualFlex(target, resolved.neighbor)})`,
    success: "Both flex members match their after triples.",
    failure: "One or both flex members differ from their after triples.",
  });
}

export function buildFlexResizeAssertions(operation: ResizeFlexPairOperation): AssertionEntry[] {
  return [
    { name: "resize-flex-pair:identity", run: (target) => assertIdentity(target, operation) },
    { name: "resize-flex-pair:structure", run: (target) => assertStructure(target, operation) },
    { name: "resize-flex-pair:flex", run: (target) => assertFlex(target, operation) },
    ...buildFlexResizeGeometryAssertions(operation),
  ];
}
