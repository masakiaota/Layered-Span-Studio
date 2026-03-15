import { useEffect, useMemo, useState } from "react";
import type { DocumentRecord, ProjectBundle } from "../../types";
import { deepClone } from "../../utils";

export type HistoryState = {
  documentId: string | null;
  entries: DocumentRecord[];
  index: number;
};

const HISTORY_MAX_ENTRIES = 50;

export function useDocumentHistory({
  bundle,
  setBundle,
  currentDocument,
  currentDocumentSnapshot,
  view,
}: {
  bundle: ProjectBundle | null;
  setBundle: React.Dispatch<React.SetStateAction<ProjectBundle | null>>;
  currentDocument: DocumentRecord | null;
  currentDocumentSnapshot: DocumentRecord | null;
  view: "workspace" | "settings";
}) {
  const [historyState, setHistoryState] = useState<HistoryState>({
    documentId: null,
    entries: [],
    index: -1,
  });

  useEffect(() => {
    if (!currentDocument || historyState.documentId === currentDocument.id) {
      return;
    }
    setHistoryState({
      documentId: currentDocument.id,
      entries: [deepClone(currentDocumentSnapshot ?? currentDocument)],
      index: 0,
    });
  }, [currentDocument, currentDocumentSnapshot, historyState.documentId]);

  const canUndo =
    view === "workspace" &&
    historyState.documentId === currentDocument?.id &&
    historyState.index > 0;

  const canRedo = useMemo(
    () =>
      view === "workspace" &&
      historyState.documentId === currentDocument?.id &&
      historyState.index >= 0 &&
      historyState.index < historyState.entries.length - 1,
    [view, historyState, currentDocument?.id],
  );

  function mutateCurrentDocument(mutator: (draft: DocumentRecord) => void) {
    if (!bundle || !currentDocument) {
      return;
    }
    const draft = deepClone(currentDocument);
    mutator(draft);
    if (JSON.stringify(draft) === JSON.stringify(currentDocument)) {
      return;
    }
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((document) =>
              document.id === draft.id ? draft : document,
            ),
          }
        : current,
    );
    setHistoryState((current) => {
      const nextEntries =
        current.documentId === draft.id
          ? current.entries.slice(0, current.index + 1)
          : [];
      nextEntries.push(deepClone(draft));
      const cappedEntries =
        nextEntries.length > HISTORY_MAX_ENTRIES
          ? nextEntries.slice(nextEntries.length - HISTORY_MAX_ENTRIES)
          : nextEntries;
      return {
        documentId: draft.id,
        entries: cappedEntries,
        index: cappedEntries.length - 1,
      };
    });
  }

  function undoBundle() {
    if (!canUndo || !currentDocument) {
      return;
    }
    const nextIndex = historyState.index - 1;
    const nextDocument = historyState.entries[nextIndex];
    if (!nextDocument) {
      return;
    }
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((document) =>
              document.id === nextDocument.id ? deepClone(nextDocument) : document,
            ),
          }
        : current,
    );
    setHistoryState((current) => ({ ...current, index: nextIndex }));
  }

  function redoBundle() {
    if (!canRedo || !currentDocument) {
      return;
    }
    const nextIndex = historyState.index + 1;
    const nextDocument = historyState.entries[nextIndex];
    if (!nextDocument) {
      return;
    }
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((document) =>
              document.id === nextDocument.id ? deepClone(nextDocument) : document,
            ),
          }
        : current,
    );
    setHistoryState((current) => ({ ...current, index: nextIndex }));
  }

  return {
    historyState,
    setHistoryState,
    canUndo,
    canRedo,
    mutateCurrentDocument,
    undoBundle,
    redoBundle,
  };
}
