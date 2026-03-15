import { useState } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDocumentHistory } from "../features/project-shell/useDocumentHistory";
import type { DocumentRecord } from "../types";

type UseDocumentHistoryResult = ReturnType<typeof useDocumentHistory>;

function createDocument(id: string): DocumentRecord {
  return {
    id,
    project_id: "project-1",
    project_name: "Medical NER",
    document_name: `Doc ${id}`,
    text: "text",
    status: "pending",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    annotations: [],
    meta: {},
  };
}

function renderHistoryHook() {
  const stateRef: { current: UseDocumentHistoryResult | null } = { current: null };
  const bundleRef: { current: { documents: Array<{ document_name: string }> } | null } = { current: null };
  const document = createDocument("doc-1");

  function HistoryHarness() {
    const [bundle, setBundle] = useState({
      project: {
        id: "project-1",
        name: "Medical NER",
        description: null,
        meta: {},
      },
      labels: [],
      documents: [document],
    });
    bundleRef.current = bundle;

    stateRef.current = useDocumentHistory({
      bundle,
      currentDocument: bundle.documents[0],
      setBundle,
    });

    return null;
  }

  render(<HistoryHarness />);

  return { stateRef, bundleRef };
}

describe("useDocumentHistory", () => {
  it("tracks dirty and supports undo/redo on current document", async () => {
    const { stateRef, bundleRef } = renderHistoryHook();

    await waitFor(() => {
      expect(stateRef.current).not.toBeNull();
    });

    act(() => {
      stateRef.current?.setHistoryForDocument(createDocument("doc-1"));
    });
    expect(stateRef.current?.currentDocumentDirty).toBe(false);

    act(() => {
      stateRef.current?.mutateCurrentDocument((draft) => {
        draft.document_name = "Updated";
      });
    });
    expect(stateRef.current?.currentDocumentDirty).toBe(true);
    expect(stateRef.current?.canUndo).toBe(true);

    act(() => {
      stateRef.current?.undo();
    });
    expect(bundleRef.current?.documents[0]?.document_name).toBe("Doc doc-1");
    expect(stateRef.current?.currentDocumentDirty).toBe(false);

    act(() => {
      stateRef.current?.redo();
    });
    expect(bundleRef.current?.documents[0]?.document_name).toBe("Updated");
    expect(stateRef.current?.currentDocumentDirty).toBe(true);
  });

  it("removes snapshots and history when document is removed", async () => {
    const { stateRef } = renderHistoryHook();

    await waitFor(() => {
      expect(stateRef.current).not.toBeNull();
    });

    act(() => {
      stateRef.current?.setHistoryForDocument(createDocument("doc-1"));
      stateRef.current?.setSavedDocument(createDocument("doc-1"));
    });
    act(() => {
      stateRef.current?.removeDocumentState("doc-1");
    });

    expect(stateRef.current?.documentSnapshotsById["doc-1"]).toBeUndefined();
    expect(stateRef.current?.historyState.documentId).toBeNull();
  });
});
