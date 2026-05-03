import { useRef, useState } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { setupUserEvent } from "./userEvent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectShell } from "../App";
import { api } from "../api";
import type { LabelRecord, ProjectRecord, UserRecord } from "../api-contract";
import { I18nProvider } from "../i18n/I18nProvider";
import type { LabelDraft } from "../features/project-shell/projectShellTypes";
import { SettingsView } from "../features/project-shell/SettingsView";
import {
  createEmptyLabelDraft,
  findConflictingLabelName,
  isHexColor,
  normalizeHexColor,
  toLabelDraft,
} from "../features/project-shell/projectShellUtils";
import { DEFAULT_LABEL_COLOR } from "../features/project-shell/projectShellConstants";
import type { ProjectBundle } from "../types";
import { makeLocalId, setProjectGuideline } from "../utils";

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

function createBundle(labels = structuredClone(baseLabels)): ProjectBundle {
  return {
    project: structuredClone(project),
    labels,
    documents: [],
  };
}

function getLabelRow(name: string) {
  const row = screen
    .getAllByText(name)
    .map((labelText) => labelText.closest('[role="button"]'))
    .find((candidate): candidate is HTMLElement => candidate instanceof HTMLElement);
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Unable to find row for label: ${name}`);
  }
  return row;
}

function mockLabelRowRect(name: string, top: number, height: number) {
  vi.spyOn(getLabelRow(name), "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + height,
    left: 0,
    right: 320,
    width: 320,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
}

function renderProjectSettings(locale: "ja" | "en" | "zh-CN" = "ja") {
  vi.spyOn(api, "getProject").mockResolvedValue(project);
  vi.spyOn(api, "listLabels").mockResolvedValue({ labels: structuredClone(baseLabels), revision: "labels-revision-1" });
  vi.spyOn(api, "listDocuments").mockResolvedValue({
    documents: [],
    total: 0,
    pending_total: 0,
    offset: 0,
    limit: 40,
    search: "",
    sort: "created",
  });

  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={["/projects/project-1/settings"]}>
        <Routes>
          <Route path="/projects/:projectId/settings" element={<ProjectShell user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function renderSettingsView(locale: "ja" | "en" | "zh-CN" = "ja") {
  const saveProjectLabelsSpy = vi.spyOn(api, "saveProjectLabels").mockResolvedValue({
    labels: structuredClone(baseLabels),
    revision: "labels-revision-2",
  });

  function Harness() {
    const [bundle, setBundle] = useState<ProjectBundle>(() => createBundle());
    const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
    const [labelDraft, setLabelDraft] = useState<LabelDraft>(() => createEmptyLabelDraft());
    const [dirty, setDirty] = useState(false);
    const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
    const colorInputRef = useRef<HTMLInputElement | null>(null);
    const normalizedLabelColor = normalizeHexColor(labelDraft.color);
    const labelColorValid = isHexColor(labelDraft.color);
    const labelColorPreview = labelColorValid ? normalizedLabelColor : DEFAULT_LABEL_COLOR;

    function updateBundle(updater: (draft: ProjectBundle) => void) {
      setBundle((current) => {
        const next = structuredClone(current);
        updater(next);
        return next;
      });
      setDirty(true);
    }

    function handleSubmitLabelDraft() {
      if (!labelDraft.name.trim() || !labelColorValid) {
        return;
      }
      if (findConflictingLabelName(bundle.labels, labelDraft)) {
        setDuplicateMessage("同名 label は保存できない");
        return;
      }
      const editingLabel = bundle.labels.find((label) => label.id === labelDraft.id);
      const nextLabel: LabelRecord = {
        id: labelDraft.id || makeLocalId("label"),
        project_id: bundle.project.id,
        project_name: bundle.project.name,
        name: labelDraft.name.trim(),
        color: normalizedLabelColor,
        description: labelDraft.description,
        shortcut: editingLabel?.shortcut ?? null,
        meta: {},
      };
      updateBundle((draft) => {
        const index = draft.labels.findIndex((label) => label.id === nextLabel.id);
        if (index >= 0) {
          draft.labels[index] = nextLabel;
          return;
        }
        draft.labels.push(nextLabel);
      });
      setSelectedLabelId(nextLabel.id);
      setLabelDraft(toLabelDraft(nextLabel));
      setDuplicateMessage(null);
    }

    function handleDeleteLabel(labelId: string) {
      updateBundle((draft) => {
        draft.labels = draft.labels.filter((label) => label.id !== labelId);
      });
      if (selectedLabelId === labelId) {
        setSelectedLabelId(null);
        setLabelDraft(createEmptyLabelDraft());
      }
    }

    return (
      <I18nProvider initialLocale={locale}>
        {duplicateMessage ? <div>{duplicateMessage}</div> : null}
        <SettingsView
          bundle={bundle}
          selectedLabelId={selectedLabelId}
          labelDraft={labelDraft}
          normalizedLabelColor={normalizedLabelColor}
          labelColorValid={labelColorValid}
          labelColorPreview={labelColorPreview}
          labelColorInputRef={colorInputRef}
          settingsImportFile={null}
          exportPending
          exportVerified
          dirty={dirty}
          saving={false}
          importing={false}
          importFeedback={null}
          onProjectNameChange={(value) => updateBundle((draft) => { draft.project.name = value; })}
          onProjectDescriptionChange={(value) => updateBundle((draft) => { draft.project.description = value; })}
          onProjectGuidelineChange={(value) => updateBundle((draft) => { draft.project = setProjectGuideline(draft.project, value); })}
          onLabelDraftChange={setLabelDraft}
          onNormalizeLabelColor={() => setLabelDraft((current) => ({ ...current, color: normalizeHexColor(current.color) }))}
          onOpenColorPicker={() => colorInputRef.current?.click()}
          onPickLabelColor={(value) => setLabelDraft((current) => ({ ...current, color: value }))}
          onSubmitLabelDraft={handleSubmitLabelDraft}
          onResetLabelDraft={() => {
            setSelectedLabelId(null);
            setLabelDraft(createEmptyLabelDraft());
            setDuplicateMessage(null);
          }}
          onSelectLabel={(labelId) => {
            const label = bundle.labels.find((item) => item.id === labelId);
            if (label) {
              setSelectedLabelId(labelId);
              setLabelDraft(toLabelDraft(label));
            }
          }}
          onReorderLabel={(labelId, targetIndex) => {
            updateBundle((draft) => {
              const index = draft.labels.findIndex((label) => label.id === labelId);
              if (index < 0) {
                return;
              }
              const [label] = draft.labels.splice(index, 1);
              draft.labels.splice(targetIndex, 0, label);
            });
          }}
          onDeleteLabel={handleDeleteLabel}
          onImportFileChange={vi.fn()}
          onImport={vi.fn()}
          onExportPendingChange={vi.fn()}
          onExportVerifiedChange={vi.fn()}
          onExport={vi.fn()}
          onSave={() => {
            void api.saveProjectLabels(
              bundle.project.id,
              bundle.labels.map((label) => ({
                id: label.id.startsWith("local-") ? null : label.id,
                name: label.name,
                color: label.color,
                description: label.description,
                shortcut: label.shortcut ?? null,
                meta: label.meta ?? {},
              })),
              "labels-revision-1",
            );
            setDirty(false);
          }}
          onRequestDeleteProject={vi.fn()}
          deletingProject={false}
        />
      </I18nProvider>
    );
  }

  const view = render(<Harness />);
  return { ...view, saveProjectLabelsSpy };
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

describe("ProjectShell settings label selection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with no selected label and lets the user select and clear labels", async () => {
    const userEventSetup = setupUserEvent();
    renderSettingsView();

    const nameInput = screen.getByLabelText("Name");
    const diagnosisRow = getLabelRow("病名");
    const patientRow = getLabelRow("患者メタデータ");

    expect(nameInput).toHaveValue("");
    expect(diagnosisRow).not.toHaveClass("Mui-selected");
    expect(patientRow).not.toHaveClass("Mui-selected");
    expect(screen.getByRole("button", { name: "Add label" })).toBeInTheDocument();

    await userEventSetup.click(diagnosisRow);

    expect(nameInput).toHaveValue("病名");
    expect(diagnosisRow).toHaveClass("Mui-selected");
    expect(patientRow).not.toHaveClass("Mui-selected");
    expect(screen.getByRole("button", { name: "Update label" })).toBeInTheDocument();

    await userEventSetup.click(patientRow);

    expect(nameInput).toHaveValue("患者メタデータ");
    expect(diagnosisRow).not.toHaveClass("Mui-selected");
    expect(patientRow).toHaveClass("Mui-selected");

    await userEventSetup.click(screen.getByRole("button", { name: "Clear" }));

    expect(nameInput).toHaveValue("");
    expect(diagnosisRow).not.toHaveClass("Mui-selected");
    expect(patientRow).not.toHaveClass("Mui-selected");
    expect(screen.getByRole("button", { name: "Add label" })).toBeInTheDocument();
  });

  it("shows the import guide link in project settings", () => {
    renderSettingsView();

    expect(screen.getByRole("link", { name: "手順書" }).getAttribute("href")).toBeTruthy();
  });

  it("uses the zh-CN import guide link in project settings", () => {
    renderSettingsView("zh-CN");

    expect(screen.getByRole("link", { name: "指南" })).toHaveAttribute(
      "href",
      "https://github.com/masakiaota/Layered-Span-Studio/blob/main/docs/import-your-data-zh-CN.md",
    );
  });

  it("keeps the edited or added label selected in the form", async () => {
    const userEventSetup = setupUserEvent();
    renderSettingsView();

    const nameInput = screen.getByLabelText("Name");
    const descriptionInputs = screen.getAllByLabelText("Description");
    const labelDescriptionInput = descriptionInputs[1];

    await userEventSetup.click(getLabelRow("病名"));
    await userEventSetup.clear(nameInput);
    fireEvent.change(nameInput, { target: { value: "病名更新" } });
    await userEventSetup.click(screen.getByRole("button", { name: "Update label" }));

    const updatedRow = getLabelRow("病名更新");
    expect(updatedRow).toHaveClass("Mui-selected");
    expect(nameInput).toHaveValue("病名更新");
    expect(screen.getByRole("button", { name: "Update label" })).toBeInTheDocument();

    await userEventSetup.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.change(nameInput, { target: { value: "既往歴" } });
    await userEventSetup.clear(labelDescriptionInput);
    fireEvent.change(labelDescriptionInput, { target: { value: "過去の病歴" } });
    await userEventSetup.click(screen.getByRole("button", { name: "Add label" }));

    const addedRow = getLabelRow("既往歴");
    expect(addedRow).toHaveClass("Mui-selected");
    expect(nameInput).toHaveValue("既往歴");
    expect(labelDescriptionInput).toHaveValue("過去の病歴");
    expect(screen.getByRole("button", { name: "Update label" })).toBeInTheDocument();
  });

  it("clears only when the selected label is deleted", async () => {
    const userEventSetup = setupUserEvent();
    renderSettingsView();

    const nameInput = screen.getByLabelText("Name");
    await userEventSetup.click(getLabelRow("患者メタデータ"));

    await userEventSetup.click(within(getLabelRow("病名")).getByRole("button", { name: "病名 を削除" }));

    expect(screen.queryByText("病名")).not.toBeInTheDocument();
    expect(nameInput).toHaveValue("患者メタデータ");
    expect(getLabelRow("患者メタデータ")).toHaveClass("Mui-selected");

    await userEventSetup.click(within(getLabelRow("患者メタデータ")).getByRole("button", { name: "患者メタデータ を削除" }));

    await waitFor(() => {
      expect(screen.queryByText("患者メタデータ")).not.toBeInTheDocument();
    });
    expect(nameInput).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add label" })).toBeInTheDocument();
    expect(getLabelRow("主訴")).not.toHaveClass("Mui-selected");
  });

  it("prevents renaming a label to another existing label name", async () => {
    const userEventSetup = setupUserEvent();
    renderSettingsView();

    const nameInput = screen.getByLabelText("Name");
    await userEventSetup.click(getLabelRow("病名"));
    await userEventSetup.clear(nameInput);
    fireEvent.change(nameInput, { target: { value: "主訴" } });
    await userEventSetup.click(screen.getByRole("button", { name: "Update label" }));

    expect(await screen.findByText("同名 label は保存できない")).toBeInTheDocument();
    expect(screen.getAllByText("主訴")).toHaveLength(1);
    expect(screen.getByText("病名")).toBeInTheDocument();
    expect(getLabelRow("病名")).toHaveClass("Mui-selected");
  });

  it("reorders labels with the vertical drag handle and saves the reordered payload", async () => {
    const userEventSetup = setupUserEvent();
    const { saveProjectLabelsSpy } = renderSettingsView();

    mockLabelRowRect("主訴", 0, 48);
    mockLabelRowRect("病名", 48, 48);
    mockLabelRowRect("患者メタデータ", 96, 48);

    const handle = screen.getByRole("button", { name: "病名 の表示順をドラッグで変更" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 72 });
    fireEvent.pointerMove(document, { pointerId: 1, clientY: 10 });
    fireEvent(handle, new Event("lostpointercapture"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
    });
    await userEventSetup.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(saveProjectLabelsSpy).toHaveBeenCalledTimes(1);
    });
    expect(saveProjectLabelsSpy.mock.calls[0][1].map((label) => label.name)).toEqual([
      "病名",
      "主訴",
      "患者メタデータ",
    ]);
    expect(saveProjectLabelsSpy.mock.calls[0][2]).toBe("labels-revision-1");
  });

  it("moves a tall label to the bottom when its lower boundary crosses following labels", async () => {
    const userEventSetup = setupUserEvent();
    const { saveProjectLabelsSpy } = renderSettingsView();

    mockLabelRowRect("主訴", 0, 48);
    mockLabelRowRect("病名", 48, 240);
    mockLabelRowRect("患者メタデータ", 288, 48);

    const handle = screen.getByRole("button", { name: "病名 の表示順をドラッグで変更" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 72 });
    fireEvent.pointerMove(document, { pointerId: 1, clientY: 300 });
    fireEvent(handle, new Event("lostpointercapture"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
    });
    await userEventSetup.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(saveProjectLabelsSpy).toHaveBeenCalledTimes(1);
    });
    expect(saveProjectLabelsSpy.mock.calls[0][1].map((label) => label.name)).toEqual([
      "主訴",
      "患者メタデータ",
      "病名",
    ]);
  });
});

describe("ProjectShell settings import validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses persisted labels instead of unsaved newly added labels for import validation", async () => {
    const userEventSetup = setupUserEvent();
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
    const importProjectMock = vi.spyOn(api, "importProject").mockResolvedValue({
      imported: { labels: 1, documents: 1, annotations: 0 },
      errors: [],
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/settings"]}>
        <Routes>
          <Route path="/projects/:projectId/settings" element={<ProjectShell user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Project Settings" });

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "既往歴" } });
    await userEventSetup.click(screen.getByRole("button", { name: "Add label" }));

    const fileInput = document.querySelector('input[type="file"]');
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Import file input not found");
    }
    await userEventSetup.upload(fileInput, createImportFile(createImportPayload("既往歴")));
    await userEventSetup.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(importProjectMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("既存 label と重複している: 既往歴")).not.toBeInTheDocument();
  });

  it("detects persisted label conflicts even after an unsaved rename", async () => {
    const userEventSetup = setupUserEvent();
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
    const importProjectMock = vi.spyOn(api, "importProject").mockResolvedValue({
      imported: { labels: 1, documents: 1, annotations: 0 },
      errors: [],
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/settings"]}>
        <Routes>
          <Route path="/projects/:projectId/settings" element={<ProjectShell user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Project Settings" });

    await userEventSetup.click(getLabelRow("病名"));
    await userEventSetup.clear(screen.getByLabelText("Name"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "病名更新" } });
    await userEventSetup.click(screen.getByRole("button", { name: "Update label" }));

    const fileInput = document.querySelector('input[type="file"]');
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Import file input not found");
    }
    await userEventSetup.upload(fileInput, createImportFile(createImportPayload("病名")));
    await userEventSetup.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("既存 label と重複している: 病名")).toBeInTheDocument();
    expect(importProjectMock).not.toHaveBeenCalled();
  });

  it("deletes the project from the danger zone and navigates back to projects", async () => {
    const userEventSetup = setupUserEvent();
    vi.spyOn(api, "deleteProject").mockResolvedValue(undefined);
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

    render(
      <MemoryRouter initialEntries={["/projects/project-1/settings"]}>
        <Routes>
          <Route path="/projects" element={<ProjectsRouteWithBackButton />} />
          <Route path="/projects/:projectId/settings" element={<ProjectShell user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Project Settings" });
    await userEventSetup.click(screen.getByRole("button", { name: "Project を削除" }));

    expect(await screen.findByText('"Medical NER" を削除する。')).toBeInTheDocument();
    await userEventSetup.click(screen.getByRole("button", { name: "削除" }));

    await screen.findByText("Projects Route");
    expect(api.deleteProject).toHaveBeenCalledWith("project-1");
    await userEventSetup.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Projects Route")).toBeInTheDocument();
  });
});
