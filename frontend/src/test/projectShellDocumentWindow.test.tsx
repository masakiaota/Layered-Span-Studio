import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectShell } from "../App";
import { api } from "../api";
import type { DocumentNavigationResponse, DocumentRecord, LabelRecord, ProjectRecord, UserRecord } from "../api-contract";
import type { DocumentListItem } from "../types";

vi.mock("../features/project-shell/useProjectExamples", () => ({
  useProjectExamples: () => ({
    sameLabelExamples: [],
    sameLabelExamplesTotal: 0,
    sameLabelExamplesOffset: 0,
    sameLabelExamplesLoadingMore: false,
    sameLabelExampleDetails: {},
    sameSurfaceExamples: [],
    sameSurfaceExamplesTotal: 0,
    sameSurfaceExamplesOffset: 0,
    sameSurfaceExamplesLoadingMore: false,
    sameSurfaceTargetLabelId: null,
    loadSameLabelExamples: vi.fn(),
    loadSameSurfaceExamples: vi.fn(),
    ensureSameLabelDetails: vi.fn(),
  }),
}));

vi.mock("../features/project-shell/useBodyScrollLock", () => ({
  useBodyScrollLock: () => {},
}));

const project: ProjectRecord = {
  id: "project-1",
  name: "Medical NER",
  description: "desc",
  meta: {},
  created_at: "2026-03-01T00:00:00Z",
};

const labels: LabelRecord[] = [
  {
    id: "label-1",
    project_id: "project-1",
    project_name: "Medical NER",
    name: "主訴",
    color: "#e74c3c",
    description: "desc",
    shortcut: "1",
    meta: {},
  },
];

const user: UserRecord = {
  id: "user-1",
  username: "demo_login_user",
  meta: {},
};

function createDocument(index: number): DocumentRecord {
  return {
    id: `doc-${index}`,
    project_id: "project-1",
    project_name: "Medical NER",
    document_name: `Doc ${index}`,
    text: `Document ${index} text`,
    status: "pending",
    created_at: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    updated_at: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    annotations: [],
    meta: {},
  };
}

function toListItem(document: DocumentRecord): DocumentListItem {
  return {
    id: document.id,
    project_id: document.project_id,
    project_name: document.project_name,
    document_name: document.document_name,
    text: document.text,
    status: document.status,
    created_at: document.created_at,
    updated_at: document.updated_at,
    meta: document.meta,
  };
}

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={["/projects/project-1"]}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectShell user={user} onLogout={vi.fn()} />} />
      </Routes>
    </MemoryRouter>,
  );
}

function scrollDocumentListToBottom() {
  const scroller = screen.getByTestId("document-list-scroll");
  Object.defineProperty(scroller, "scrollTop", { value: 1000, configurable: true, writable: true });
  Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true });
  Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true });
  fireEvent.scroll(scroller);
}

describe("ProjectShell document list window", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves pending keyboard navigation from the off-window selected document in one step", async () => {
    const documents = Array.from({ length: 160 }, (_, index) => createDocument(index));
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels, revision: "labels-revision-1" });
    vi.spyOn(api, "listDocuments").mockImplementation(async (_projectId, options) => {
      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? 100;
      return {
        documents: documents.slice(offset, offset + limit).map(toListItem),
        total: documents.length,
        pending_total: documents.length,
        offset,
        limit,
        search: options?.search ?? "",
        sort: options?.sort ?? "created",
      };
    });
    vi.spyOn(api, "getDocument").mockImplementation(async (_projectId, documentId) => {
      const document = documents.find((item) => item.id === documentId);
      if (!document) {
        throw new Error("Document not found");
      }
      return structuredClone(document);
    });
    vi.spyOn(api, "getDocumentNavigation").mockResolvedValue({
      current_document_id: "doc-0",
      prev_document_id: null,
      next_document_id: "doc-1",
      prev_pending_document_id: null,
      next_pending_document_id: "doc-1",
      search: "",
      sort: "created",
    } satisfies DocumentNavigationResponse);

    renderWorkspace();

    await screen.findByText("Doc 0");
    scrollDocumentListToBottom();
    await screen.findByText("Doc 40");
    scrollDocumentListToBottom();
    await screen.findByText("Doc 80");
    scrollDocumentListToBottom();
    await screen.findByText("Doc 120");
    await waitFor(() => {
      expect(screen.queryByText("Doc 0")).not.toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "J", shiftKey: true });

    expect(await screen.findByText("Doc 1")).toBeInTheDocument();
    await waitFor(() => {
      expect(api.getDocumentNavigation).toHaveBeenCalledWith("project-1", "doc-0", {
        search: "",
        sort: "created",
      });
    });
  }, 15000);

  it("keeps the selected document unchanged when off-window navigation cannot load the target window", async () => {
    const documents = Array.from({ length: 160 }, (_, index) => createDocument(index));
    const getDocumentSpy = vi.spyOn(api, "getDocument").mockImplementation(async (_projectId, documentId) => {
      const document = documents.find((item) => item.id === documentId);
      if (!document) {
        throw new Error("Document not found");
      }
      return structuredClone(document);
    });
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels, revision: "labels-revision-1" });
    vi.spyOn(api, "listDocuments").mockImplementation(async (_projectId, options) => {
      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? 100;
      return {
        documents: documents.slice(offset, offset + limit).map(toListItem),
        total: documents.length,
        pending_total: documents.length,
        offset,
        limit,
        search: options?.search ?? "",
        sort: options?.sort ?? "created",
      };
    });
    vi.spyOn(api, "getDocumentNavigation").mockResolvedValue({
      current_document_id: "doc-0",
      prev_document_id: null,
      next_document_id: "missing-doc",
      prev_pending_document_id: null,
      next_pending_document_id: "missing-doc",
      search: "",
      sort: "created",
    } satisfies DocumentNavigationResponse);

    renderWorkspace();

    await screen.findByText("Doc 0");
    scrollDocumentListToBottom();
    await screen.findByText("Doc 40");
    scrollDocumentListToBottom();
    await screen.findByText("Doc 80");
    scrollDocumentListToBottom();
    await screen.findByText("Doc 120");
    await waitFor(() => {
      expect(screen.queryByText("Doc 0")).not.toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "j" });

    await waitFor(() => {
      expect(api.getDocumentNavigation).toHaveBeenCalled();
    });
    expect(getDocumentSpy).not.toHaveBeenCalledWith("project-1", "missing-doc");
  }, 15000);
});
