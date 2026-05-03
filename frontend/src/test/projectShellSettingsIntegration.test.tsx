import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setupUserEvent } from "./userEvent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectShell } from "../App";
import { api } from "../api";
import type { LabelDraft } from "../features/project-shell/projectShellTypes";
import type { LabelRecord, ProjectRecord, UserRecord } from "../api-contract";

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

vi.mock("../features/project-shell/WorkspaceView", () => ({
  WorkspaceView: () => <div>Workspace View Mock</div>,
}));

vi.mock("../features/project-shell/SettingsView", () => ({
  SettingsView: ({
    bundle,
    labelDraft,
    selectedLabelId,
    importFeedback,
    onLabelDraftChange,
    onSubmitLabelDraft,
    onSelectLabel,
    onImportFileChange,
    onImport,
    onRequestDeleteProject,
  }: {
    bundle: { project: ProjectRecord; labels: LabelRecord[] };
    labelDraft: LabelDraft;
    selectedLabelId: string | null;
    importFeedback: { message: string } | null;
    onLabelDraftChange: (draft: LabelDraft) => void;
    onSubmitLabelDraft: () => void;
    onSelectLabel: (labelId: string) => void;
    onImportFileChange: (file: File | null) => void;
    onImport: () => void;
    onRequestDeleteProject: () => void;
  }) => (
    <div>
      <h1>Project Settings</h1>
      {bundle.labels.map((label) => (
        <button
          key={label.id}
          type="button"
          className={selectedLabelId === label.id ? "Mui-selected" : ""}
          onClick={() => onSelectLabel(label.id)}
        >
          {label.name}
        </button>
      ))}
      <label>
        Name
        <input value={labelDraft.name} onChange={(event) => onLabelDraftChange({ ...labelDraft, name: event.target.value })} />
      </label>
      <button type="button" onClick={onSubmitLabelDraft}>
        {selectedLabelId ? "Update label" : "Add label"}
      </button>
      <input
        aria-label="Import file"
        type="file"
        onChange={(event) => onImportFileChange(event.target.files?.[0] ?? null)}
      />
      <button type="button" onClick={onImport}>
        Import
      </button>
      {importFeedback ? <div>{importFeedback.message}</div> : null}
      <button type="button" onClick={onRequestDeleteProject}>
        Project を削除
      </button>
    </div>
  ),
}));

const project: ProjectRecord = {
  id: "project-1",
  name: "Medical NER",
  description: "desc",
  meta: {},
  created_at: "2026-03-01T00:00:00Z",
};

const baseLabels: LabelRecord[] = [
  {
    id: "label-1",
    project_id: "project-1",
    project_name: "Medical NER",
    name: "主訴",
    color: "#e74c3c",
    description: "",
    shortcut: "1",
    meta: {},
  },
  {
    id: "label-2",
    project_id: "project-1",
    project_name: "Medical NER",
    name: "病名",
    color: "#2980b9",
    description: "診断された疾患名",
    shortcut: "2",
    meta: {},
  },
  {
    id: "label-3",
    project_id: "project-1",
    project_name: "Medical NER",
    name: "患者メタデータ",
    color: "#27ae60",
    description: "年齢・性別・既往歴などの患者属性",
    shortcut: "3",
    meta: {},
  },
];

const user: UserRecord = {
  id: "user-1",
  username: "demo_login_user",
  meta: {},
};

function mockProjectApis() {
  vi.spyOn(api, "listLabels").mockResolvedValue({ labels: structuredClone(baseLabels), revision: "labels-revision-1" });
  vi.spyOn(api, "getProject").mockResolvedValue(project);
  vi.spyOn(api, "listDocuments").mockResolvedValue({
    documents: [],
    total: 0,
    pending_total: 0,
    offset: 0,
    limit: 40,
    search: "",
    sort: "created",
  });
}

function createImportFile(payload: unknown) {
  return new File([JSON.stringify(payload)], "import.json", { type: "application/json" });
}

function createImportPayload(labelName: string) {
  return {
    project: { name: "Imported Project" },
    labels: [{ name: labelName, color: "#ff0000", description: "imported label" }],
    documents: [
      {
        document_name: "Imported Doc",
        text: "text",
        status: "pending",
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-02T00:00:00Z",
        annotations: [],
      },
    ],
  };
}

function ProjectsRouteWithBackButton() {
  const navigate = useNavigate();
  return (
    <>
      <div>Projects Route</div>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  );
}

function renderProjectSettings() {
  return render(
    <MemoryRouter initialEntries={["/projects/project-1/settings"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsRouteWithBackButton />} />
        <Route path="/projects/:projectId/settings" element={<ProjectShell user={user} onLogout={vi.fn()} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProjectShell settings import and deletion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockProjectApis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses persisted labels instead of unsaved newly added labels for import validation", async () => {
    const userEventSetup = setupUserEvent();
    const importProjectMock = vi.spyOn(api, "importProject").mockResolvedValue({
      imported: { labels: 1, documents: 1, annotations: 0 },
      errors: [],
    });

    renderProjectSettings();

    await screen.findByRole("heading", { name: "Project Settings" });

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "既往歴" } });
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    await userEventSetup.upload(screen.getByLabelText("Import file"), createImportFile(createImportPayload("既往歴")));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(importProjectMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("既存 label と重複している: 既往歴")).not.toBeInTheDocument();
  });

  it("detects persisted label conflicts even after an unsaved rename", async () => {
    const userEventSetup = setupUserEvent();
    const importProjectMock = vi.spyOn(api, "importProject").mockResolvedValue({
      imported: { labels: 1, documents: 1, annotations: 0 },
      errors: [],
    });

    renderProjectSettings();

    await screen.findByRole("heading", { name: "Project Settings" });

    fireEvent.click(screen.getByRole("button", { name: "病名" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "病名更新" } });
    fireEvent.click(screen.getByRole("button", { name: "Update label" }));
    await userEventSetup.upload(screen.getByLabelText("Import file"), createImportFile(createImportPayload("病名")));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("既存 label と重複している: 病名")).toBeInTheDocument();
    expect(importProjectMock).not.toHaveBeenCalled();
  });

  it("deletes the project from the danger zone and navigates back to projects", async () => {
    vi.spyOn(api, "deleteProject").mockResolvedValue(undefined);

    renderProjectSettings();

    await screen.findByRole("heading", { name: "Project Settings" });
    fireEvent.click(screen.getByRole("button", { name: "Project を削除" }));

    expect(await screen.findByText('"Medical NER" を削除する。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await screen.findByText("Projects Route");
    expect(api.deleteProject).toHaveBeenCalledWith("project-1");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Projects Route")).toBeInTheDocument();
  });
});
