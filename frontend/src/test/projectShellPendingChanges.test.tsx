import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectShell } from "../App";
import { api } from "../api";
import type { AnnotationRecord, DocumentRecord, LabelRecord, ProjectRecord, UserRecord } from "../api-contract";

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

async function dirtyWorkspaceDocument(userEventSetup: ReturnType<typeof userEvent.setup>, comment = "dirty comment") {
  await userEventSetup.click(screen.getByRole("tab", { name: "注釈一覧" }));
  await userEventSetup.click(screen.getByText("0-5"));
  await userEventSetup.click(screen.getByText("選択中 Annotation"));
  const commentInput = await screen.findByLabelText("Comment");
  fireEvent.change(commentInput, { target: { value: comment } });
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

function renderWorkspaceShell(onLogout = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={["/projects/project-1"]}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectShell user={user} onLogout={onLogout} />} />
        <Route path="/projects" element={<div>Projects Route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderSettingsShell(onLogout = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={["/projects/project-1/settings"]}>
      <Routes>
        <Route path="/projects/:projectId/settings" element={<ProjectShell user={user} onLogout={onLogout} />} />
        <Route path="/projects" element={<div>Projects Route</div>} />
        <Route path="/projects/:projectId" element={<div>Workspace Route</div>} />
        <Route path="/login" element={<div>Login Route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProjectShell pending changes navigation guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getProject").mockResolvedValue(project);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: structuredClone(labels), revision: labelsRevision });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a confirmation dialog and stays on the workspace when the user cancels leaving with unsaved changes", async () => {
    const userEventSetup = userEvent.setup();
    const annotation = createAnnotation();
    const initialDocument = createDocument({ annotations: [annotation] });

    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [{ ...initialDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: 40,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "getDocument").mockResolvedValue(initialDocument);

    renderWorkspaceShell();

    await screen.findByText("1 pending / 1 docs");
    await dirtyWorkspaceDocument(userEventSetup);

    await userEventSetup.click(screen.getByRole("button", { name: "Projects" }));

    expect(await screen.findByRole("dialog", { name: "未保存の変更がある" })).toBeInTheDocument();

    await userEventSetup.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "未保存の変更がある" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByText("Projects Route")).not.toBeInTheDocument();
  }, 15000);

  it("saves the dirty workspace document before navigating back to projects", async () => {
    const userEventSetup = userEvent.setup();
    const annotation = createAnnotation();
    const initialDocument = createDocument({ annotations: [annotation] });
    const savedDocument = createDocument({
      annotations: [{ ...annotation, comment: "dirty comment" }],
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

    renderWorkspaceShell();

    await screen.findByText("1 pending / 1 docs");
    await dirtyWorkspaceDocument(userEventSetup);
    await userEventSetup.click(screen.getByRole("button", { name: "Projects" }));
    await userEventSetup.click(screen.getByRole("button", { name: /保存して移動/ }));

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
            comment: "dirty comment",
            status: "pending",
            meta: {},
          },
        ],
        false,
      );
    });
    expect(await screen.findByText("Projects Route")).toBeInTheDocument();
  });

  it("discards a dirty workspace document before switching to another document", async () => {
    const userEventSetup = userEvent.setup();
    const annotation = createAnnotation();
    const firstDocument = createDocument({ annotations: [annotation] });
    const secondDocument = createDocument({
      id: "doc-2",
      document_name: "Doc 2",
      text: "Second document",
      created_at: "2026-03-02T00:00:00Z",
      updated_at: "2026-03-02T00:00:00Z",
    });

    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [
        { ...firstDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">,
        { ...secondDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">,
      ],
      total: 2,
      pending_total: 2,
      offset: 0,
      limit: 40,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "getDocument").mockImplementation(async (_projectId, documentId) => {
      if (documentId === "doc-2") {
        return secondDocument;
      }
      return firstDocument;
    });

    renderWorkspaceShell();

    await screen.findByText("2 pending / 2 docs");
    await dirtyWorkspaceDocument(userEventSetup);
    await userEventSetup.click(getDocumentRow("Doc 2"));

    expect(await screen.findByRole("dialog", { name: "未保存の変更がある" })).toBeInTheDocument();

    await userEventSetup.click(screen.getByRole("button", { name: "破棄して移動" }));

    await waitFor(() => {
      expect(getDocumentRow("Doc 2")).toHaveClass("Mui-selected");
      expect(screen.queryByRole("dialog", { name: "未保存の変更がある" })).not.toBeInTheDocument();
    });
  });

  it("keeps the confirmation dialog open when saving before navigation fails", async () => {
    const userEventSetup = userEvent.setup();
    const annotation = createAnnotation();
    const initialDocument = createDocument({ annotations: [annotation] });

    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [{ ...initialDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: 40,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "getDocument").mockResolvedValue(initialDocument);
    const saveDocumentBundleSpy = vi.spyOn(api, "saveDocumentBundle").mockRejectedValue(new Error("save failed"));

    renderWorkspaceShell();

    await screen.findByText("1 pending / 1 docs");
    await dirtyWorkspaceDocument(userEventSetup);
    await userEventSetup.click(screen.getByRole("button", { name: "Projects" }));
    await userEventSetup.click(screen.getByRole("button", { name: /保存して移動/ }));

    await waitFor(() => {
      expect(saveDocumentBundleSpy).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole("dialog", { name: "未保存の変更がある" })).toBeInTheDocument();
    expect(screen.getByText("save failed")).toBeInTheDocument();
    expect(screen.queryByText("Projects Route")).not.toBeInTheDocument();
  });

  it("prompts before logout when the workspace has unsaved changes", async () => {
    const userEventSetup = userEvent.setup();
    const annotation = createAnnotation();
    const initialDocument = createDocument({ annotations: [annotation] });
    const onLogout = vi.fn();

    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [{ ...initialDocument, annotations: undefined } as Omit<DocumentRecord, "annotations">],
      total: 1,
      pending_total: 1,
      offset: 0,
      limit: 40,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "getDocument").mockResolvedValue(initialDocument);

    renderWorkspaceShell(onLogout);

    await screen.findByText("1 pending / 1 docs");
    await dirtyWorkspaceDocument(userEventSetup);
    await userEventSetup.click(screen.getByRole("button", { name: "Logout" }));

    expect(await screen.findByRole("dialog", { name: "未保存の変更がある" })).toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();

    await userEventSetup.click(screen.getByRole("button", { name: "破棄して移動" }));

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });

  it("discards dirty settings and navigates back to projects without saving", async () => {
    const userEventSetup = userEvent.setup();

    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [],
      total: 0,
      pending_total: 0,
      offset: 0,
      limit: 40,
      search: "",
      sort: "created",
    });
    const saveProjectSettingsSpy = vi.spyOn(api, "saveProjectSettings").mockResolvedValue(project);
    const saveProjectLabelsSpy = vi
      .spyOn(api, "saveProjectLabels")
      .mockResolvedValue({ labels: structuredClone(labels), revision: labelsRevision });

    renderSettingsShell();

    await screen.findByRole("heading", { name: "Project Settings" });
    await userEventSetup.type(screen.getByLabelText("Project name"), " updated");
    await userEventSetup.click(screen.getByRole("button", { name: "Projects" }));
    await userEventSetup.click(screen.getByRole("button", { name: "破棄して移動" }));

    expect(await screen.findByText("Projects Route")).toBeInTheDocument();
    expect(saveProjectSettingsSpy).not.toHaveBeenCalled();
    expect(saveProjectLabelsSpy).not.toHaveBeenCalled();
  });

  it("saves settings before switching back to workspace", async () => {
    const userEventSetup = userEvent.setup();
    const updatedProject = { ...project, name: "Medical NER updated" };

    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [],
      total: 0,
      pending_total: 0,
      offset: 0,
      limit: 40,
      search: "",
      sort: "created",
    });
    const saveProjectSettingsSpy = vi.spyOn(api, "saveProjectSettings").mockResolvedValue(updatedProject);

    renderSettingsShell();

    await screen.findByRole("heading", { name: "Project Settings" });
    const projectNameInput = screen.getByLabelText("Project name");
    await userEventSetup.clear(projectNameInput);
    await userEventSetup.type(projectNameInput, updatedProject.name);
    await userEventSetup.click(screen.getByRole("tab", { name: "Workspace" }));
    await userEventSetup.click(screen.getByRole("button", { name: /保存して移動/ }));

    await waitFor(() => {
      expect(saveProjectSettingsSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "project-1", name: updatedProject.name }));
    });
    expect(await screen.findByText("Workspace Route")).toBeInTheDocument();
  });
});
