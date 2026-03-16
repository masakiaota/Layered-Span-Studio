import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectShell } from "../App";
import { ApiError, api } from "../api";
import type { AnnotationRecord, DocumentListItem, DocumentRecord, LabelRecord, ProjectRecord, UserRecord } from "../types";

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

vi.mock("../features/project-shell/useProjectShortcuts", () => ({
  useProjectShortcuts: () => {},
}));

const project: ProjectRecord = {
  id: "project-1",
  name: "Medical NER",
  description: "desc",
  meta: {},
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

function createDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc-1",
    project_id: "project-1",
    project_name: "Medical NER",
    document_name: "Doc 1",
    text: "Hello world",
    status: "pending",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    annotations: [],
    meta: {},
    ...overrides,
  };
}

function createAnnotation(overrides: Partial<AnnotationRecord> = {}): AnnotationRecord {
  return {
    id: "annotation-1",
    document_id: "doc-1",
    document_name: "Doc 1",
    label_id: "label-1",
    label_name: "主訴",
    start: 0,
    end: 5,
    span_text: "Hello",
    comment: "",
    status: "pending",
    meta: {},
    ...overrides,
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

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function sortDocuments(documents: DocumentRecord[], sortMode: string) {
  const sorted = [...documents];
  if (sortMode === "name") {
    return sorted.sort((left, right) => left.document_name.localeCompare(right.document_name));
  }
  if (sortMode === "updated") {
    return sorted.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }
  if (sortMode === "pending") {
    return sorted.sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "pending" ? -1 : 1;
      }
      return left.created_at.localeCompare(right.created_at);
    });
  }
  return sorted.sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function setupDocumentApis(initialDocuments: DocumentRecord[]) {
  let documents = structuredClone(initialDocuments);
  let deleteMode: "success" | "not-found" | "error" = "success";
  let deleteTargetId: string | null = null;
  let deleteMessage = "Document not found";

  vi.spyOn(api, "getProject").mockResolvedValue(project);
  vi.spyOn(api, "listLabels").mockResolvedValue({ labels: structuredClone(labels) });
  vi.spyOn(api, "listDocuments").mockImplementation(async (_projectId, options) => {
    const search = normalizeSearchText(options?.search ?? "");
    const filtered = search
      ? documents.filter((document) => normalizeSearchText(document.text).includes(search))
      : documents;
    const sorted = sortDocuments(filtered, options?.sort ?? "created");
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return {
      documents: sorted.slice(offset, offset + limit).map(toListItem),
      total: sorted.length,
      pending_total: filtered.filter((document) => document.status === "pending").length,
      offset,
      limit,
      search: options?.search ?? "",
      sort: options?.sort ?? "created",
    };
  });
  const getDocumentMock = vi.spyOn(api, "getDocument").mockImplementation(async (_projectId, documentId) => {
    const document = documents.find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found");
    }
    return structuredClone(document);
  });
  vi.spyOn(api, "deleteDocument").mockImplementation(async (_projectId, documentId) => {
    if (deleteTargetId === documentId && deleteMode === "error") {
      throw new Error(deleteMessage);
    }
    if (deleteTargetId === documentId && deleteMode === "not-found") {
      documents = documents.filter((item) => item.id !== documentId);
      throw new ApiError(deleteMessage, 404);
    }
    documents = documents.filter((item) => item.id !== documentId);
  });

  return {
    setGetDocumentImplementation(
      implementation: (projectId: string, documentId: string) => Promise<DocumentRecord>,
    ) {
      getDocumentMock.mockImplementation(implementation);
    },
    setDeleteBehavior(mode: "success" | "not-found" | "error", targetId: string, message = "Document not found") {
      deleteMode = mode;
      deleteTargetId = targetId;
      deleteMessage = message;
    },
  };
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

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={["/projects/project-1"]}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectShell user={user} onLogout={vi.fn()} />} />
      </Routes>
    </MemoryRouter>,
  );
}

