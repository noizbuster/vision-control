import { createOperationId } from "@vision-control/change-ir";

/**
 * Runtime-id assignment for DOM elements (PRD 14.2).
 *
 * The build-time source marker emits a STABLE, opaque `data-vc-source` per JSX
 * source location. Two list items rendered from one `.map()` share that source
 * id — they are the same source location. But the live DOM needs to tell those
 * instances apart (re-find after re-render, disambiguate a click). So the
 * content script stamps each rendered element with an EPHEMERAL, per-instance
 * `data-vc-runtime-id`.
 *
 * This module owns the assignment logic. It is deliberately DOM-free in its
 * INPUT type: {@link AttributedElement} is the narrow structural interface a
 * real DOM `Element` already satisfies (`hasAttribute`, `getAttribute`,
 * `setAttribute`, `querySelectorAll`). Coding to that interface keeps the logic
 * isomorphic and unit-testable with an in-memory fake tree — no jsdom/happy-dom
 * dependency — while a real `Element` drops straight in at runtime.
 */

/** The attribute carrying the opaque, stable source id (injected by the Vite plugin). */
export const SOURCE_ATTRIBUTE = "data-vc-source";

/** The attribute carrying the ephemeral, per-instance runtime id (set by this module). */
export const RUNTIME_ATTRIBUTE = "data-vc-runtime-id";

/**
 * Narrow structural view of a DOM element. A real `Element` satisfies this, as
 * does an in-memory fake used in tests. Querying to the interface (not the
 * concrete DOM type) is what keeps this package isomorphic and dependency-free.
 */
export interface AttributedElement {
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  querySelectorAll(selector: string): readonly AttributedElement[];
}

/** One assignment: the element, its stable source id, and its fresh runtime id. */
export interface RuntimeAssignment {
  readonly element: AttributedElement;
  readonly sourceId: string;
  readonly runtimeId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mint a unique runtime id from the host. Runtime ids only need to be unique per
 * DOM instance for the lifetime of the page — they are NOT security primitives.
 * The shared operation-id helper preserves Web Crypto UUIDs on insecure local
 * development hosts where `randomUUID` is unavailable but `getRandomValues`
 * still exists.
 */
const mintRuntimeId = (): string => createOperationId();

/**
 * Assign a distinct runtime id to every element under `root` that carries a
 * `data-vc-source` attribute (the root itself included).
 *
 * NON-COLLAPSING: when a list renders N items from one JSX line, each element
 * shares the SAME source id but receives its OWN runtime id. The returned list
 * has one entry per element, so N items -> N assignments even though they map
 * to one source entry. (A `Map<sourceId, runtimeId>` would collapse those N
 * instances to one and break the re-find-after-rerender invariant.)
 *
 * Mutates the DOM: sets `data-vc-runtime-id` on each assigned element. Pass
 * `options.counter` to override id generation (deterministic tests); when
 * omitted, the shared operation-id generator is used.
 */
export const assignRuntimeIds = (
  root: AttributedElement,
  options?: { readonly counter?: () => string },
): RuntimeAssignment[] => {
  const mint = options?.counter ?? mintRuntimeId;
  const candidates: AttributedElement[] = root.hasAttribute(SOURCE_ATTRIBUTE) ? [root] : [];
  for (const el of root.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`)) {
    candidates.push(el);
  }

  const assignments: RuntimeAssignment[] = [];
  for (const element of candidates) {
    const sourceId = element.getAttribute(SOURCE_ATTRIBUTE);
    if (sourceId === null || sourceId === "") continue;
    const runtimeId = mint();
    element.setAttribute(RUNTIME_ATTRIBUTE, runtimeId);
    assignments.push({ element, sourceId, runtimeId });
  }
  return assignments;
};

/** True when `value` is a v4-style UUID string. */
export const isUuid = (value: string): boolean => UUID_RE.test(value);
