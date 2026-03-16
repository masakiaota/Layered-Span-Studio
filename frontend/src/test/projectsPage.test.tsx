import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ProjectsPage } from "../pages/ProjectsPage";
import type { ProjectListItemRecord, UserRecord } from "../types";

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
    let resolveImport!: (value: { project: { id: string; name: string; description: string; meta: {} }; imported: Record<string, number>; errors: [] }) => void;
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
      project: { id: "project-2", name: "Imported Project", description: "desc", meta: {} },
      imported: {},
      errors: [],
    });
    await screen.findByText("Project Workspace Route");
  });
});