function getDocumentRow(documentName: string) {
  const label = screen.getByText(documentName);
  const row = label.closest('[role="button"]');
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Unable to find row for document: ${documentName}`);
  }
  return row;
}

async function revealDeleteButton(userEventSetup: ReturnType<typeof userEvent.setup>, documentName: string) {
  const row = getDocumentRow(documentName);
  await userEventSetup.hover(row);
  const button = await within(row).findByRole("button", { name: `Delete document ${documentName}` });
  expect(button).toHaveStyle({ visibility: "visible" });
  return { row, button };
}

describe("ProjectShell document deletion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the delete button only on hover for non-selected rows and always for the selected row", async () => {
    const userEventSetup = userEvent.setup();
    setupDocumentApis([
      createDocument({ id: "doc-1", document_name: "Doc 1" }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
    ]);

    renderWorkspace();

    await screen.findByText("2 pending / 2 docs");

    expect(within(getDocumentRow("Doc 1")).getByRole("button", { name: "Delete document Doc 1" })).toBeInTheDocument();
    expect(within(getDocumentRow("Doc 2")).queryByRole("button", { name: "Delete document Doc 2" })).not.toBeInTheDocument();

    const { button } = await revealDeleteButton(userEventSetup, "Doc 2");
    expect(button).toBeInTheDocument();

    await userEventSetup.unhover(getDocumentRow("Doc 2"));
    await waitFor(() => {
      expect(within(getDocumentRow("Doc 2")).queryByRole("button", { name: "Delete document Doc 2" })).not.toBeInTheDocument();
    });
  });

  it("shows the delete button when a non-selected row receives keyboard focus", async () => {
    setupDocumentApis([
      createDocument({ id: "doc-1", document_name: "Doc 1" }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
    ]);

    renderWorkspace();

    await screen.findByText("2 pending / 2 docs");

    const doc2Row = getDocumentRow("Doc 2");
    doc2Row.focus();

    await waitFor(() => {
      expect(within(doc2Row).getByRole("button", { name: "Delete document Doc 2" })).toBeInTheDocument();
    });
  });

  it("keeps the newly selected row highlighted while its document is loading for the first time", async () => {
    const userEventSetup = userEvent.setup();
    const apiState = setupDocumentApis([
      createDocument({ id: "doc-1", document_name: "Doc 1" }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
    ]);
    const deferredDoc2 = createDeferred<DocumentRecord>();

    apiState.setGetDocumentImplementation(async (_projectId, documentId) => {
      if (documentId === "doc-2") {
        return deferredDoc2.promise;
      }
      return createDocument({ id: "doc-1", document_name: "Doc 1" });
    });

    renderWorkspace();

    await screen.findByText("2 pending / 2 docs");
    const doc1Row = getDocumentRow("Doc 1");
    const doc2Row = getDocumentRow("Doc 2");

    await userEventSetup.click(doc2Row);

    expect(doc2Row).toHaveClass("Mui-selected");
    expect(doc1Row).not.toHaveClass("Mui-selected");
    expect(screen.getByText("Document を読み込み中")).toBeInTheDocument();

    deferredDoc2.resolve(
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Document を読み込み中")).not.toBeInTheDocument();
    });
    expect(getDocumentRow("Doc 2")).toHaveClass("Mui-selected");
  });

  it("does not change the current selection when deleting from a non-selected row", async () => {
    const userEventSetup = userEvent.setup();
    setupDocumentApis([
      createDocument({ id: "doc-1", document_name: "Doc 1" }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
    ]);

    renderWorkspace();

    await screen.findByText("2 pending / 2 docs");

    const doc1Row = getDocumentRow("Doc 1");
    const doc2Row = getDocumentRow("Doc 2");

    expect(doc1Row).toHaveClass("Mui-selected");
    expect(doc2Row).not.toHaveClass("Mui-selected");

    const { button } = await revealDeleteButton(userEventSetup, "Doc 2");
    await userEventSetup.click(button);

    expect(await screen.findByText('"Doc 2" を削除する。')).toBeInTheDocument();
    expect(screen.getByText('"Doc 2" を削除する。')).toBeInTheDocument();
    expect(getDocumentRow("Doc 1")).toHaveClass("Mui-selected");
  });

  it("keeps the current document selected when a different document is deleted", async () => {
    const userEventSetup = userEvent.setup();
    setupDocumentApis([
      createDocument({ id: "doc-1", document_name: "Doc 1" }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
      createDocument({ id: "doc-3", document_name: "Doc 3", created_at: "2026-03-03T00:00:00Z", updated_at: "2026-03-03T00:00:00Z" }),
    ]);

    renderWorkspace();

    await screen.findByText("3 pending / 3 docs");

    const { button } = await revealDeleteButton(userEventSetup, "Doc 2");
    await userEventSetup.click(button);
    await userEventSetup.click(screen.getByRole("button", { name: "削除 ↵" }));

    await waitFor(() => {
      expect(screen.queryByText("Doc 2")).not.toBeInTheDocument();
    });
    expect(getDocumentRow("Doc 1")).toHaveClass("Mui-selected");
    expect(await screen.findByText("2 pending / 2 docs")).toBeInTheDocument();
  });

  it("moves to the next visible document when deleting the current document", async () => {
    const userEventSetup = userEvent.setup();
    setupDocumentApis([
      createDocument({ id: "doc-1", document_name: "Doc 1" }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
      createDocument({ id: "doc-3", document_name: "Doc 3", created_at: "2026-03-03T00:00:00Z", updated_at: "2026-03-03T00:00:00Z" }),
    ]);

    renderWorkspace();

    await screen.findByText("3 pending / 3 docs");

    await userEventSetup.click(within(getDocumentRow("Doc 1")).getByRole("button", { name: "Delete document Doc 1" }));
    await userEventSetup.click(screen.getByRole("button", { name: "削除 ↵" }));

    await waitFor(() => {
      expect(screen.queryByText("Doc 1")).not.toBeInTheDocument();
    });
    expect(getDocumentRow("Doc 2")).toHaveClass("Mui-selected");
  });

  it("confirms document deletion with Enter from the dialog", async () => {
    const userEventSetup = userEvent.setup();
    setupDocumentApis([
      createDocument({ id: "doc-1", document_name: "Doc 1" }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
    ]);

    renderWorkspace();

    await screen.findByText("2 pending / 2 docs");

    await userEventSetup.click(within(getDocumentRow("Doc 1")).getByRole("button", { name: "Delete document Doc 1" }));
    const deleteButton = await screen.findByRole("button", { name: "削除 ↵" });
    await waitFor(() => {
      expect(deleteButton).toHaveFocus();
    });

    await userEventSetup.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.queryByText("Doc 1")).not.toBeInTheDocument();
    });
    expect(getDocumentRow("Doc 2")).toHaveClass("Mui-selected");
  });

  it("moves to the previous visible document when deleting the last visible document", async () => {
    const userEventSetup = userEvent.setup();
    setupDocumentApis([
      createDocument({ id: "doc-1", document_name: "Doc 1" }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
    ]);

    renderWorkspace();

    await screen.findByText("2 pending / 2 docs");
    await userEventSetup.click(getDocumentRow("Doc 2"));

    await waitFor(() => {
      expect(getDocumentRow("Doc 2")).toHaveClass("Mui-selected");
    });

    await userEventSetup.click(within(getDocumentRow("Doc 2")).getByRole("button", { name: "Delete document Doc 2" }));
    await userEventSetup.click(screen.getByRole("button", { name: "削除 ↵" }));

    await waitFor(() => {
      expect(screen.queryByText("Doc 2")).not.toBeInTheDocument();
    });
    expect(getDocumentRow("Doc 1")).toHaveClass("Mui-selected");
  });

  it("shows the empty state after deleting the last document", async () => {
    const userEventSetup = userEvent.setup();
    setupDocumentApis([createDocument({ id: "doc-1", document_name: "Doc 1" })]);

    renderWorkspace();

    await screen.findByText("1 pending / 1 docs");

    await userEventSetup.click(within(getDocumentRow("Doc 1")).getByRole("button", { name: "Delete document Doc 1" }));
    await userEventSetup.click(screen.getByRole("button", { name: "削除 ↵" }));

    expect(await screen.findByText("一致する Document がない")).toBeInTheDocument();
    expect(screen.getByText("Document がない")).toBeInTheDocument();
  });

  it("shows the unsaved warning when deleting the dirty current document", async () => {
    const userEventSetup = userEvent.setup();
    const annotation = createAnnotation();
    setupDocumentApis([
      createDocument({
        id: "doc-1",
        document_name: "Doc 1",
        annotations: [annotation],
      }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
    ]);

    renderWorkspace();

    await screen.findByText("2 pending / 2 docs");
    await userEventSetup.click(screen.getByRole("tab", { name: "注釈一覧" }));
    await userEventSetup.click(screen.getByText("0-5"));
    await userEventSetup.click(screen.getByText("選択中 Annotation"));
    await userEventSetup.type(await screen.findByLabelText("Comment"), "dirty");

    await userEventSetup.click(within(getDocumentRow("Doc 1")).getByRole("button", { name: "Delete document Doc 1" }));

    expect(await screen.findByText("未保存の変更も破棄される。")).toBeInTheDocument();
  });

  it("treats not-found deletion as already deleted and recovers the UI", async () => {
    const userEventSetup = userEvent.setup();
    const apiState = setupDocumentApis([
      createDocument({ id: "doc-1", document_name: "Doc 1" }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
    ]);
    apiState.setDeleteBehavior("not-found", "doc-1");

    renderWorkspace();

    await screen.findByText("2 pending / 2 docs");

    await userEventSetup.click(within(getDocumentRow("Doc 1")).getByRole("button", { name: "Delete document Doc 1" }));
    await userEventSetup.click(screen.getByRole("button", { name: "削除 ↵" }));

    await waitFor(() => {
      expect(screen.queryByText("Doc 1")).not.toBeInTheDocument();
    });
    expect(getDocumentRow("Doc 2")).toHaveClass("Mui-selected");
    expect(await screen.findByText("Document は既に削除されている")).toBeInTheDocument();
  });

  it("keeps the dialog open and preserves state when deletion fails", async () => {
    const userEventSetup = userEvent.setup();
    const apiState = setupDocumentApis([
      createDocument({ id: "doc-1", document_name: "Doc 1" }),
      createDocument({ id: "doc-2", document_name: "Doc 2", created_at: "2026-03-02T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" }),
    ]);
    apiState.setDeleteBehavior("error", "doc-2", "Network broken");

    renderWorkspace();

    await screen.findByText("2 pending / 2 docs");

    const { button } = await revealDeleteButton(userEventSetup, "Doc 2");
    await userEventSetup.click(button);
    await userEventSetup.click(screen.getByRole("button", { name: "削除 ↵" }));

    expect(await screen.findByText('"Doc 2" を削除する。')).toBeInTheDocument();
    expect(screen.getByText("Network broken")).toBeInTheDocument();
    expect(screen.getByText("Doc 2")).toBeInTheDocument();
    expect(getDocumentRow("Doc 1")).toHaveClass("Mui-selected");
  });
});
