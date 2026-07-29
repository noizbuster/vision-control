/**
 * Keyboard controller for PRD §8.3 interaction modes.
 *
 * Adds capture-phase `keydown`/`keyup` listeners. In Inspect mode it maps
 * navigation/confirmation keys (Esc/Tab/arrows/Enter) and Alt-parent-cycling
 * to callbacks. In Move/Resize modes it tracks modifier state (Shift/Alt/
 * Cmd-Ctrl) so the interaction controllers can read axis-lock,
 * duplicate-intent, aspect-lock, and center-resize flags during pointer drag.
 */

/** PRD §8.3 interaction modes that govern overlay pointer behavior. */
export type InteractionMode = "Inspect" | "Move" | "Resize" | "Text" | "Layout";

/** Modifier flags read by Move/Resize during pointer drag (PRD §8.3). */
export interface ModifierState {
  /** Move: duplicate intent. Resize: center-based resize. */
  readonly alt: boolean;
  /** Move: axis lock. Resize: aspect-ratio lock. */
  readonly shift: boolean;
  /** Move: snap disable (Cmd on macOS, Ctrl elsewhere). */
  readonly meta: boolean;
}

/** Keys handled by the inspect keyboard controller. */
export type InspectKey =
  | "Escape"
  | "Tab"
  | "ArrowDown"
  | "ArrowUp"
  | "ArrowLeft"
  | "ArrowRight"
  | "Enter";

/** Callbacks invoked for handled keys or modifier changes. */
export interface KeyboardControllerCallbacks {
  readonly onEscape: () => void;
  readonly onCycleChild: () => void;
  readonly onCycleParent: () => void;
  readonly onCyclePreviousSibling: () => void;
  readonly onCycleNextSibling: () => void;
  readonly onConfirm: () => void;
  /** Move: Alt keydown signals duplicate intent (PRD §8.3). */
  readonly onDuplicateIntent?: () => void;
  /** Move/Resize: modifier state changed during drag. */
  readonly onModifierChange?: (state: ModifierState) => void;
}

/** API returned by {@link createKeyboardController}. */
export interface KeyboardController {
  readonly activate: () => void;
  readonly deactivate: () => void;
  readonly isActive: () => boolean;
  /** Switch the active interaction mode (PRD §8.3). */
  readonly setMode: (mode: InteractionMode) => void;
  readonly getMode: () => InteractionMode;
  /** Current modifier state (read by interaction controllers during drag). */
  readonly getModifiers: () => ModifierState;
}

const NO_MODIFIERS: ModifierState = { alt: false, shift: false, meta: false };

function readModifiers(event: KeyboardEvent): ModifierState {
  return {
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey || event.ctrlKey,
  };
}

/**
 * Create a keyboard controller that drives inspect navigation and tracks
 * Move/Resize modifier state. The listeners run in the capture phase so they
 * can act before page handlers. Tab and arrow keys call `preventDefault` to
 * avoid moving page focus.
 */
export function createKeyboardController(
  callbacks: KeyboardControllerCallbacks,
): KeyboardController {
  let active = false;
  let mode: InteractionMode = "Inspect";
  let modifiers: ModifierState = NO_MODIFIERS;

  const syncModifiers = (event: KeyboardEvent): void => {
    const next = readModifiers(event);
    if (
      next.alt === modifiers.alt &&
      next.shift === modifiers.shift &&
      next.meta === modifiers.meta
    ) {
      return;
    }
    modifiers = next;
    callbacks.onModifierChange?.(next);
  };

  const handleInspectKey = (event: KeyboardEvent): void => {
    switch (event.key) {
      case "Tab":
      case "ArrowDown":
        event.preventDefault();
        callbacks.onCycleChild();
        break;
      case "ArrowUp":
        event.preventDefault();
        callbacks.onCycleParent();
        break;
      case "ArrowLeft":
        event.preventDefault();
        callbacks.onCyclePreviousSibling();
        break;
      case "ArrowRight":
        event.preventDefault();
        callbacks.onCycleNextSibling();
        break;
      case "Enter":
        event.preventDefault();
        callbacks.onConfirm();
        break;
      case "Alt":
        // PRD §8.3 Inspect: Alt cycles parent candidates.
        event.preventDefault();
        callbacks.onCycleParent();
        break;
      default:
        break;
    }
  };

  const handleMoveKey = (event: KeyboardEvent): void => {
    if (event.key === "Alt" && !event.repeat) {
      // PRD §8.3 Move: Alt = duplicate intent.
      event.preventDefault();
      callbacks.onDuplicateIntent?.();
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!active) return;
    syncModifiers(event);

    // Escape clears/cancels in every mode (PRD §8.3).
    if (event.key === "Escape") {
      event.preventDefault();
      callbacks.onEscape();
      return;
    }

    switch (mode) {
      case "Inspect":
        handleInspectKey(event);
        break;
      case "Move":
        handleMoveKey(event);
        break;
      default:
        // Resize/Text/Layout: no discrete key actions; modifiers tracked above.
        break;
    }
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (!active) return;
    syncModifiers(event);
  };

  const activate = (): void => {
    if (active) return;
    active = true;
    modifiers = NO_MODIFIERS;
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keyup", handleKeyUp, true);
  };

  const deactivate = (): void => {
    if (!active) return;
    active = false;
    modifiers = NO_MODIFIERS;
    document.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("keyup", handleKeyUp, true);
  };

  const setMode = (next: InteractionMode): void => {
    mode = next;
    modifiers = NO_MODIFIERS;
  };

  return {
    activate,
    deactivate,
    isActive: () => active,
    setMode,
    getMode: () => mode,
    getModifiers: () => modifiers,
  };
}
