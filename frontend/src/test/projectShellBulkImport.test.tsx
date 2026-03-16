import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectShell } from "../App";
import { api } from "../api";
import type { DocumentRecord, LabelRecord, ProjectRecord, UserRecord } from "../types";

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
    name: "症状",
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
    text: "頭痛あり",
    status: "pending",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    annotations: [],
    meta: {},
    ...overrides,
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

describe("ProjectShell bulk annotation import", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: structuredClone(labels) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports annotations through the bulk endpoint for the selected document", async () => {
    const userEventSetup = userEvent.setup();
    const initialDocument = createDocument({ status: "verified" });
    const refreshedDocument = createDocument({
      status: "verified",
      annotations: [
        {
          id: "annotation-1",
          document_id: "doc-1",
          document_name: "Doc 1",
          label_id: "label-1",
          label_name: "症状",
          start: 0,
          end: 2,
          span_text: "頭痛",
          comment: "",
          status: "pending",
          meta: {},
        },
      ],
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
        documents: [{ ...refreshedDocument, status: "pending", annotations: undefined } as Omit<DocumentRecord, "annotations">],
        total: 1,
        pending_total: 1,
        offset: 0,
        limit: 40,
        search: "",
        sort: "created",
      });
    vi.spyOn(api, "getDocument")
      .mockResolvedValueOnce(initialDocument)
      .mockResolvedValueOnce(refreshedDocument);
    const bulkCreateSpy = vi.spyOn(api, "bulkCreateDocumentAnnotations").mockResolvedValue({
      created: refreshedDocument.annotations,
      errors: [],
    });

    renderWorkspace();

    await screen.findByText("0 pending / 1 docs");
    const bulkButton = screen.getByRole("button", { name: "Bulk JSON" });
    const fileInput = bulkButton.querySelector("input[type='file']");
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Bulk import file input not found");
    }

    await userEventSetup.upload(
      fileInput,
      new File(
        [
          JSON.stringify({
            annotations: [
              {
                label_name: "症状",
                start: 0,
                end: 2,
                span_text: "頭痛",
              },
            ],
          }),
        ],
        "bulk.json",
        { type: "application/json" },
      ),
    );

    await waitFor(() => {
      expect(bulkCreateSpy).toHaveBeenCalledWith("project-1", "doc-1", [
        {
          label_id: "label-1",
          start: 0,
          end: 2,
          span_text: "頭痛",
          comment: "",
          status: "pending",
          meta: {},
        },
      ]);
    });
    expect(await screen.findByText("Bulk import 完了: 1 件の annotation を追加した")).toBeInTheDocument();
    expect(await screen.findByText("1 pending / 1 docs")).toBeInTheDocument();
    expect(await screen.findByText("0-2")).toBeInTheDocument();
  });

  it("shows warning and evicts stale editor state when document refresh fails after successful bulk import", async () => {
    const userEventSetup = userEvent.setup();
    const initialDocument = createDocument();
    const refreshedDocument = createDocument({
      annotations: [
        {
          id: "annotation-1",
          document_id: "doc-1",
          document_name: "Doc 1",
          label_id: "label-1",
          label_name: "症状",
          start: 0,
          end: 2,
          span_text: "頭痛",
          comment: "",
          status: "pending",
          meta: {},
        },
      ],
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
        documents: [{ ...refreshedDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
        total: 1,
        pending_total: 1,
        offset: 0,
        limit: 40,
        search: "",
        sort: "created",
      });
    const getDocumentSpy = vi.spyOn(api, "getDocument")
      .mockResolvedValueOnce(initialDocument)
      .mockRejectedValueOnce(new Error("temporary network issue"))
      .mockResolvedValueOnce(refreshedDocument);
    vi.spyOn(api, "bulkCreateDocumentAnnotations").mockResolvedValue({
      created: refreshedDocument.annotations,
      errors: [],
    });

    renderWorkspace();

    await screen.findByText("1 pending / 1 docs");
    const bulkButton = screen.getByRole("button", { name: "Bulk JSON" });
    const fileInput = bulkButton.querySelector("input[type='file']");
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Bulk import file input not found");
    }

    await userEventSetup.upload(
      fileInput,
      new File(
        [
          JSON.stringify({
            annotations: [
              {
                label_name: "症状",
                start: 0,
                end: 2,
                span_text: "頭痛",
              },
            ],
          }),
        ],
        "bulk.json",
        { type: "application/json" },
      ),
    );

    expect(await screen.findByText("Bulk import は完了したが、最新状態の再取得に失敗した: temporary network issue")).toBeInTheDocument();
    await waitFor(() => {
      expect(getDocumentSpy).toHaveBeenCalledTimes(3);
    });
  });

  it("shows a warning when the bulk endpoint returns import errors", async () => {
    const userEventSetup = userEvent.setup();
    const initialDocument = createDocument();

    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [{ ...initialDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: 40,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "getDocument")
      .mockResolvedValueOnce(initialDocument)
      .mockResolvedValueOnce(initialDocument);
    vi.spyOn(api, "bulkCreateDocumentAnnotations").mockResolvedValue({
      created: [],
      errors: [{ detail: "annotations[0] failed" }],
    });

    renderWorkspace();

    await screen.findByText("1 pending / 1 docs");
    const bulkButton = screen.getByRole("button", { name: "Bulk JSON" });
    const fileInput = bulkButton.querySelector("input[type='file']");
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Bulk import file input not found");
    }

    await userEventSetup.upload(
      fileInput,
      new File(
        [
          JSON.stringify({
            annotations: [
              {
                label_name: "症状",
                start: 0,
                end: 2,
                span_text: "頭痛",
              },
            ],
          }),
        ],
        "bulk.json",
        { type: "application/json" },
      ),
    );

    expect(await screen.findByText("Bulk import は一部失敗した: 0 件追加 / 1 件失敗 / annotations[0] failed")).toBeInTheDocument();
    expect(screen.queryByText("0-2")).not.toBeInTheDocument();
  });
});
