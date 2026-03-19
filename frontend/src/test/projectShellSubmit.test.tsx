import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectShell } from "../App";
import { api } from "../api";
import type { AnnotationRecord, DocumentRecord, LabelRecord, ProjectRecord, UserRecord } from "../types";

vi.mock("../features/project-shell/useProjectExamples", () => ({
  useProjectExamples: () => ({
    sameLabel: {
      items: [],
      total: 0,
      hasNextPage: false,
      isPending: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    },
    sameLabelDetails: {},
    sameSurface: {
      items: [],
      total: 0,
      hasNextPage: false,
      isPending: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    },
    sameSurfaceTargetLabelId: null,
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
const labelsRevision = "labels-revision-1";

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

function getDocumentRow(documentName: string) {
  const row = screen
    .getAllByText(documentName)
    .map((label) => label.closest('[role="button"]'))
    .find((candidate): candidate is HTMLElement => candidate instanceof HTMLElement);
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Unable to find row for document: ${documentName}`);
  }
  return row;
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

describe("ProjectShell submit behavior", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: structuredClone(labels), revision: labelsRevision });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits an empty pending document as verified and updates pending count", async () => {
    const userEventSetup = userEvent.setup();
    const pendingDocument = createDocument();
    const verifiedDocument = createDocument({ status: "verified", updated_at: "2026-03-02T00:00:00Z" });

    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: [pendingDocument],
        total: 1,
        pending_total: 1,
        offset: 0,
        limit: 40,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: [{ ...verifiedDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
        total: 1,
        pending_total: 0,
        offset: 0,
        limit: 40,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument").mockResolvedValue(pendingDocument);
    const saveDocumentBundleSpy = vi.spyOn(api, "saveDocumentBundle").mockResolvedValue(verifiedDocument);

    renderWorkspace();

    await screen.findByText("1 pending / 1 docs");
    await userEventSetup.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(saveDocumentBundleSpy).toHaveBeenCalledWith("project-1", "doc-1", [], true);
    });
    expect(await screen.findByText("0 pending / 1 docs")).toBeInTheDocument();
  });

  it("saves edited annotations without submit flag", async () => {
    const userEventSetup = userEvent.setup();
    const annotation = createAnnotation();
    const initialDocument = createDocument({ annotations: [annotation] });
    const savedDocument = createDocument({
      annotations: [{ ...annotation, comment: "updated comment" }],
      updated_at: "2026-03-02T00:00:00Z",
    });

    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: [{ ...initialDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
        total: 1,
        pending_total: 1,
        offset: 0,
        limit: 40,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: [{ ...savedDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
        total: 1,
        pending_total: 1,
        offset: 0,
        limit: 40,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument").mockResolvedValue(initialDocument);
    const saveDocumentBundleSpy = vi.spyOn(api, "saveDocumentBundle").mockResolvedValue(savedDocument);

    renderWorkspace();

    await screen.findByText("1 pending / 1 docs");
    await userEventSetup.click(screen.getByRole("tab", { name: "注釈一覧" }));
    await userEventSetup.click(screen.getByText("0-5"));
    await userEventSetup.click(screen.getByText("選択中 Annotation"));
    const commentInput = await screen.findByLabelText("Comment");
    await userEventSetup.type(commentInput, "updated comment");
    await userEventSetup.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveDocumentBundleSpy).toHaveBeenCalledWith(
        "project-1",
        "doc-1",
        [
          {
            id: "annotation-1",
            label_id: "label-1",
            start: 0,
            end: 5,
            span_text: "Hello",
            comment: "updated comment",
            status: "pending",
            meta: {},
          },
        ],
        false,
      );
    });
  }, 15000);

  it("shows verified doc as pending while unsaved and returns to verified after save", async () => {
    const userEventSetup = userEvent.setup();
    const annotation = createAnnotation({ status: "verified" });
    const initialDocument = createDocument({ status: "verified", annotations: [annotation] });
    const savedDocument = createDocument({
      status: "verified",
      annotations: [{ ...annotation, comment: "updated comment" }],
      updated_at: "2026-03-02T00:00:00Z",
    });

    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: [{ ...initialDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
        total: 1,
        pending_total: 0,
        offset: 0,
        limit: 40,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: [{ ...savedDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
        total: 1,
        pending_total: 0,
        offset: 0,
        limit: 40,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument").mockResolvedValue(initialDocument);
    const saveDocumentBundleSpy = vi.spyOn(api, "saveDocumentBundle").mockResolvedValue(savedDocument);

    renderWorkspace();

    await screen.findByText("0 pending / 1 docs");
    expect(within(getDocumentRow("Doc 1")).getByText("verified")).toBeInTheDocument();

    await userEventSetup.click(screen.getByRole("tab", { name: "注釈一覧" }));
    await userEventSetup.click(screen.getByText("0-5"));
    await userEventSetup.click(screen.getByText("選択中 Annotation"));
    const commentInput = await screen.findByLabelText("Comment");
    await userEventSetup.type(commentInput, "updated comment");

    await waitFor(() => {
      expect(within(getDocumentRow("Doc 1")).getByText("pending")).toBeInTheDocument();
      expect(screen.getByText("1 pending / 1 docs")).toBeInTheDocument();
    });

    await userEventSetup.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveDocumentBundleSpy).toHaveBeenCalledWith(
        "project-1",
        "doc-1",
        [
          {
            id: "annotation-1",
            label_id: "label-1",
            start: 0,
            end: 5,
            span_text: "Hello",
            comment: "updated comment",
            status: "verified",
            meta: {},
          },
        ],
        false,
      );
    });

    expect(await screen.findByText("0 pending / 1 docs")).toBeInTheDocument();
    expect(within(getDocumentRow("Doc 1")).getByText("verified")).toBeInTheDocument();
  });

  it("does not add a hidden dirty verified doc to the pending total", async () => {
    const userEventSetup = userEvent.setup();
    const annotation = createAnnotation({ status: "verified" });
    const initialDocument = createDocument({ status: "verified", annotations: [annotation] });

    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce({
        documents: [{ ...initialDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
        total: 1,
        pending_total: 0,
        offset: 0,
        limit: 40,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: [],
        total: 0,
        pending_total: 0,
        offset: 0,
        limit: 40,
        search: "z",
        sort: "created",
      });
    vi.spyOn(api, "getDocument").mockResolvedValue(initialDocument);

    renderWorkspace();

    await screen.findByText("0 pending / 1 docs");
    await userEventSetup.click(screen.getByRole("tab", { name: "注釈一覧" }));
    await userEventSetup.click(screen.getByText("0-5"));
    await userEventSetup.click(screen.getByText("選択中 Annotation"));
    const commentInput = await screen.findByLabelText("Comment");
    await userEventSetup.type(commentInput, "updated comment");

    await waitFor(() => {
      expect(screen.getByText("1 pending / 1 docs")).toBeInTheDocument();
    });

    await userEventSetup.type(screen.getByPlaceholderText("本文検索"), "z");

    await waitFor(() => {
      expect(screen.getByText("0 pending / 0 docs")).toBeInTheDocument();
      expect(screen.getByText("現在表示中の Document は検索結果外である。")).toBeInTheDocument();
    });
  });
});
