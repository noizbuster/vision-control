import { expect, test } from "@playwright/test";

import { createFlexPairErrorObserver } from "./flex-pair-visual-evidence.ts";

type ConsoleErrorListener = (message: string) => void;
type PageErrorListener = (message: string) => void;

interface ErrorTarget {
  readonly onConsoleError: (listener: ConsoleErrorListener) => void;
  readonly onPageError: (listener: PageErrorListener) => void;
  readonly emitConsoleError: (message: string) => void;
  readonly emitPageError: (message: string) => void;
}

function createErrorTarget(): ErrorTarget {
  let consoleErrorListener: ConsoleErrorListener | undefined;
  let pageErrorListener: PageErrorListener | undefined;

  return {
    onConsoleError(listener) {
      consoleErrorListener = listener;
    },
    onPageError(listener) {
      pageErrorListener = listener;
    },
    emitConsoleError(message) {
      consoleErrorListener?.(message);
    },
    emitPageError(message) {
      pageErrorListener?.(message);
    },
  };
}

test("rejects a console error captured during a blocked Flex state", () => {
  const page = createErrorTarget();
  const panel = createErrorTarget();
  const observer = createFlexPairErrorObserver({ page, panel });

  page.emitConsoleError("blocked-state-console-error");

  expect(() => observer.assertClean("blocked-wrap")).toThrow();
});

test("rejects a page error captured during a held Flex flow state", () => {
  const page = createErrorTarget();
  const panel = createErrorTarget();
  const observer = createFlexPairErrorObserver({ page, panel });

  panel.emitPageError("held-flow-page-error");

  expect(() => observer.assertClean("held")).toThrow();
});
