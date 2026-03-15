import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_PAGE_SIZE } from "../features/project-shell/projectShellConstants";
import { useProjectBundle } from "../features/project-shell/useProjectBundle";
import { api } from "../api";
import type { DocumentListItem, DocumentRecord, LabelRecord, ProjectRecord } from "../types";

type UseProjectBundleResult = ReturnType<typeof useProjectBundle>;

function createProject(): ProjectRecord {
  return {
    id: "project-1",
    name: "Medical NER",
    description: "desc",
    meta: {},
  };
}

function createLabel(id: string, name: string): LabelRecord {
  return {
    id,
    project_id: "project-1",
    project_name: "Medical NER",
    name,
    color: "#ff0000",
    description: "",
    shortcut: null,
    meta: {},
  };
}

function createDocumentRecord(id: string, status: "pending" | "verified"): DocumentRecord {
  return {
    id,
    project_id: "project-1",
    project_name: "Medical NER",
    document_name: `Doc ${id}`,
    text: "text",
    status,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    annotations: [],
    meta: {},
  };
}

function createDocumentListItem(document: DocumentRecord): DocumentListItem {
  return {
    id: document.id,
    project_id: document.project_id,
    project_name: document.project_name ?? "",
    document_name: document.document_name,
    text: document.text,
    status: document.status,
    created_at: document.created_at,
    updated_at: document.updated_at,
    meta: document.meta,
  };
}

function renderBundleHook() {
  const resultRef: { current: UseProjectBundleResult | null } = { current: null };

  function BundleHarness() {
    const result = useProjectBundle({
      token: "token",
      projectId: "project-1",
      showToast: vi.fn(),
      onBundleLoaded: vi.fn(),
    });
    resultRef.current = result;
    return null;
  }

  render(<BundleHarness />);
  return resultRef;
}

describe("useProjectBundle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads bundle data and selected document on mount", async () => {
    const project = createProject();
    const labels = [createLabel("label-1", "主訴")];
    const loadedDocument = createDocumentRecord("doc-1", "pending");
    const documents = [createDocumentListItem(loadedDocument)];

    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents,
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: DOCUMENT_PAGE_SIZE,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "getDocument").mockResolvedValue(loadedDocument);

    const result = renderBundleHook();

    await waitFor(() => expect(result.current?.loading).toBe(false));
    expect(result.current?.bundle?.project).toEqual(project);
    expect(result.current?.bundle?.labels).toEqual(labels);
    expect(result.current?.bundle?.documents.length).toBe(1);
    expect(result.current?.currentDocument).toMatchObject({ id: "doc-1" });
    expect(result.current?.selectedDocId).toBe("doc-1");
  });

  it("reloads document list when search query changes", async () => {
    const project = createProject();
    const labels = [createLabel("label-1", "主訴")];
    const loadedDocument = createDocumentRecord("doc-1", "pending");
    const secondDocument = createDocumentRecord("doc-2", "pending");
    const documents = [createDocumentListItem(loadedDocument)];
    const searchResult = [createDocumentListItem(secondDocument)];
    const listDocumentsMock = vi
      .spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents,
        total: 1,
        pending_total: 1,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: searchResult,
        total: 1,
        pending_total: 0,
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: "query",
        sort: "created",
      });
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels });
    vi.spyOn(api, "getDocument").mockResolvedValue(loadedDocument);

    const result = renderBundleHook();
    await waitFor(() => expect(result.current?.loading).toBe(false));

    act(() => {
      result.current?.setSearchQuery("query");
    });

    await waitFor(() => {
      expect(listDocumentsMock).toHaveBeenCalledTimes(2);
    });
    expect(listDocumentsMock).toHaveBeenLastCalledWith("token", "project-1", {
      offset: 0,
      limit: DOCUMENT_PAGE_SIZE,
      search: "query",
      sort: "created",
    });
    expect(result.current?.documentList).toEqual(searchResult);
  });
});
