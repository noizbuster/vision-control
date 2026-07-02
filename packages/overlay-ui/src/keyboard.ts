/**
 * Keyboard controller for inspect mode.
 *
 * Adds capture-phase `keydown` listeners while inspect mode is active and maps
 * navigation/confirmation keys to callbacks.
 */

/** Keys handled by the inspect keyboard controller. */
export type InspectKey = "Escape" | "Tab" | "ArrowDown" | "ArrowUp" | "Enter";

/** Callbacks invoked for each handled key. */
export interface KeyboardControllerCallbacks {
  readonly onEscape: () => void;
  readonly onCycleChild: () => void;
  readonly onCycleParent: () => void;
  readonly onConfirm: () => void;
}

/** API returned by {@link createKeyboardController}. */
export interface KeyboardController {
  readonly activate: () => void;
  readonly deactivate: () => void;
  readonly isActive: () => boolean;
}

/**
 * Create a keyboard controller that drives inspect navigation.
 *
 * The listener runs in the capture phase so it can act before page handlers.
 * `Tab` and arrow keys call `preventDefault` to avoid moving page focus.
 */
export function createKeyboardController(
  callbacks: KeyboardControllerCallbacks,
): KeyboardController {
  let active = false;

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!active) return;

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        callbacks.onEscape();
        break;
      case "Tab":
      case "ArrowDown":
        event.preventDefault();
        callbacks.onCycleChild();
        break;
      case "ArrowUp":
        event.preventDefault();
        callbacks.onCycleParent();
        break;
      case "Enter":
        event.preventDefault();
        callbacks.onConfirm();
        break;
      default:
        break;
    }
  };

  const activate = (): void => {
    if (active) return;
    active = true;
    document.addEventListener("keydown", handleKeyDown, true);
  };

  const deactivate = (): void => {
    if (!active) return;
    active = false;
    document.removeEventListener("keydown", handleKeyDown, true);
  };

  return {
    activate,
    deactivate,
    isActive: () => active,
  };
}
