import type { CreateProjectInput, ProjectListItemRecord, ProjectRecord } from "../api-contract";
import { toJsonObject } from "../utils";
import { client, unwrapData, unwrapVoid } from "./client";

export function listProjects() {
  return unwrapData<{ projects: ProjectListItemRecord[] }>(client.GET("/projects"));
}

export function createProject(project: Pick<CreateProjectInput, "name" | "description" | "meta">) {
  return unwrapData<ProjectRecord>(client.POST("/projects", {
    body: {
      name: project.name,
      description: project.description ?? "",
      meta: toJsonObject(project.meta ?? null),
    },
  }));
}

export function getProject(projectId: string) {
  return unwrapData<ProjectRecord>(client.GET("/projects/{project_id}", {
    params: { path: { project_id: projectId } },
  }));
}

export async function deleteProject(projectId: string) {
  await unwrapVoid(client.DELETE("/projects/{project_id}", {
    params: { path: { project_id: projectId } },
  }));
}

export function saveProjectSettings(project: ProjectRecord) {
  return unwrapData<ProjectRecord>(client.PUT("/projects/{project_id}/settings", {
    params: { path: { project_id: project.id } },
    body: {
      name: project.name,
      description: project.description ?? "",
      meta: toJsonObject(project.meta ?? null),
    },
  }));
}
