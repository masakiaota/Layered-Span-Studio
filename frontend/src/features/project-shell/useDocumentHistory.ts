import { useMemo, useState } from "react";
import type { ProjectBundle, DocumentRecord } from "../../types";
import { deepClone } from "../../utils";

export type HistoryState = {
  documentId: string | null;
  entries: DocumentRecord[];
  index: number;
};

type SetBundle = React.Dispatch<React.SetStateAction<ProjectBundle | null>>;

export type UseDocumentHistoryResult = {
  documentSnapshotsById: Record<string, DocumentRecord>;
  setDocumentSnapshotsById: React.Dispatch<React.SetStateAction<Record<string, DocumentRecord>>>;
  historyState: HistoryState;
  setHistoryState: React.Dispatch<React.SetStateAction<HistoryState>>;
  currentDocumentSnapshot: DocumentRecord | null;
  currentDocumentDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  setHistoryForDocument: (document: DocumentRecord | null) => void;
  setSavedDocument: (document: DocumentRecord) => void;
  removeDocumentState: (documentId: string) => void;
  mutateCurrentDocument: (mutator: (draft: DocumentRecord) => void) => void;
  mutateSettingsBundle: (mutator: (draft: ProjectBundle) => void) => void;
  undo: () => void;
  redo: () => void;
  restoreCurrentFromSnapshot: () => void;
};

export function useDocumentHistory({
  bundle,
  currentDocument,
  setBundle,
}: {
  bundle: ProjectBundle | null;
  currentDocument: DocumentRecord | null;
  setBundle: SetBundle;
}): UseDocumentHistoryResult {
  const [documentSnapshotsById, setDocumentSnapshotsById] = useState<Record<string, DocumentRecord>>({});
  const [historyState, setHistoryState] = useState<HistoryState>({
    documentId: null,
    entries: [],
    index: -1,
  });

  const currentDocumentSnapshot = currentDocument ? documentSnapshotsById[currentDocument.id] ?? null : null;
  const currentDocumentDirty = useMemo(() => {
    if (!currentDocument || !currentDocumentSnapshot) {
      return false;
    }
    return JSON.stringify(currentDocument) !== JSON.stringify(currentDocumentSnapshot);
  }, [currentDocument, currentDocumentSnapshot]);

  const canUndo =
    currentDocument !== null &&
    historyState.documentId === currentDocument.id &&
    historyState.index > 0;

  const canRedo =
    currentDocument !== null &&
    historyState.documentId === currentDocument.id &&
    historyState.index >= 0 &&
    historyState.index < historyState.entries.length - 1;

  function setHistoryForDocument(document: DocumentRecord | null) {
    if (document === null) {
      setDocumentSnapshotsById((current) => {
        if (Object.keys(current).length === 0) {
          return current;
        }
        return {};
      });
      setHistoryState({
        documentId: null,
        entries: [],
        index: -1,
      });
      return;
    }
    const snapshot = deepClone(document);
    setDocumentSnapshotsById((current) => ({
      ...current,
      [document.id]: snapshot,
    }));
    setHistoryState({
      documentId: document.id,
      entries: [snapshot],
      index: 0,
    });
  }

  function setSavedDocument(document: DocumentRecord) {
    const saved = deepClone(document);
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((item) => (item.id === saved.id ? saved : item)),
          }
        : current,
    );
    setDocumentSnapshotsById((current) => ({
      ...current,
      [saved.id]: deepClone(saved),
    }));
    setHistoryState({
      documentId: saved.id,
      entries: [deepClone(saved)],
      index: 0,
    });
  }

  function removeDocumentState(documentId: string) {
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.filter((item) => item.id !== documentId),
          }
        : current,
    );
    setDocumentSnapshotsById((current) => {
      const nextSnapshots = { ...current };
      delete nextSnapshots[documentId];
      return nextSnapshots;
    });
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
            documents: current.documents.map((document) => (document.id === draft.id ? draft : document)),
          }
        : current,
    );
    setHistoryState((current) => {
      const nextEntries = current.documentId === draft.id ? current.entries.slice(0, current.index + 1) : [];
      nextEntries.push(deepClone(draft));
      const cappedEntries = nextEntries.length > 50 ? nextEntries.slice(nextEntries.length - 50) : nextEntries;
      return {
        documentId: draft.id,
        entries: cappedEntries,
        index: cappedEntries.length - 1,
      };
    });
  }

  function mutateSettingsBundle(mutator: (draft: ProjectBundle) => void) {
    if (!bundle) {
      return;
    }
    const draft = deepClone(bundle);
    mutator(draft);
    const currentState = JSON.stringify({ project: bundle.project, labels: bundle.labels });
    const nextState = JSON.stringify({ project: draft.project, labels: draft.labels });
    if (currentState === nextState) {
      return;
    }
    setBundle((current) =>
      current
        ? {
            ...current,
            project: draft.project,
            labels: draft.labels,
          }
        : current,
    );
  }

  function undo() {
    if (!canUndo || !currentDocument) {
      return;
    }
    const nextIndex = historyState.index - 1;
    const nextDocument = historyState.entries[nextIndex];
    if (!nextDocument) {
      return;
    }
    const restored = deepClone(nextDocument);
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((document) => (document.id === restored.id ? restored : document)),
          }
        : current,
    );
    setHistoryState((current) => ({ ...current, index: nextIndex }));
  }

  function redo() {
    if (!canRedo || !currentDocument) {
      return;
    }
    const nextIndex = historyState.index + 1;
    const nextDocument = historyState.entries[nextIndex];
    if (!nextDocument) {
      return;
    }
    const restored = deepClone(nextDocument);
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((document) => (document.id === restored.id ? restored : document)),
          }
        : current,
    );
    setHistoryState((current) => ({ ...current, index: nextIndex }));
  }

  function restoreCurrentFromSnapshot() {
    if (!currentDocument || !currentDocumentSnapshot) {
      return;
    }
    const restored = deepClone(currentDocumentSnapshot);
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((document) => (document.id === restored.id ? restored : document)),
          }
        : current,
    );
    setHistoryState({
      documentId: restored.id,
      entries: [deepClone(restored)],
      index: 0,
    });
  }

  return {
    documentSnapshotsById,
    setDocumentSnapshotsById,
    historyState,
    setHistoryState,
    currentDocumentSnapshot,
    currentDocumentDirty,
    canUndo,
    canRedo,
    setHistoryForDocument,
    setSavedDocument,
    removeDocumentState,
    mutateCurrentDocument,
    mutateSettingsBundle,
    undo,
    redo,
    restoreCurrentFromSnapshot,
  };
}
