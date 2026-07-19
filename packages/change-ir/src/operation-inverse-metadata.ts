import { inverseBase } from "./operation-inverse-base.js";
import type { Operation } from "./operations/index.js";

type MetadataOperation = Extract<
  Operation,
  {
    kind:
      | "breakpoint-style-edit"
      | "breakpoint-class-edit"
      | "breakpoint-text-edit"
      | "screenshot-crop-ref"
      | "suggested-diff";
  }
>;

const breakpointMetadata = (operation: MetadataOperation) => ({
  ...(operation.kind === "breakpoint-style-edit" ||
  operation.kind === "breakpoint-class-edit" ||
  operation.kind === "breakpoint-text-edit"
    ? {
        ...(operation.mediaSource !== undefined ? { mediaSource: operation.mediaSource } : {}),
        ...(operation.activeViewport !== undefined
          ? { activeViewport: operation.activeViewport }
          : {}),
        ...(operation.responsivePrefix !== undefined
          ? { responsivePrefix: operation.responsivePrefix }
          : {}),
        ...(operation.applyToBase !== undefined ? { applyToBase: operation.applyToBase } : {}),
      }
    : {}),
});

export const invertMetadataOperation = (operation: MetadataOperation): Operation => {
  const base = inverseBase(operation);
  switch (operation.kind) {
    case "breakpoint-style-edit":
      return {
        ...base,
        ...breakpointMetadata(operation),
        kind: "breakpoint-style-edit",
        confidence: operation.confidence,
        target: operation.target,
        breakpoint: operation.breakpoint,
        property: operation.property,
        value: operation.previousValue ?? "",
        important: operation.important,
        previousValue: operation.value,
      };
    case "breakpoint-class-edit":
      return {
        ...base,
        ...breakpointMetadata(operation),
        kind: "breakpoint-class-edit",
        confidence: operation.confidence,
        target: operation.target,
        breakpoint: operation.breakpoint,
        oldClassName: operation.newClassName,
        newClassName: operation.oldClassName,
      };
    case "breakpoint-text-edit":
      return {
        ...base,
        ...breakpointMetadata(operation),
        kind: "breakpoint-text-edit",
        confidence: operation.confidence,
        target: operation.target,
        breakpoint: operation.breakpoint,
        newText: operation.previousText ?? "",
        previousText: operation.newText,
      };
    case "screenshot-crop-ref":
      return {
        ...base,
        kind: "screenshot-crop-ref",
        confidence: operation.confidence,
        target: operation.target,
        artifactId: operation.artifactId,
        captureRegion: operation.captureRegion,
        ...(operation.redactionReport !== undefined
          ? { redactionReport: operation.redactionReport }
          : {}),
        ...(operation.retentionExpiresAt !== undefined
          ? { retentionExpiresAt: operation.retentionExpiresAt }
          : {}),
      };
    case "suggested-diff":
      return {
        ...base,
        kind: "suggested-diff",
        ...(operation.target !== undefined ? { target: operation.target } : {}),
        diff: operation.diff,
        sourceRanges: operation.sourceRanges,
        confidence: operation.confidence,
        preconditions: operation.preconditions,
        applied: false,
      };
    default: {
      const exhaustive: never = operation;
      throw new Error(`invertMetadataOperation: unhandled kind ${JSON.stringify(exhaustive)}`);
    }
  }
};
