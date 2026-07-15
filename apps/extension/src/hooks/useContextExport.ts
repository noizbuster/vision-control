/**
 * Panel-local context export actions (copy/download JSON + Markdown).
 * Works unpaired; never calls MCP or the daemon.
 */

import type { Journal } from "@vision-control/change-journal";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  buildPanelContextExport,
  type PanelContextExport,
} from "../components/journal/context-export.js";
import { downloadText } from "../components/journal/download-text.js";

export type ContextExportStatus =
  | "idle"
  | "copied-json"
  | "copied-md"
  | "downloaded-json"
  | "downloaded-md"
  | "error";

export interface UseContextExportOptions {
  readonly selection: SelectionSummary | null;
  readonly journal: Journal;
  readonly tabId?: string | number | null;
  readonly sessionId?: string;
}

export interface UseContextExportResult {
  readonly status: ContextExportStatus;
  readonly onCopyJson: () => void;
  readonly onCopyMarkdown: () => void;
  readonly onDownloadJson: () => void;
  readonly onDownloadMarkdown: () => void;
}

const JSON_MIME = "application/json;charset=utf-8";
const MARKDOWN_MIME = "text/markdown;charset=utf-8";

export function useContextExport(options: UseContextExportOptions): UseContextExportResult {
  const { selection, journal, tabId, sessionId } = options;
  const [status, setStatus] = useState<ContextExportStatus>("idle");
  const snapshotRevRef = useRef(0);

  const buildExport = useCallback((): PanelContextExport => {
    snapshotRevRef.current += 1;
    return buildPanelContextExport({
      selection,
      journal,
      snapshotRev: snapshotRevRef.current,
      ...(tabId !== undefined && tabId !== null ? { tabId: String(tabId) } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
  }, [selection, journal, tabId, sessionId]);

  const writeClipboard = useCallback((text: string, next: ContextExportStatus): void => {
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      setStatus("error");
      return;
    }
    void clipboard.writeText(text).then(
      () => {
        setStatus(next);
      },
      () => {
        setStatus("error");
      },
    );
  }, []);

  const onCopyJson = useCallback((): void => {
    try {
      writeClipboard(buildExport().json, "copied-json");
    } catch {
      setStatus("error");
    }
  }, [buildExport, writeClipboard]);

  const onCopyMarkdown = useCallback((): void => {
    try {
      writeClipboard(buildExport().markdown, "copied-md");
    } catch {
      setStatus("error");
    }
  }, [buildExport, writeClipboard]);

  const onDownloadJson = useCallback((): void => {
    try {
      const exported = buildExport();
      downloadText(
        `vision-context-r${exported.snapshot.snapshotRev}.json`,
        exported.json,
        JSON_MIME,
      );
      setStatus("downloaded-json");
    } catch {
      setStatus("error");
    }
  }, [buildExport]);

  const onDownloadMarkdown = useCallback((): void => {
    try {
      const exported = buildExport();
      downloadText(
        `vision-context-r${exported.snapshot.snapshotRev}.md`,
        exported.markdown,
        MARKDOWN_MIME,
      );
      setStatus("downloaded-md");
    } catch {
      setStatus("error");
    }
  }, [buildExport]);

  return useMemo(
    () => ({
      status,
      onCopyJson,
      onCopyMarkdown,
      onDownloadJson,
      onDownloadMarkdown,
    }),
    [status, onCopyJson, onCopyMarkdown, onDownloadJson, onDownloadMarkdown],
  );
}
