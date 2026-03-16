import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectShell } from "../App";
import { api } from "../api";
import type { ProjectRecord, LabelRecord, UserRecord } from "../types";

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

function renderProjectSettings() {
  vi.spyOn(api, "getProject").mockResolvedValue(project);
  vi.spyOn(api, "listLabels").mockResolvedValue({ labels: structuredClone(baseLabels) });
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
    <MemoryRouter initialEntries={["/projects/project-1/settings"]}>
      <Routes>
        <Route path="/projects/:projectId/settings" element={<ProjectShell user={user} onLogout={vi.fn()} />} />
      </Routes>
    </MemoryRouter>,
  );
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
    const userEventSetup = userEvent.setup();
    renderProjectSettings();

    await screen.findByRole("heading", { name: "Project Settings" });

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
  }, 15000);

  it("keeps the edited or added label selected in the form", async () => {
    const userEventSetup = userEvent.setup();
    renderProjectSettings();

    await screen.findByRole("heading", { name: "Project Settings" });

    const nameInput = screen.getByLabelText("Name");
    const descriptionInputs = screen.getAllByLabelText("Description");
    const labelDescriptionInput = descriptionInputs[1];

    await userEventSetup.click(getLabelRow("病名"));
    await userEventSetup.clear(nameInput);
    await userEventSetup.type(nameInput, "病名更新");
    await userEventSetup.click(screen.getByRole("button", { name: "Update label" }));

    const updatedRow = getLabelRow("病名更新");
    expect(updatedRow).toHaveClass("Mui-selected");
    expect(nameInput).toHaveValue("病名更新");
    expect(screen.getByRole("button", { name: "Update label" })).toBeInTheDocument();

    await userEventSetup.click(screen.getByRole("button", { name: "Clear" }));
    await userEventSetup.type(nameInput, "既往歴");
    await userEventSetup.clear(labelDescriptionInput);
    await userEventSetup.type(labelDescriptionInput, "過去の病歴");
    await userEventSetup.click(screen.getByRole("button", { name: "Add label" }));

    const addedRow = getLabelRow("既往歴");
    expect(addedRow).toHaveClass("Mui-selected");
    expect(nameInput).toHaveValue("既往歴");
    expect(labelDescriptionInput).toHaveValue("過去の病歴");
    expect(screen.getByRole("button", { name: "Update label" })).toBeInTheDocument();
  }, 15000);

  it("clears only when the selected label is deleted", async () => {
    const userEventSetup = userEvent.setup();
    renderProjectSettings();

    await screen.findByRole("heading", { name: "Project Settings" });

    const nameInput = screen.getByLabelText("Name");
    await userEventSetup.click(getLabelRow("患者メタデータ"));

    await userEventSetup.click(within(getLabelRow("病名")).getByRole("button"));

    expect(screen.queryByText("病名")).not.toBeInTheDocument();
    expect(nameInput).toHaveValue("患者メタデータ");
    expect(getLabelRow("患者メタデータ")).toHaveClass("Mui-selected");

    await userEventSetup.click(within(getLabelRow("患者メタデータ")).getByRole("button"));

    await waitFor(() => {
      expect(screen.queryByText("患者メタデータ")).not.toBeInTheDocument();
    });
    expect(nameInput).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add label" })).toBeInTheDocument();
    expect(getLabelRow("主訴")).not.toHaveClass("Mui-selected");
  });

  it("prevents renaming a label to another existing label name", async () => {
    const userEventSetup = userEvent.setup();
    renderProjectSettings();

    await screen.findByRole("heading", { name: "Project Settings" });

    const nameInput = screen.getByLabelText("Name");
    await userEventSetup.click(getLabelRow("病名"));
    await userEventSetup.clear(nameInput);
    await userEventSetup.type(nameInput, "主訴");
    await userEventSetup.click(screen.getByRole("button", { name: "Update label" }));

    expect(await screen.findByText("同名 label は保存できない")).toBeInTheDocument();
    expect(screen.getAllByText("主訴")).toHaveLength(1);
    expect(screen.getByText("病名")).toBeInTheDocument();
    expect(getLabelRow("病名")).toHaveClass("Mui-selected");
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
    const userEventSetup = userEvent.setup();
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: structuredClone(baseLabels) });
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

    await userEventSetup.type(screen.getByLabelText("Name"), "既往歴");
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
    const userEventSetup = userEvent.setup();
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: structuredClone(baseLabels) });
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
    await userEventSetup.type(screen.getByLabelText("Name"), "病名更新");
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
    const userEventSetup = userEvent.setup();
    vi.spyOn(api, "deleteProject").mockResolvedValue(undefined);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: structuredClone(baseLabels) });
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
