import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import {
  DOCUMENT_DETAIL_CACHE_RECENT_SIZE,
  DOCUMENT_LIST_SYNC_INTERVAL_MS,
  DOCUMENT_PAGE_SIZE,
  DOCUMENT_WINDOW_SIZE,
} from "../features/project-shell/projectShellConstants";
import { useProjectBundle } from "../features/project-shell/useProjectBundle";
import type { DocumentRecord, DocumentSortValue, LabelRecord, ProjectRecord } from "../api-contract";
import type { DocumentListItem } from "../types";

const project: ProjectRecord = {
  id: "project-1",
  name: "Test Project",
  description: "",
  meta: {},
  created_at: "2026-01-01T00:00:00Z",
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
const labelsRevision = "labels-revision-1";

type SelectedDocumentProps = {
  selectedDocId: string | null;
};

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
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels, revision: labelsRevision });
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
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
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

  it("suppresses stale loadBundle errors when a newer load succeeds", async () => {
    const staleLoadDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: DocumentSortValue;
    }>();
    vi.spyOn(api, "getProject")
      .mockRejectedValueOnce(new Error("stale load failed"))
      .mockResolvedValueOnce(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
    vi.spyOn(api, "listDocuments")
      .mockReturnValueOnce(staleLoadDeferred.promise)
      .mockResolvedValueOnce({
        documents: [createDocumentListItem()],
        total: 1,
        pending_total: 1,
        offset: 0,
        limit: 20,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument").mockResolvedValue(createDocument());

    const showToast = makeShowToast();
    const { result } = renderHook(() =>
      useProjectBundle({
        projectId: "project-1",
        searchQuery: "",
        sortMode: "created",
        selectedDocId: null,
        showToast,
      }),
    );

    let staleLoad!: Promise<void>;
    let latestLoad!: Promise<void>;

    act(() => {
      staleLoad = result.current.loadBundle();
    });
    act(() => {
      latestLoad = result.current.loadBundle();
    });

    staleLoadDeferred.resolve({
      documents: [createDocumentListItem()],
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: 20,
      search: "",
      sort: "created",
    });

    await act(async () => {
      await Promise.all([staleLoad, latestLoad]);
    });

    expect(showToast).not.toHaveBeenCalledWith("stale load failed", "error");
    expect(result.current.bundle?.project.id).toBe("project-1");
  });

  it("mutateSettingsBundle updates project and labels in bundle", async () => {
    const doc = createDocument();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels, revision: labelsRevision });
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
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
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

  it("keeps selected document details within the recent document cache", async () => {
    const documents = Array.from({ length: DOCUMENT_DETAIL_CACHE_RECENT_SIZE + 3 }, (_, index) =>
      createDocument({
        id: `doc-${index + 1}`,
        document_name: `Doc ${index + 1}`,
      }),
    );
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: documents.map((document) => createDocumentListItem({
        id: document.id,
        document_name: document.document_name,
      })),
      total: documents.length,
      pending_total: documents.length,
      offset: 0,
      limit: DOCUMENT_PAGE_SIZE,
      search: "",
      sort: "created",
    });
    const getDocumentSpy = vi.spyOn(api, "getDocument").mockImplementation(async (_projectId, documentId) => {
      const document = documents.find((item) => item.id === documentId);
      if (!document) {
        throw new Error("Document not found");
      }
      return document;
    });

    const { result, rerender } = renderHook(
      ({ selectedDocId }: SelectedDocumentProps) =>
        useProjectBundle({
          projectId: "project-1",
          searchQuery: "",
          sortMode: "created",
          selectedDocId,
          showToast: makeShowToast(),
        }),
      { initialProps: { selectedDocId: null } as SelectedDocumentProps },
    );

    await act(async () => {
      await result.current.loadBundle();
    });

    for (const document of documents.slice(1)) {
      await act(async () => {
        rerender({ selectedDocId: document.id });
      });
      await waitFor(() => {
        expect(result.current.bundle?.documents.some((item) => item.id === document.id)).toBe(true);
      });
    }

    expect(result.current.bundle?.documents).toHaveLength(DOCUMENT_DETAIL_CACHE_RECENT_SIZE);
    expect(result.current.documentSnapshotsById["doc-1"]).toBeUndefined();
    expect(result.current.documentSnapshotsById["doc-2"]).toBeUndefined();

    const callsBeforeCacheHit = getDocumentSpy.mock.calls.length;
    await act(async () => {
      rerender({ selectedDocId: "doc-4" });
    });
    await waitFor(() => {
      expect(result.current.bundle?.documents.some((item) => item.id === "doc-4")).toBe(true);
    });
    expect(getDocumentSpy).toHaveBeenCalledTimes(callsBeforeCacheHit);

    await act(async () => {
      rerender({ selectedDocId: "doc-2" });
    });
    await waitFor(() => {
      expect(result.current.bundle?.documents.some((item) => item.id === "doc-2")).toBe(true);
    });
    expect(getDocumentSpy).toHaveBeenCalledTimes(callsBeforeCacheHit + 1);
  });

  it("does not evict dirty document details or their snapshots", async () => {
    const documents = Array.from({ length: DOCUMENT_DETAIL_CACHE_RECENT_SIZE + 3 }, (_, index) =>
      createDocument({
        id: `doc-${index + 1}`,
        document_name: `Doc ${index + 1}`,
      }),
    );
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: documents.map((document) => createDocumentListItem({
        id: document.id,
        document_name: document.document_name,
      })),
      total: documents.length,
      pending_total: documents.length,
      offset: 0,
      limit: DOCUMENT_PAGE_SIZE,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "getDocument").mockImplementation(async (_projectId, documentId) => {
      const document = documents.find((item) => item.id === documentId);
      if (!document) {
        throw new Error("Document not found");
      }
      return document;
    });

    const { result, rerender } = renderHook(
      ({ selectedDocId }: SelectedDocumentProps) =>
        useProjectBundle({
          projectId: "project-1",
          searchQuery: "",
          sortMode: "created",
          selectedDocId,
          showToast: makeShowToast(),
        }),
      { initialProps: { selectedDocId: "doc-1" } },
    );

    await act(async () => {
      await result.current.loadBundle();
    });
    act(() => {
      result.current.setBundle((current) =>
        current
          ? {
              ...current,
              documents: current.documents.map((document) =>
                document.id === "doc-1"
                  ? { ...document, text: "Dirty text" }
                  : document,
              ),
            }
          : current,
      );
    });

    for (const document of documents.slice(1)) {
      rerender({ selectedDocId: document.id });
      await waitFor(() => {
        expect(result.current.bundle?.documents.some((item) => item.id === document.id)).toBe(true);
      });
    }

    expect(result.current.bundle?.documents.some((document) => document.id === "doc-1")).toBe(true);
    expect(result.current.documentSnapshotsById["doc-1"]).toBeDefined();
    expect(result.current.bundle?.documents).toHaveLength(DOCUMENT_DETAIL_CACHE_RECENT_SIZE + 1);
    expect(result.current.documentSnapshotsById["doc-2"]).toBeUndefined();
  });

  it("fetchDocumentPage appends to document list when not resetting", async () => {
    const doc = createDocument();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
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

  it("reloads the previous page after older document rows are trimmed from the window", async () => {
    const makePage = (offset: number) =>
      Array.from({ length: DOCUMENT_PAGE_SIZE }, (_, index) =>
        createDocumentListItem({
          id: `doc-${offset + index}`,
          document_name: `Doc ${offset + index}`,
          created_at: `2026-01-${String((offset + index) % 28 + 1).padStart(2, "0")}T00:00:00Z`,
          updated_at: `2026-01-${String((offset + index) % 28 + 1).padStart(2, "0")}T00:00:00Z`,
        }),
      );

    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
    const listDocumentsSpy = vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: makePage(0),
        total: DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE,
        pending_total: DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: makePage(40),
        total: DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE,
        pending_total: DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE,
        offset: 40,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: makePage(80),
        total: DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE,
        pending_total: DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE,
        offset: 80,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: makePage(120),
        total: DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE,
        pending_total: DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE,
        offset: 120,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: makePage(0),
        total: DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE,
        pending_total: DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument").mockResolvedValue(createDocument({ id: "doc-0", document_name: "Doc 0" }));

    const { result } = renderHook(() =>
      useProjectBundle({
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
    await act(async () => {
      await result.current.fetchDocumentPage(false);
    });
    await act(async () => {
      await result.current.fetchDocumentPage(false);
    });
    await act(async () => {
      await result.current.fetchDocumentPage(false);
    });

    expect(result.current.documentList).toHaveLength(DOCUMENT_WINDOW_SIZE);
    expect(result.current.documentWindowStartOffset).toBe(40);
    expect(result.current.documentList.some((document) => document.id === "doc-0")).toBe(false);

    await act(async () => {
      await result.current.fetchDocumentPage("previous");
    });

    expect(listDocumentsSpy).toHaveBeenLastCalledWith("project-1", {
      offset: 0,
      limit: DOCUMENT_PAGE_SIZE,
      search: "",
      sort: "created",
    });
    expect(result.current.documentWindowStartOffset).toBe(0);
    expect(result.current.documentList.some((document) => document.id === "doc-0")).toBe(true);
    expect(result.current.documentList.some((document) => document.id === "doc-159")).toBe(false);
  });

  it("focuses the document list window on a document outside the current page", async () => {
    const makePage = (offset: number) =>
      Array.from({ length: DOCUMENT_PAGE_SIZE }, (_, index) =>
        createDocumentListItem({
          id: `doc-${offset + index}`,
          document_name: `Doc ${offset + index}`,
        }),
      );

    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
    const listDocumentsSpy = vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: makePage(0),
        total: 120,
        pending_total: 120,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: makePage(0),
        total: 120,
        pending_total: 120,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: makePage(40),
        total: 120,
        pending_total: 120,
        offset: 40,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument").mockResolvedValue(createDocument({ id: "doc-0", document_name: "Doc 0" }));

    const { result } = renderHook(() =>
      useProjectBundle({
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
    await act(async () => {
      await result.current.focusDocumentListWindow("doc-42");
    });

    expect(listDocumentsSpy).toHaveBeenLastCalledWith("project-1", {
      offset: 40,
      limit: DOCUMENT_PAGE_SIZE,
      search: "",
      sort: "created",
    });
    expect(result.current.documentWindowStartOffset).toBe(40);
    expect(result.current.documentList.some((document) => document.id === "doc-42")).toBe(true);
  });

  it("starts focused document window lookup near the current scroll window", async () => {
    const makePage = (offset: number) =>
      Array.from({ length: DOCUMENT_PAGE_SIZE }, (_, index) =>
        createDocumentListItem({
          id: `doc-${offset + index}`,
          document_name: `Doc ${offset + index}`,
        }),
      );

    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
    const listDocumentsSpy = vi.spyOn(api, "listDocuments").mockImplementation(async (_projectId, options) => {
      const offset = options?.offset ?? 0;
      return {
        documents: makePage(offset),
        total: 200,
        pending_total: 200,
        offset,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      };
    });
    vi.spyOn(api, "getDocument").mockResolvedValue(createDocument({ id: "doc-0", document_name: "Doc 0" }));

    const { result } = renderHook(() =>
      useProjectBundle({
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
    await act(async () => {
      await result.current.fetchDocumentPage(false);
    });
    await act(async () => {
      await result.current.fetchDocumentPage(false);
    });
    await act(async () => {
      await result.current.fetchDocumentPage(false);
    });

    expect(result.current.documentWindowStartOffset).toBe(40);
    const focusCallStart = listDocumentsSpy.mock.calls.length;

    await act(async () => {
      await result.current.focusDocumentListWindow("doc-10");
    });

    const focusOffsets = listDocumentsSpy.mock.calls
      .slice(focusCallStart)
      .map(([, options]) => options?.offset);
    expect(focusOffsets[0]).toBe(40);
    expect(focusOffsets).toContain(0);
    expect(result.current.documentList.some((document) => document.id === "doc-10")).toBe(true);
  });

  it("keeps loading true while a newer loadBundle call is still pending", async () => {
    const firstListDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: DocumentSortValue;
    }>();
    const secondListDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: DocumentSortValue;
    }>();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
    vi.spyOn(api, "listDocuments")
      .mockReturnValueOnce(firstListDeferred.promise)
      .mockReturnValueOnce(secondListDeferred.promise);
    vi.spyOn(api, "getDocument").mockResolvedValue(createDocument());

    const { result } = renderHook(() =>
      useProjectBundle({
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
      sort: DocumentSortValue;
    }>();
    const initialProject = project;
    const refreshedProject = {
      ...project,
      name: "Reloaded Project",
    };
    vi.spyOn(api, "getProject")
      .mockResolvedValueOnce(initialProject)
      .mockResolvedValueOnce(refreshedProject);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
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

  it("ignores stale pagination responses after loadBundle reloads the list", async () => {
    const stalePageDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: DocumentSortValue;
    }>();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: [createDocumentListItem({ id: "doc-1", document_name: "Doc 1" })],
        total: 1,
        pending_total: 1,
        offset: 0,
        limit: 20,
        search: "",
        sort: "created",
      })
      .mockReturnValueOnce(stalePageDeferred.promise)
      .mockResolvedValueOnce({
        documents: [
          createDocumentListItem({ id: "doc-2", document_name: "Imported Doc" }),
          createDocumentListItem({ id: "doc-1", document_name: "Doc 1" }),
        ],
        total: 2,
        pending_total: 2,
        offset: 0,
        limit: 20,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument")
      .mockResolvedValueOnce(createDocument({ id: "doc-1", document_name: "Doc 1" }))
      .mockResolvedValueOnce(createDocument({ id: "doc-2", document_name: "Imported Doc" }));

    const { result } = renderHook(() =>
      useProjectBundle({
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

    let stalePagination!: Promise<DocumentListItem[]>;
    let reloadingPromise!: Promise<void>;

    act(() => {
      stalePagination = result.current.fetchDocumentPage(false);
    });

    expect(result.current.documentsLoadingMore).toBe(true);

    act(() => {
      reloadingPromise = result.current.loadBundle();
    });

    await act(async () => {
      await reloadingPromise;
    });

    expect(result.current.documentsLoadingMore).toBe(false);
    expect(result.current.documentList.map((document) => document.id)).toEqual([
      "doc-2",
      "doc-1",
    ]);
    expect(result.current.documentTotal).toBe(2);

    stalePageDeferred.resolve({
      documents: [createDocumentListItem({ id: "doc-3", document_name: "Stale Doc" })],
      total: 3,
      pending_total: 3,
      offset: 1,
      limit: 20,
      search: "",
      sort: "created",
    });

    await act(async () => {
      await stalePagination;
    });

    expect(result.current.documentList.map((document) => document.id)).toEqual([
      "doc-2",
      "doc-1",
    ]);
    expect(result.current.documentTotal).toBe(2);
    expect(result.current.pendingDocumentTotal).toBe(2);
  });

  it("keeps documentsLoadingMore true while a newer pagination request is still pending", async () => {
    const firstPageDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: DocumentSortValue;
    }>();
    const secondPageDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: DocumentSortValue;
    }>();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
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

  it("suppresses stale pagination errors when a newer request succeeds", async () => {
    const stalePageDeferred = createDeferred<DocumentListItem[]>();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
    const listDocumentsSpy = vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: [createDocumentListItem()],
        total: 2,
        pending_total: 2,
        offset: 0,
        limit: 20,
        search: "",
        sort: "created",
      })
      .mockImplementationOnce(async () => {
        const documents = await stalePageDeferred.promise;
        return {
          documents,
          total: 2,
          pending_total: 2,
          offset: 1,
          limit: 20,
          search: "",
          sort: "created",
        };
      })
      .mockResolvedValueOnce({
        documents: [createDocumentListItem({ id: "doc-3", document_name: "Doc 3" })],
        total: 2,
        pending_total: 2,
        offset: 1,
        limit: 20,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument").mockResolvedValue(createDocument());

    const showToast = makeShowToast();
    const { result } = renderHook(() =>
      useProjectBundle({
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

    let stalePagination!: Promise<DocumentListItem[]>;
    let latestPagination!: Promise<DocumentListItem[]>;

    act(() => {
      stalePagination = result.current.fetchDocumentPage(false);
    });
    act(() => {
      latestPagination = result.current.fetchDocumentPage(false);
    });

    stalePageDeferred.reject(new Error("stale pagination failed"));

    await act(async () => {
      await Promise.all([stalePagination, latestPagination]);
    });

    expect(listDocumentsSpy).toHaveBeenCalledTimes(3);
    expect(showToast).not.toHaveBeenCalledWith("stale pagination failed", "error");
  });

  it("clears documentsLoadingMore when a reset request supersedes pagination", async () => {
    const loadMoreDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: DocumentSortValue;
    }>();
    const resetDeferred = createDeferred<{
      documents: DocumentListItem[];
      total: number;
      pending_total: number;
      offset: number;
      limit: number;
      search: string;
      sort: DocumentSortValue;
    }>();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
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

  describe("searchQuery debounce", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function makeListDocumentsMock() {
      return vi.spyOn(api, "listDocuments").mockResolvedValue({
        documents: [createDocumentListItem()],
        total: 1,
        pending_total: 0,
        offset: 0,
        limit: 20,
        search: "",
        sort: "created",
      });
    }

    async function advanceDebounceTime(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    async function setupLoadedBundle(searchQuery: string, sortMode: DocumentSortValue = "created") {
      vi.spyOn(api, "getProject").mockResolvedValue(project);
      vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
      const listDocumentsSpy = makeListDocumentsMock();
      vi.spyOn(api, "getDocument").mockResolvedValue(createDocument());

      const showToast = makeShowToast();
      let currentSearchQuery = searchQuery;
      let currentSortMode = sortMode;
      let currentProjectId = "project-1";

      const { result, rerender } = renderHook(() =>
        useProjectBundle({
          projectId: currentProjectId,
          searchQuery: currentSearchQuery,
          sortMode: currentSortMode,
          selectedDocId: null,
          showToast,
        }),
      );

      await act(async () => {
        await result.current.loadBundle();
      });

      return {
        result,
        rerender: (overrides: {
          projectId?: string;
          searchQuery?: string;
          sortMode?: DocumentSortValue;
        } = {}) => {
          if (overrides.projectId !== undefined) currentProjectId = overrides.projectId;
          if (overrides.searchQuery !== undefined) currentSearchQuery = overrides.searchQuery;
          if (overrides.sortMode !== undefined) currentSortMode = overrides.sortMode;
          rerender();
        },
        listDocumentsSpy,
      };
    }

    it("does not call listDocuments before the 200ms debounce window expires", async () => {
      const { rerender, listDocumentsSpy } = await setupLoadedBundle("");
      const callCountAfterLoad = listDocumentsSpy.mock.calls.length;

      act(() => {
        rerender({ searchQuery: "hello" });
      });

      await advanceDebounceTime(199);

      expect(listDocumentsSpy.mock.calls.length).toBe(callCountAfterLoad);
    });

    it("calls listDocuments after 200ms debounce when searchQuery changes", async () => {
      const { rerender, listDocumentsSpy } = await setupLoadedBundle("");
      const callCountAfterLoad = listDocumentsSpy.mock.calls.length;

      act(() => {
        rerender({ searchQuery: "hello" });
      });

      await advanceDebounceTime(199);
      expect(listDocumentsSpy.mock.calls.length).toBe(callCountAfterLoad);

      await advanceDebounceTime(1);

      expect(listDocumentsSpy.mock.calls.length).toBe(callCountAfterLoad + 1);
      expect(listDocumentsSpy.mock.calls[listDocumentsSpy.mock.calls.length - 1]?.[1]).toEqual(
        expect.objectContaining({ search: "hello", sort: "created" }),
      );
    });

    it("calls listDocuments only once when searchQuery changes rapidly", async () => {
      const { rerender, listDocumentsSpy } = await setupLoadedBundle("");
      const callCountAfterLoad = listDocumentsSpy.mock.calls.length;

      // Simulate rapid typing: each keystroke within debounce window
      for (const query of ["h", "he", "hel", "hell", "hello"]) {
        act(() => {
          rerender({ searchQuery: query });
        });
        await advanceDebounceTime(20);
      }

      await advanceDebounceTime(179);
      expect(listDocumentsSpy.mock.calls.length).toBe(callCountAfterLoad);

      await advanceDebounceTime(1);

      expect(listDocumentsSpy.mock.calls.length).toBe(callCountAfterLoad + 1);
      expect(listDocumentsSpy.mock.calls[listDocumentsSpy.mock.calls.length - 1]?.[1]).toEqual(
        expect.objectContaining({ search: "hello", sort: "created" }),
      );
    });

    it("calls listDocuments without debounce when sortMode changes", async () => {
      const { rerender, listDocumentsSpy } = await setupLoadedBundle("", "created");
      const callCountAfterLoad = listDocumentsSpy.mock.calls.length;

      await act(async () => {
        rerender({ sortMode: "name" });
      });

      expect(listDocumentsSpy.mock.calls.length).toBe(callCountAfterLoad + 1);
      expect(listDocumentsSpy.mock.calls[listDocumentsSpy.mock.calls.length - 1]?.[1]).toEqual(
        expect.objectContaining({ search: "", sort: "name" }),
      );
    });

    it("cancels a pending search debounce when sortMode changes", async () => {
      const { rerender, listDocumentsSpy } = await setupLoadedBundle("", "created");
      const callCountAfterLoad = listDocumentsSpy.mock.calls.length;

      act(() => {
        rerender({ searchQuery: "hello" });
      });

      await advanceDebounceTime(50);

      act(() => {
        rerender({ sortMode: "name" });
      });

      expect(listDocumentsSpy.mock.calls.length).toBe(callCountAfterLoad + 1);
      expect(listDocumentsSpy.mock.calls[listDocumentsSpy.mock.calls.length - 1]?.[1]).toEqual(
        expect.objectContaining({ search: "hello", sort: "name" }),
      );

      await advanceDebounceTime(200);

      expect(listDocumentsSpy.mock.calls.length).toBe(callCountAfterLoad + 1);
    });

    it("cancels a pending search debounce when projectId changes", async () => {
      const { rerender, listDocumentsSpy } = await setupLoadedBundle("");
      const callCountAfterLoad = listDocumentsSpy.mock.calls.length;

      act(() => {
        rerender({ searchQuery: "hello" });
      });

      await advanceDebounceTime(50);

      act(() => {
        rerender({ projectId: "project-2" });
      });

      await advanceDebounceTime(200);

      expect(listDocumentsSpy.mock.calls.length).toBe(callCountAfterLoad);
    });
  });

  describe("document list background sync", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("merges externally added documents into the list", async () => {
      const initialListResponse = {
        documents: [createDocumentListItem({ id: "doc-1", document_name: "Doc 1" })],
        total: 1,
        pending_total: 1,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created" as const,
      };
      const refreshedListResponse = {
        documents: [
          createDocumentListItem({
            id: "doc-2",
            document_name: "Doc 2",
            created_at: "2026-03-02T00:00:00Z",
            updated_at: "2026-03-02T00:00:00Z",
          }),
          createDocumentListItem({ id: "doc-1", document_name: "Doc 1" }),
        ],
        total: 2,
        pending_total: 2,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created" as const,
      };
      vi.spyOn(api, "getProject").mockResolvedValue(project);
      vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
      vi.spyOn(api, "listDocuments")
        .mockResolvedValueOnce(initialListResponse)
        .mockResolvedValue(refreshedListResponse);
      vi.spyOn(api, "getDocument").mockResolvedValue(createDocument({ id: "doc-1", document_name: "Doc 1" }));

      const { result } = renderHook(() =>
        useProjectBundle({
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

      expect(result.current.documentList.map((document) => document.id)).toEqual(["doc-1"]);
      expect(result.current.documentTotal).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DOCUMENT_LIST_SYNC_INTERVAL_MS);
      });

      expect(result.current.documentTotal).toBe(2);
      expect(result.current.documentList.map((document) => document.id)).toEqual(["doc-2", "doc-1"]);
    });

    it("refreshes the document list when the tab becomes visible again", async () => {
      const initialListResponse = {
        documents: [createDocumentListItem({ id: "doc-1", document_name: "Doc 1" })],
        total: 1,
        pending_total: 1,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created" as const,
      };
      const refreshedListResponse = {
        documents: [
          createDocumentListItem({
            id: "doc-2",
            document_name: "Doc 2",
            created_at: "2026-03-02T00:00:00Z",
            updated_at: "2026-03-02T00:00:00Z",
          }),
          createDocumentListItem({ id: "doc-1", document_name: "Doc 1" }),
        ],
        total: 2,
        pending_total: 2,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created" as const,
      };
      vi.spyOn(api, "getProject").mockResolvedValue(project);
      vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
      const listDocumentsSpy = vi
        .spyOn(api, "listDocuments")
        .mockResolvedValueOnce(initialListResponse)
        .mockResolvedValue(refreshedListResponse);
      vi.spyOn(api, "getDocument").mockResolvedValue(createDocument({ id: "doc-1", document_name: "Doc 1" }));

      const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });

      try {
        const { result } = renderHook(() =>
          useProjectBundle({
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

        const callCountAfterLoad = listDocumentsSpy.mock.calls.length;

        await act(async () => {
          await vi.advanceTimersByTimeAsync(DOCUMENT_LIST_SYNC_INTERVAL_MS);
        });

        expect(listDocumentsSpy.mock.calls.length).toBe(callCountAfterLoad);

        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => false,
        });

        await act(async () => {
          document.dispatchEvent(new Event("visibilitychange"));
          await Promise.resolve();
        });

        expect(result.current.documentTotal).toBe(2);
        expect(result.current.documentList.map((document) => document.id)).toEqual(["doc-2", "doc-1"]);
      } finally {
        if (hiddenDescriptor) {
          Object.defineProperty(document, "hidden", hiddenDescriptor);
        } else {
          Reflect.deleteProperty(document, "hidden");
        }
      }
    });

    it("does not cancel in-flight pagination when background refresh runs", async () => {
      const initialListResponse = {
        documents: [createDocumentListItem({ id: "doc-1", document_name: "Doc 1" })],
        total: 3,
        pending_total: 3,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created" as const,
      };
      const nextPageDeferred = createDeferred<{
        documents: DocumentListItem[];
        total: number;
        pending_total: number;
        offset: number;
        limit: number;
        search: string;
        sort: DocumentSortValue;
      }>();
      const refreshedListResponse = {
        documents: [createDocumentListItem({ id: "doc-1", document_name: "Doc 1" })],
        total: 3,
        pending_total: 3,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created" as const,
      };
      vi.spyOn(api, "getProject").mockResolvedValue(project);
      vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
      vi.spyOn(api, "listDocuments")
        .mockResolvedValueOnce(initialListResponse)
        .mockReturnValueOnce(nextPageDeferred.promise)
        .mockResolvedValue(refreshedListResponse);
      vi.spyOn(api, "getDocument").mockResolvedValue(createDocument({ id: "doc-1", document_name: "Doc 1" }));

      const { result } = renderHook(() =>
        useProjectBundle({
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

      let paginationPromise!: Promise<DocumentListItem[]>;
      act(() => {
        paginationPromise = result.current.fetchDocumentPage(false);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DOCUMENT_LIST_SYNC_INTERVAL_MS);
      });

      nextPageDeferred.resolve({
        documents: [
          createDocumentListItem({
            id: "doc-2",
            document_name: "Doc 2",
            created_at: "2026-03-02T00:00:00Z",
            updated_at: "2026-03-02T00:00:00Z",
          }),
        ],
        total: 3,
        pending_total: 3,
        offset: 1,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      });

      await act(async () => {
        await paginationPromise;
      });

      expect(result.current.documentList.map((document) => document.id)).toEqual(["doc-1", "doc-2"]);
    });

    it("updates totals but not list contents when the window start offset is non-zero", async () => {
      const makePage = (offset: number) =>
        Array.from({ length: DOCUMENT_PAGE_SIZE }, (_, index) =>
          createDocumentListItem({
            id: `doc-${offset + index}`,
            document_name: `Doc ${offset + index}`,
          }),
        );
      const totalDocuments = DOCUMENT_WINDOW_SIZE + DOCUMENT_PAGE_SIZE;

      vi.spyOn(api, "getProject").mockResolvedValue(project);
      vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [], revision: labelsRevision });
      vi.spyOn(api, "listDocuments")
        .mockResolvedValueOnce({
          documents: makePage(0),
          total: totalDocuments,
          pending_total: totalDocuments,
          offset: 0,
          limit: DOCUMENT_PAGE_SIZE,
          search: "",
          sort: "created",
        })
        .mockResolvedValueOnce({
          documents: makePage(40),
          total: totalDocuments,
          pending_total: totalDocuments,
          offset: 40,
          limit: DOCUMENT_PAGE_SIZE,
          search: "",
          sort: "created",
        })
        .mockResolvedValueOnce({
          documents: makePage(80),
          total: totalDocuments,
          pending_total: totalDocuments,
          offset: 80,
          limit: DOCUMENT_PAGE_SIZE,
          search: "",
          sort: "created",
        })
        .mockResolvedValueOnce({
          documents: makePage(120),
          total: totalDocuments,
          pending_total: totalDocuments,
          offset: 120,
          limit: DOCUMENT_PAGE_SIZE,
          search: "",
          sort: "created",
        })
        .mockResolvedValueOnce({
          documents: [
            createDocumentListItem({ id: "doc-new", document_name: "Imported Doc" }),
            ...makePage(0).slice(0, DOCUMENT_PAGE_SIZE - 1),
          ],
          total: totalDocuments + 1,
          pending_total: totalDocuments + 1,
          offset: 0,
          limit: DOCUMENT_PAGE_SIZE,
          search: "",
          sort: "created",
        });
      vi.spyOn(api, "getDocument").mockResolvedValue(createDocument({ id: "doc-0", document_name: "Doc 0" }));

      const { result } = renderHook(() =>
        useProjectBundle({
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
      await act(async () => {
        await result.current.fetchDocumentPage(false);
      });
      await act(async () => {
        await result.current.fetchDocumentPage(false);
      });
      await act(async () => {
        await result.current.fetchDocumentPage(false);
      });

      expect(result.current.documentWindowStartOffset).toBe(40);
      const listAfterPaging = result.current.documentList.map((document) => document.id);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DOCUMENT_LIST_SYNC_INTERVAL_MS);
      });

      expect(result.current.documentTotal).toBe(totalDocuments + 1);
      expect(result.current.documentList.map((document) => document.id)).toEqual(listAfterPaging);
      expect(result.current.documentList.some((document) => document.id === "doc-new")).toBe(false);
    });
  });
});
