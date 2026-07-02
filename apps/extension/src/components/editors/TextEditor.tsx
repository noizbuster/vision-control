import type { SelectionSummary } from "@vision-control/inspector-core";
import { createTextEditCommand } from "@vision-control/inspector-core";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

interface TextEditorProps {
  readonly summary: SelectionSummary;
  readonly onCommand: (command: ReturnType<typeof createTextEditCommand>) => void;
  readonly onClose: () => void;
}

/**
 * Text editor overlay rendered inside a Shadow DOM host.
 *
 * The input is created as a plain DOM element inside the shadow tree so its
 * `input`/`keydown` events do not bubble to the inspected application's DOM.
 * This is critical: editing text in Vision Control must not trigger the page's
 * own input handlers.
 */
export function TextEditor({ summary, onCommand, onClose }: TextEditorProps): ReactElement | null {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.pointerEvents = "none";
    host.style.zIndex = "2147483647";
    host.setAttribute("data-vc-text-editor-host", "");
    document.body.appendChild(host);
    hostRef.current = host;

    const shadowRoot = host.attachShadow({ mode: "open" });
    const sheet = document.createElement("style");
    sheet.textContent = TEXT_EDITOR_CSS;
    shadowRoot.appendChild(sheet);

    const wrapper = document.createElement("div");
    wrapper.className = "vc-text-editor";
    wrapper.setAttribute("role", "dialog");
    wrapper.setAttribute("aria-label", "Edit element text");
    shadowRoot.appendChild(wrapper);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "vc-text-editor__input";
    input.value = summary.semantic.textContentPreview;
    input.style.pointerEvents = "auto";
    wrapper.appendChild(input);

    function commit(): void {
      const trimmed = input.value.trim();
      const previous = summary.semantic.textContentPreview;
      if (trimmed !== previous) {
        onCommand(
          createTextEditCommand(
            {
              runtimeId: summary.identity.runtimeId,
              selector: summary.identity.selector ?? undefined,
            },
            trimmed,
            previous,
          ),
        );
      }
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", handleKeyDown);
    input.focus();

    return () => {
      input.removeEventListener("blur", commit);
      input.removeEventListener("keydown", handleKeyDown);
      host.remove();
      hostRef.current = null;
    };
  }, [summary, onCommand, onClose]);

  return null;
}

const TEXT_EDITOR_CSS = /* css */ `
  .vc-text-editor {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 24px;
    pointer-events: none;
  }

  .vc-text-editor__input {
    all: initial;
    box-sizing: border-box;
    pointer-events: auto;
    min-width: 240px;
    max-width: 90vw;
    padding: 8px 12px;
    border: 2px solid var(--vc-accent, #0969da);
    border-radius: 6px;
    background: var(--vc-bg-1, #ffffff);
    color: var(--vc-text-1, #1f2328);
    font-family: var(--vc-font-sans, system-ui, sans-serif);
    font-size: 14px;
    line-height: 1.4;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .vc-text-editor__input:focus {
    outline: 3px solid var(--vc-accent, #0969da);
    outline-offset: 1px;
  }
`;
