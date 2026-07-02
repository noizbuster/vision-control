/**
 * Pointer-events policy for the overlay.
 *
 * The overlay host is transparent to pointer events by default so the inspected
 * page remains fully interactive. Only specific overlay children (resize/drag
 * handles) receive `pointer-events: auto` while an active interaction is in
 * progress.
 */

/** Interaction mode that determines which overlay parts capture input. */
export type PointerEventMode = "pass-through" | "handles";

/**
 * Apply the default pass-through policy to an overlay host.
 *
 * This should be called immediately after creating the host and whenever an
 * interaction ends.
 */
export function setHostPointerEvents(host: HTMLElement, mode: PointerEventMode): void {
  host.style.pointerEvents = mode === "pass-through" ? "none" : "auto";
}

/**
 * Toggle pointer-event capture on a handle element.
 *
 * When enabled the handle captures pointer events; when disabled it returns to
 * pass-through so the handle layer does not block page interaction.
 */
export function setHandlePointerEvents(handle: HTMLElement, enabled: boolean): void {
  handle.style.pointerEvents = enabled ? "auto" : "none";
}

/**
 * Return the default pointer-events value for an overlay child based on its
 * role. Handles start as non-capturing and must be explicitly enabled.
 */
export function getDefaultPointerEventsForRole(role: "handle" | "label" | "outline"): string {
  switch (role) {
    case "handle":
      return "none";
    case "label":
    case "outline":
      return "none";
    default: {
      const exhaustive: never = role;
      throw new Error(`unknown overlay role: ${String(exhaustive)}`);
    }
  }
}
