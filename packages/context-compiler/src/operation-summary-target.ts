import type { DurableElementRef, ElementRef } from "@vision-control/change-ir";

export const targetLabel = (reference: ElementRef | undefined): string | undefined =>
  reference?.sourceId ?? reference?.selector;

export const durableTargetLabel = (reference: DurableElementRef): string => {
  const durable = `${reference.selector}[${reference.occurrence}]#${reference.fingerprint}`;
  return reference.sourceId === undefined ? durable : `${reference.sourceId} (${durable})`;
};
