import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDocumentHistory } from "../features/project-shell/useDocumentHistory";
import type { DocumentRecord } from "../api-contract";
import type { ProjectBundle } from "../types";

function createDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc-1",
    project_id: "project-1",
    project_name: "Test",
    document_name: "Doc 1",
    text: "Hello world",
    status: "pending",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    annotations: [],
    meta: {},
    ...overrides,
  };
}

function createBundle(document: DocumentRecord): ProjectBundle {
  return {
    project: {
      id: "project-1",
      name: "Test",
      description: "",
      meta: {},
      created_at: "2026-01-01T00:00:00Z",
    },
    labels: [],
    documents: [document],
  };
}

type DocumentHistoryProps = {
  currentDocument: DocumentRecord | null;
  currentDocumentSnapshot: DocumentRecord | null;
};

describe("useDocumentHistory", () => {
  it("initializes with empty history and then resets when document is present", async () => {
    const doc = createDocument();
    const bundle = createBundle(doc);
    const setBundle = () => {};
    const { result } = renderHook(() =>
      useDocumentHistory({
        bundle,
        setBundle,
        currentDocument: doc,
        currentDocumentSnapshot: doc,
        view: "workspace",
      }),
    );

    // After the effect runs, the history should be initialized for the current document
    await act(async () => {});

    expect(result.current.historyState.documentId).toBe("doc-1");
    expect(result.current.historyState.entries).toHaveLength(1);
    expect(result.current.historyState.index).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("starts with no history when currentDocument is null", () => {
    const bundle: ProjectBundle = {
      project: { id: "project-1", name: "Test", description: "", meta: {}, created_at: "2026-01-01T00:00:00Z" },
      labels: [],
      documents: [],
    };
    const setBundle = () => {};
    const { result } = renderHook(() =>
      useDocumentHistory({
        bundle,
        setBundle,
        currentDocument: null,
        currentDocumentSnapshot: null,
        view: "workspace",
      }),
    );

    expect(result.current.historyState.documentId).toBe(null);
    expect(result.current.historyState.entries).toHaveLength(0);
    expect(result.current.historyState.index).toBe(-1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("preserves history while the selected document is loading", async () => {
    const doc = createDocument();
    const bundle = createBundle(doc);
    let currentBundle = bundle;
    const setBundle = (updater: React.SetStateAction<ProjectBundle | null>) => {
      if (typeof updater === "function") {
        const next = updater(currentBundle);
        if (next) currentBundle = next;
      } else if (updater) {
        currentBundle = updater;
      }
    };

    const { result, rerender } = renderHook(
      ({ currentDocument, currentDocumentSnapshot }: DocumentHistoryProps) =>
        useDocumentHistory({
          bundle: currentBundle,
          setBundle,
          currentDocument,
          currentDocumentSnapshot,
          view: "workspace",
        }),
      {
        initialProps: {
          currentDocument: currentBundle.documents[0],
          currentDocumentSnapshot: currentBundle.documents[0],
        } as DocumentHistoryProps,
      },
    );

    await act(async () => {});
    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Modified";
      });
    });

    expect(result.current.historyState.entries).toHaveLength(2);

    rerender({
      currentDocument: null,
      currentDocumentSnapshot: null,
    });

    expect(result.current.historyState.documentId).toBe("doc-1");
    expect(result.current.historyState.entries).toHaveLength(2);
    expect(result.current.historyState.index).toBe(1);
  });

  it("mutateCurrentDocument pushes to history and updates bundle", async () => {
    const doc = createDocument();
    const bundle = createBundle(doc);
    let currentBundle = bundle;
    const setBundle = (updater: React.SetStateAction<ProjectBundle | null>) => {
      if (typeof updater === "function") {
        const next = updater(currentBundle);
        if (next) currentBundle = next;
      } else {
        if (updater) currentBundle = updater;
      }
    };

    const { result } = renderHook(() =>
      useDocumentHistory({
        bundle: currentBundle,
        setBundle,
        currentDocument: currentBundle.documents[0],
        currentDocumentSnapshot: currentBundle.documents[0],
        view: "workspace",
      }),
    );

    // Allow history effect to run
    await act(async () => {});
    expect(result.current.historyState.index).toBe(0);
    expect(result.current.canUndo).toBe(false);

    // Mutate document
    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Modified";
      });
    });

    expect(result.current.historyState.index).toBe(1);
    expect(result.current.historyState.entries).toHaveLength(2);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undoBundle navigates back in history", async () => {
    const doc = createDocument();
    const bundle = createBundle(doc);
    let currentBundle = bundle;
    const setBundle = (updater: React.SetStateAction<ProjectBundle | null>) => {
      if (typeof updater === "function") {
        const next = updater(currentBundle);
        if (next) currentBundle = next;
      } else {
        if (updater) currentBundle = updater;
      }
    };

    const { result } = renderHook(() =>
      useDocumentHistory({
        bundle: currentBundle,
        setBundle,
        currentDocument: currentBundle.documents[0],
        currentDocumentSnapshot: currentBundle.documents[0],
        view: "workspace",
      }),
    );

    await act(async () => {});

    // Mutate to create history entries
    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Version 2";
      });
    });
    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Version 3";
      });
    });

    expect(result.current.historyState.index).toBe(2);
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undoBundle();
    });

    expect(result.current.historyState.index).toBe(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.undoBundle();
    });

    expect(result.current.historyState.index).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("redoBundle navigates forward in history after undo", async () => {
    const doc = createDocument();
    const bundle = createBundle(doc);
    let currentBundle = bundle;
    const setBundle = (updater: React.SetStateAction<ProjectBundle | null>) => {
      if (typeof updater === "function") {
        const next = updater(currentBundle);
        if (next) currentBundle = next;
      } else {
        if (updater) currentBundle = updater;
      }
    };

    const { result } = renderHook(() =>
      useDocumentHistory({
        bundle: currentBundle,
        setBundle,
        currentDocument: currentBundle.documents[0],
        currentDocumentSnapshot: currentBundle.documents[0],
        view: "workspace",
      }),
    );

    await act(async () => {});

    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Version 2";
      });
    });

    act(() => {
      result.current.undoBundle();
    });

    expect(result.current.historyState.index).toBe(0);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redoBundle();
    });

    expect(result.current.historyState.index).toBe(1);
    expect(result.current.canRedo).toBe(false);
  });

  it("canUndo and canRedo are false in settings view", async () => {
    const doc = createDocument();
    const bundle = createBundle(doc);
    let currentBundle = bundle;
    const setBundle = (updater: React.SetStateAction<ProjectBundle | null>) => {
      if (typeof updater === "function") {
        const next = updater(currentBundle);
        if (next) currentBundle = next;
      } else {
        if (updater) currentBundle = updater;
      }
    };

    const { result } = renderHook(() =>
      useDocumentHistory({
        bundle: currentBundle,
        setBundle,
        currentDocument: currentBundle.documents[0],
        currentDocumentSnapshot: currentBundle.documents[0],
        view: "settings",
      }),
    );

    await act(async () => {});

    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Version 2";
      });
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("new mutation clears forward history", async () => {
    const doc = createDocument();
    const bundle = createBundle(doc);
    let currentBundle = bundle;
    const setBundle = (updater: React.SetStateAction<ProjectBundle | null>) => {
      if (typeof updater === "function") {
        const next = updater(currentBundle);
        if (next) currentBundle = next;
      } else {
        if (updater) currentBundle = updater;
      }
    };

    const { result } = renderHook(() =>
      useDocumentHistory({
        bundle: currentBundle,
        setBundle,
        currentDocument: currentBundle.documents[0],
        currentDocumentSnapshot: currentBundle.documents[0],
        view: "workspace",
      }),
    );

    await act(async () => {});

    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Version 2";
      });
    });
    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Version 3";
      });
    });
    act(() => {
      result.current.undoBundle();
    });
    expect(result.current.historyState.index).toBe(1);
    expect(result.current.canRedo).toBe(true);

    // New mutation should clear forward history
    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Version X";
      });
    });

    expect(result.current.historyState.entries).toHaveLength(3);
    expect(result.current.historyState.index).toBe(2);
    expect(result.current.canRedo).toBe(false);
  });

  it("clearDocumentHistory resets history for the specified document", async () => {
    const doc = createDocument();
    const bundle = createBundle(doc);
    let currentBundle = bundle;
    const setBundle = (updater: React.SetStateAction<ProjectBundle | null>) => {
      if (typeof updater === "function") {
        const next = updater(currentBundle);
        if (next) currentBundle = next;
      } else {
        if (updater) currentBundle = updater;
      }
    };

    const { result } = renderHook(() =>
      useDocumentHistory({
        bundle: currentBundle,
        setBundle,
        currentDocument: currentBundle.documents[0],
        currentDocumentSnapshot: currentBundle.documents[0],
        view: "workspace",
      }),
    );

    await act(async () => {});

    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Version 2";
      });
    });
    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Version 3";
      });
    });

    expect(result.current.historyState.index).toBe(2);
    expect(result.current.canUndo).toBe(true);

    // Clearing history for the current document resets it to initial state
    // (the useEffect will re-initialize it with a single entry since the document is still present)
    act(() => {
      result.current.clearDocumentHistory("doc-1");
    });

    // After clearing, the effect re-fires and resets to a clean history
    await act(async () => {});

    expect(result.current.historyState.documentId).toBe("doc-1");
    expect(result.current.historyState.index).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });

  it("clearDocumentHistory does not reset history for a different document", async () => {
    const doc = createDocument();
    const bundle = createBundle(doc);
    let currentBundle = bundle;
    const setBundle = (updater: React.SetStateAction<ProjectBundle | null>) => {
      if (typeof updater === "function") {
        const next = updater(currentBundle);
        if (next) currentBundle = next;
      } else {
        if (updater) currentBundle = updater;
      }
    };

    const { result } = renderHook(() =>
      useDocumentHistory({
        bundle: currentBundle,
        setBundle,
        currentDocument: currentBundle.documents[0],
        currentDocumentSnapshot: currentBundle.documents[0],
        view: "workspace",
      }),
    );

    await act(async () => {});

    act(() => {
      result.current.mutateCurrentDocument((draft) => {
        draft.document_name = "Version 2";
      });
    });

    expect(result.current.historyState.index).toBe(1);

    act(() => {
      result.current.clearDocumentHistory("other-doc-id");
    });

    // History should NOT be cleared since the document id doesn't match
    expect(result.current.historyState.documentId).toBe("doc-1");
    expect(result.current.historyState.index).toBe(1);
  });
});
