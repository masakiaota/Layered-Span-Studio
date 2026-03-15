import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { useProjectBundle } from "../features/project-shell/useProjectBundle";
import type { DocumentListItem, DocumentRecord, LabelRecord, ProjectRecord } from "../types";

const project: ProjectRecord = {
  id: "project-1",
  name: "Test Project",
  description: "",
  meta: {},
};

const labels: LabelRecord[] = [
  {
    id: "label-1",
    project_id: "project-1",
    project_name: "Test Project",
    name: "Entity",
    color: "#e74c3c",
    description: "",
    shortcut: null,
    meta: {},
  },
];

function createDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc-1",
    project_id: "project-1",
    project_name: "Test Project",
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

function createDocumentListItem(overrides: Partial<DocumentListItem> = {}): DocumentListItem {
  return {
    id: "doc-1",
    project_id: "project-1",
    document_name: "Doc 1",
    text: "Hello world",
    status: "pending",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    meta: {},
    ...overrides,
  };
}

function makeShowToast() {
  return vi.fn();
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useProjectBundle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads bundle when loadBundle is called", async () => {
    const doc = createDocument();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [createDocumentListItem()],
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: 20,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "getDocument").mockResolvedValue(doc);

    const showToast = makeShowToast();
    const onLoaded = vi.fn();

    const { result } = renderHook(() =>
      useProjectBundle({
        token: "test-token",
        projectId: "project-1",
        searchQuery: "",
        sortMode: "created",
        selectedDocId: null,
        showToast,
      }),
    );

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await result.current.loadBundle(onLoaded);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.bundle).not.toBeNull();
    expect(result.current.bundle?.project.id).toBe("project-1");
    expect(result.current.bundle?.labels).toHaveLength(1);
    expect(result.current.bundle?.documents).toHaveLength(1);
    expect(result.current.documentTotal).toBe(1);
    expect(result.current.pendingDocumentTotal).toBe(1);
    expect(onLoaded).toHaveBeenCalledWith(
      expect.objectContaining({ project, labels }),
      "doc-1",
    );
  });

  it("shows toast on load error", async () => {
    vi.spyOn(api, "getProject").mockRejectedValue(new Error("Network error"));
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [] });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [],
      total: 0,
      pending_total: 0,
      offset: 0,
      limit: 20,
      search: "",
      sort: "created",
    });

    const showToast = makeShowToast();

    const { result } = renderHook(() =>
      useProjectBundle({
        token: "test-token",
        projectId: "project-1",
        searchQuery: "",
        sortMode: "created",
        selectedDocId: null,
        showToast,
      }),
    );

    await act(async () => {
      await result.current.loadBundle();
    });

    expect(showToast).toHaveBeenCalledWith("Network error", "error");
    expect(result.current.loading).toBe(false);
  });

  it("mutateSettingsBundle updates project and labels in bundle", async () => {
    const doc = createDocument();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [createDocumentListItem()],
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: 20,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "getDocument").mockResolvedValue(doc);

    const showToast = makeShowToast();

    const { result } = renderHook(() =>
      useProjectBundle({
        token: "test-token",
        projectId: "project-1",
        searchQuery: "",
        sortMode: "created",
        selectedDocId: null,
        showToast,
      }),
    );

    await act(async () => {
      await result.current.loadBundle();
    });

    act(() => {
      result.current.mutateSettingsBundle((draft) => {
        draft.project.name = "Renamed Project";
      });
    });

    expect(result.current.bundle?.project.name).toBe("Renamed Project");
  });

  it("removeDocumentFromLocalState removes document from bundle and document list", async () => {
    const doc1 = createDocument({ id: "doc-1", document_name: "Doc 1" });
    const doc2 = createDocument({ id: "doc-2", document_name: "Doc 2" });
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [] });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [
        createDocumentListItem({ id: "doc-1", document_name: "Doc 1" }),
        createDocumentListItem({ id: "doc-2", document_name: "Doc 2" }),
      ],
      total: 2,
      pending_total: 2,
      offset: 0,
      limit: 20,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "getDocument").mockResolvedValue(doc1);

    const showToast = makeShowToast();

    const { result } = renderHook(() =>
      useProjectBundle({
        token: "test-token",
        projectId: "project-1",
        searchQuery: "",
        sortMode: "created",
        selectedDocId: null,
        showToast,
      }),
    );

    await act(async () => {
      await result.current.loadBundle();
    });

    // Manually add doc2 to bundle for testing
    act(() => {
      result.current.setBundle((current) =>
        current
          ? { ...current, documents: [...current.documents, doc2] }
          : current,
      );
    });

    expect(result.current.documentList).toHaveLength(2);

    act(() => {
      result.current.removeDocumentFromLocalState("doc-1");
    });

    expect(result.current.bundle?.documents).toHaveLength(1);
    expect(result.current.bundle?.documents[0].id).toBe("doc-2");
    expect(result.current.documentList).toHaveLength(1);
    expect(result.current.documentList[0].id).toBe("doc-2");
    expect(result.current.documentSnapshotsById["doc-1"]).toBeUndefined();
  });

  it("fetchDocumentPage appends to document list when not resetting", async () => {
    const doc = createDocument();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [] });
    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: [createDocumentListItem({ id: "doc-1", document_name: "Doc 1" })],
        total: 3,
        pending_total: 3,
        offset: 0,
        limit: 20,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: [
          createDocumentListItem({ id: "doc-2", document_name: "Doc 2" }),
          createDocumentListItem({ id: "doc-3", document_name: "Doc 3" }),
        ],
        total: 3,
        pending_total: 3,
        offset: 1,
        limit: 20,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument").mockResolvedValue(doc);

    const showToast = makeShowToast();

    const { result } = renderHook(() =>
      useProjectBundle({
        token: "test-token",
        projectId: "project-1",
        searchQuery: "",
        sortMode: "created",
        selectedDocId: null,
        showToast,
      }),
    );

    await act(async () => {
      await result.current.loadBundle();
    });

    expect(result.current.documentList).toHaveLength(1);

    await act(async () => {
      await result.current.fetchDocumentPage(false);
    });

    await waitFor(() => {
      expect(result.current.documentList.length).toBeGreaterThan(1);
    });
  });

  it("keeps loading true while a newer loadBundle call is still pending", async () => {
    const firstListDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: string;
    }>();
    const secondListDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: string;
    }>();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [] });
    vi.spyOn(api, "listDocuments")
      .mockReturnValueOnce(firstListDeferred.promise)
      .mockReturnValueOnce(secondListDeferred.promise);
    vi.spyOn(api, "getDocument").mockResolvedValue(createDocument());

    const { result } = renderHook(() =>
      useProjectBundle({
        token: "test-token",
        projectId: "project-1",
        searchQuery: "",
        sortMode: "created",
        selectedDocId: null,
        showToast: makeShowToast(),
      }),
    );

    let firstLoad!: Promise<void>;
    let secondLoad!: Promise<void>;

    act(() => {
      firstLoad = result.current.loadBundle();
    });
    act(() => {
      secondLoad = result.current.loadBundle();
    });

    expect(result.current.loading).toBe(true);

    firstListDeferred.resolve({
      documents: [createDocumentListItem()],
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: 20,
      search: "",
      sort: "created",
    });

    await act(async () => {
      await firstLoad;
    });

    expect(result.current.loading).toBe(true);

    secondListDeferred.resolve({
      documents: [createDocumentListItem()],
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: 20,
      search: "",
      sort: "created",
    });

    await act(async () => {
      await secondLoad;
    });

    expect(result.current.loading).toBe(false);
  });

  it("applies the latest loadBundle even if pagination starts while it is in flight", async () => {
    const reloadingListDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: string;
    }>();
    const initialProject = project;
    const refreshedProject = {
      ...project,
      name: "Reloaded Project",
    };
    vi.spyOn(api, "getProject")
      .mockResolvedValueOnce(initialProject)
      .mockResolvedValueOnce(refreshedProject);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [] });
    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: [createDocumentListItem()],
        total: 2,
        pending_total: 2,
        offset: 0,
        limit: 20,
        search: "",
        sort: "created",
      })
      .mockReturnValueOnce(reloadingListDeferred.promise)
      .mockResolvedValueOnce({
        documents: [createDocumentListItem({ id: "doc-2", document_name: "Doc 2" })],
        total: 2,
        pending_total: 2,
        offset: 1,
        limit: 20,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument")
      .mockResolvedValueOnce(createDocument())
      .mockResolvedValueOnce(createDocument({
        project_name: "Reloaded Project",
      }));

    const { result } = renderHook(() =>
      useProjectBundle({
        token: "test-token",
        projectId: "project-1",
        searchQuery: "",
        sortMode: "created",
        selectedDocId: null,
        showToast: makeShowToast(),
      }),
    );

    await act(async () => {
      await result.current.loadBundle();
    });

    let reloadingPromise!: Promise<void>;

    act(() => {
      reloadingPromise = result.current.loadBundle();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await result.current.fetchDocumentPage(false);
    });

    reloadingListDeferred.resolve({
      documents: [createDocumentListItem()],
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: 20,
      search: "",
      sort: "created",
    });

    await act(async () => {
      await reloadingPromise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.bundle?.project.name).toBe("Reloaded Project");
  });

  it("keeps documentsLoadingMore true while a newer pagination request is still pending", async () => {
    const firstPageDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: string;
    }>();
    const secondPageDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: string;
    }>();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [] });
    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: [createDocumentListItem()],
        total: 3,
        pending_total: 3,
        offset: 0,
        limit: 20,
        search: "",
        sort: "created",
      })
      .mockReturnValueOnce(firstPageDeferred.promise)
      .mockReturnValueOnce(secondPageDeferred.promise);
    vi.spyOn(api, "getDocument").mockResolvedValue(createDocument());

    const { result } = renderHook(() =>
      useProjectBundle({
        token: "test-token",
        projectId: "project-1",
        searchQuery: "",
        sortMode: "created",
        selectedDocId: null,
        showToast: makeShowToast(),
      }),
    );

    await act(async () => {
      await result.current.loadBundle();
    });

    let firstPageLoad!: Promise<DocumentListItem[]>;
    let secondPageLoad!: Promise<DocumentListItem[]>;

    act(() => {
      firstPageLoad = result.current.fetchDocumentPage(false);
    });
    act(() => {
      secondPageLoad = result.current.fetchDocumentPage(false);
    });

    expect(result.current.documentsLoadingMore).toBe(true);

    firstPageDeferred.resolve({
      documents: [createDocumentListItem({ id: "doc-2", document_name: "Doc 2" })],
      total: 3,
      pending_total: 3,
      offset: 1,
      limit: 20,
      search: "",
      sort: "created",
    });

    await act(async () => {
      await firstPageLoad;
    });

    expect(result.current.documentsLoadingMore).toBe(true);

    secondPageDeferred.resolve({
      documents: [createDocumentListItem({ id: "doc-3", document_name: "Doc 3" })],
      total: 3,
      pending_total: 3,
      offset: 1,
      limit: 20,
      search: "",
      sort: "created",
    });

    await act(async () => {
      await secondPageLoad;
    });

    expect(result.current.documentsLoadingMore).toBe(false);
  });

  it("clears documentsLoadingMore when a reset request supersedes pagination", async () => {
    const loadMoreDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: string;
    }>();
    const resetDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: string;
    }>();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [] });
    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: [createDocumentListItem()],
        total: 2,
        pending_total: 2,
        offset: 0,
        limit: 20,
        search: "",
        sort: "created",
      })
      .mockReturnValueOnce(loadMoreDeferred.promise)
      .mockReturnValueOnce(resetDeferred.promise);
    vi.spyOn(api, "getDocument").mockResolvedValue(createDocument());

    const { result } = renderHook(() =>
      useProjectBundle({
        token: "test-token",
        projectId: "project-1",
        searchQuery: "",
        sortMode: "created",
        selectedDocId: null,
        showToast: makeShowToast(),
      }),
    );

    await act(async () => {
      await result.current.loadBundle();
    });

    act(() => {
      void result.current.fetchDocumentPage(false);
    });

    expect(result.current.documentsLoadingMore).toBe(true);

    act(() => {
      void result.current.fetchDocumentPage(true);
    });

    expect(result.current.documentsLoadingMore).toBe(false);

    resetDeferred.resolve({
      documents: [createDocumentListItem()],
      total: 2,
      pending_total: 2,
      offset: 0,
      limit: 20,
      search: "",
      sort: "created",
    });
    loadMoreDeferred.resolve({
      documents: [createDocumentListItem({ id: "doc-2", document_name: "Doc 2" })],
      total: 2,
      pending_total: 2,
      offset: 1,
      limit: 20,
      search: "",
      sort: "created",
    });

    await act(async () => {
      await Promise.allSettled([resetDeferred.promise, loadMoreDeferred.promise]);
    });
  });
});
