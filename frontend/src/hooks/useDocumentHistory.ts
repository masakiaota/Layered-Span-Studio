import { useEffect, useState } from "react";
import type { DocumentRecord } from "../types";
import { deepClone } from "../utils";

const DOCUMENT_HISTORY_LIMIT = 50;

type DocumentHistoryState = {
  documentId: string | null;
  entries: DocumentRecord[];
  index: number;
};

export function useDocumentHistory(currentDocument: DocumentRecord | null) {
  const [historyState, setHistoryState] = useState<DocumentHistoryState>({
    documentId: null,
    entries: [],
    index: -1,
  });

  useEffect(() => {
    if (!currentDocument) {
      setHistoryState({
        documentId: null,
        entries: [],
        index: -1,
      });
      return;
    }
    setHistoryState((current) => {
      if (current.documentId === currentDocument.id) {
        return current;
      }
      return {
        documentId: currentDocument.id,
        entries: [deepClone(currentDocument)],
        index: 0,
      };
    });
  }, [currentDocument?.id]);

  const canUndo = Boolean(
    currentDocument && historyState.documentId === currentDocument.id && historyState.index > 0,
  );
  const canRedo = Boolean(
    currentDocument &&
      historyState.documentId === currentDocument.id &&
      historyState.index >= 0 &&
      historyState.index < historyState.entries.length - 1,
  );

  function recordDocumentMutation(draft: DocumentRecord) {
    setHistoryState((current) => {
      const nextEntries = current.documentId === draft.id
        ? current.entries.slice(0, current.index + 1)
        : [];
      nextEntries.push(deepClone(draft));
      const cappedEntries =
        nextEntries.length > DOCUMENT_HISTORY_LIMIT
          ? nextEntries.slice(nextEntries.length - DOCUMENT_HISTORY_LIMIT)
          : nextEntries;
      return {
        documentId: draft.id,
        entries: cappedEntries,
        index: cappedEntries.length - 1,
      };
    });
  }

  function resetHistory(document: DocumentRecord | null) {
    setHistoryState(document
      ? {
          documentId: document.id,
          entries: [deepClone(document)],
          index: 0,
        }
      : {
          documentId: null,
          entries: [],
          index: -1,
        },
    );
  }

  function clearCurrentDocumentHistory(documentId: string) {
    setHistoryState((current) =>
      current.documentId === documentId
        ? {
            documentId: null,
            entries: [],
            index: -1,
          }
        : current,
    );
  }

  function undo() {
    if (!canUndo || !currentDocument) {
      return null;
    }
    const nextIndex = historyState.index - 1;
    const nextDocument = historyState.entries[nextIndex];
    if (!nextDocument) {
      return null;
    }
    setHistoryState((current) => ({
      ...current,
      index: nextIndex,
    }));
    return deepClone(nextDocument);
  }

  function redo() {
    if (!canRedo || !currentDocument) {
      return null;
    }
    const nextIndex = historyState.index + 1;
    const nextDocument = historyState.entries[nextIndex];
    if (!nextDocument) {
      return null;
    }
    setHistoryState((current) => ({
      ...current,
      index: nextIndex,
    }));
    return deepClone(nextDocument);
  }

  return {
    historyState,
    canUndo,
    canRedo,
    recordDocumentMutation,
    undo,
    redo,
    resetHistory,
    clearCurrentDocumentHistory,
  };
}
