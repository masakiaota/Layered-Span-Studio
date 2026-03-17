import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ProjectsPage } from "../pages/ProjectsPage";
import type { ProjectImportResponse, ProjectListItemRecord, UserRecord } from "../types";

const user: UserRecord = {
  id: "user-1",
  username: "demo_login_user",
  meta: {},
};

const baseProjects: ProjectListItemRecord[] = [
  {
    id: "project-1",
    name: "Medical NER",
    description: "desc",
    meta: {},
    created_at: "2026-03-01T00:00:00Z",
    summary: {
      labels_count: 2,
      documents_count: 3,
      pending_documents_count: 1,
      updated_at: "2026-03-01T00:00:00Z",
    },
  },
];

function renderProjectsPage() {
  return render(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage user={user} onLogout={vi.fn()} />} />
        <Route path="/projects/:projectId" element={<div>Project Workspace Route</div>} />
        <Route path="/projects/:projectId/settings" element={<div>Project Settings Route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function createImportFile(payload: unknown) {
  return new File([JSON.stringify(payload)], "import.json", { type: "application/json" });
}

function createProject(overrides: Partial<ProjectListItemRecord>): ProjectListItemRecord {
  const summary = {
    labels_count: 0,
    documents_count: 0,
    pending_documents_count: 0,
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides.summary,
  };
  return {
    id: "project-default",
    name: "Project Default",
    description: "desc",
    meta: {},
    created_at: "2026-03-01T00:00:00Z",
    ...overrides,
    summary,
  };
}

function getRenderedProjectNames() {
  return screen.getAllByTestId("project-card-title").map((node) => node.textContent ?? "");
}

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a new project from the toolbar dialog and navigates to settings", async () => {
    const userEventSetup = userEvent.setup();
    vi.spyOn(api, "listProjects").mockResolvedValue({ projects: structuredClone(baseProjects) });
    const createProjectSpy = vi.spyOn(api, "createProject").mockResolvedValue({
      id: "project-2",
      name: "New Project",
      description: "fresh project",
      meta: {},
      created_at: "2026-03-10T00:00:00Z",
    });

    renderProjectsPage();

    await screen.findByText("Medical NER");
    await userEventSetup.click(screen.getByRole("button", { name: "New Project" }));

    await screen.findByRole("dialog", { name: "Create Project" });
    await userEventSetup.type(screen.getByLabelText("Project name"), "New Project");
    await userEventSetup.type(screen.getByLabelText("Description"), "fresh project");
    await userEventSetup.click(screen.getByRole("button", { name: "Create" }));

    await screen.findByText("Project Settings Route");
    expect(createProjectSpy).toHaveBeenCalledWith({
      name: "New Project",
      description: "fresh project",
      meta: {},
    });
  }, 15000);

  it("shows the create button in the empty state", async () => {
    vi.spyOn(api, "listProjects").mockResolvedValue({ projects: [] });

    renderProjectsPage();

    await screen.findByText("Project がまだない");
    expect(screen.getAllByRole("button", { name: "New Project" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Import Project" }).length).toBeGreaterThan(0);
  });

  it("disables the new project entry point while import is in flight", async () => {
    const userEventSetup = userEvent.setup();
    vi.spyOn(api, "listProjects").mockResolvedValue({ projects: structuredClone(baseProjects) });
    let resolveImport!: (value: ProjectImportResponse) => void;
    vi.spyOn(api, "importProjectAsNew").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        }),
    );

    renderProjectsPage();

    await screen.findByText("Medical NER");
    const fileInput = document.querySelector('input[type="file"]');
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Import file input not found");
    }

    await userEventSetup.upload(
      fileInput,
      createImportFile({
        project: { name: "Imported Project", description: "desc", meta: {} },
        labels: [],
        documents: [],
        meta: { format: "layered-span-studio/export", version: "1.0" },
      }),
    );

    expect(screen.getByRole("button", { name: "New Project" })).toBeDisabled();
    resolveImport({
      project: { id: "project-2", name: "Imported Project", description: "desc", meta: {}, created_at: "2026-03-10T00:00:00Z" },
      imported: {},
      errors: [],
    });
    await screen.findByText("Project Workspace Route");
  });

  it("sorts projects locally and does not refetch when the user changes sort controls", async () => {
    const userEventSetup = userEvent.setup();
    const listProjectsSpy = vi.spyOn(api, "listProjects").mockResolvedValue({
      projects: [
        createProject({
          id: "project-2",
          name: "Medical NER",
          created_at: "2026-03-01T00:00:00Z",
          summary: {
            labels_count: 2,
            documents_count: 3,
            pending_documents_count: 4,
            updated_at: "2026-03-02T00:00:00Z",
          },
        }),
        createProject({
          id: "project-3",
          name: "Alpha Suite",
          created_at: "2026-03-02T00:00:00Z",
          summary: {
            labels_count: 1,
            documents_count: 8,
            pending_documents_count: 1,
            updated_at: "2026-03-03T00:00:00Z",
          },
        }),
        createProject({
          id: "project-1",
          name: "Zeta Corpus",
          created_at: "2026-03-03T00:00:00Z",
          summary: {
            labels_count: 4,
            documents_count: 5,
            pending_documents_count: 2,
            updated_at: "2026-03-04T00:00:00Z",
          },
        }),
      ],
    });

    renderProjectsPage();

    await screen.findByText("Zeta Corpus");
    expect(getRenderedProjectNames()).toEqual(["Zeta Corpus", "Alpha Suite", "Medical NER"]);

    await userEventSetup.click(screen.getByLabelText("並び順"));
    await userEventSetup.click(screen.getByRole("option", { name: "名前順" }));
    expect(getRenderedProjectNames()).toEqual(["Zeta Corpus", "Medical NER", "Alpha Suite"]);

    await userEventSetup.click(screen.getByRole("button", { name: "昇順" }));
    expect(getRenderedProjectNames()).toEqual(["Alpha Suite", "Medical NER", "Zeta Corpus"]);

    await userEventSetup.click(screen.getByLabelText("並び順"));
    await userEventSetup.click(screen.getByRole("option", { name: "未確定ドキュメント数順" }));
    expect(getRenderedProjectNames()).toEqual(["Alpha Suite", "Zeta Corpus", "Medical NER"]);

    await userEventSetup.click(screen.getByRole("button", { name: "降順" }));
    expect(getRenderedProjectNames()).toEqual(["Medical NER", "Zeta Corpus", "Alpha Suite"]);

    await userEventSetup.type(screen.getByPlaceholderText("Project 名や説明で検索"), "suite");
    expect(getRenderedProjectNames()).toEqual(["Alpha Suite"]);
    expect(listProjectsSpy).toHaveBeenCalledTimes(1);
  });

  it("sorts created_at by numeric timestamp and keeps missing values last", async () => {
    const userEventSetup = userEvent.setup();
    vi.spyOn(api, "listProjects").mockResolvedValue({
      projects: [
        createProject({
          id: "project-1",
          name: "No Timestamp",
          created_at: undefined as unknown as string,
        }),
        createProject({
          id: "project-2",
          name: "Whole Second",
          created_at: "2026-03-03T00:00:00Z",
        }),
        createProject({
          id: "project-3",
          name: "Fractional Second",
          created_at: "2026-03-03T00:00:00.123Z",
        }),
      ],
    });

    renderProjectsPage();

    await screen.findByText("Fractional Second");
    expect(getRenderedProjectNames()).toEqual(["Fractional Second", "Whole Second", "No Timestamp"]);

    await userEventSetup.click(screen.getByRole("button", { name: "昇順" }));
    expect(getRenderedProjectNames()).toEqual(["Whole Second", "Fractional Second", "No Timestamp"]);
  });
});
