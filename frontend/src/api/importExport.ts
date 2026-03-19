import type {
  ExportResponse,
  ImportPayload,
  ImportResponse,
  ProjectImportResponse,
  ProjectRecord,
} from "../api-contract";
import type { JsonObject } from "../types";
import { ApiError, client, unwrapData } from "./client";

function assertProjectRecord(value: unknown): ProjectRecord {
  if (!value || typeof value !== "object") {
    throw new ApiError("Imported project response is invalid", 500);
  }
  const project = value as Record<string, unknown>;
  if (
    typeof project.id !== "string" ||
    typeof project.name !== "string" ||
    typeof project.created_at !== "string"
  ) {
    throw new ApiError("Imported project response is invalid", 500);
  }
  return project as ProjectRecord;
}

export async function importProjectAsNew(payload: JsonObject): Promise<ProjectImportResponse> {
  const response = await unwrapData(client.POST("/projects/import", {
    body: payload as ImportPayload,
  }));
  return {
    ...response,
    project: assertProjectRecord(response.project),
  };
}

export function importProject(projectId: string, payload: JsonObject) {
  return unwrapData<ImportResponse>(client.POST("/projects/{project_id}/import", {
    params: {
      path: { project_id: projectId },
    },
    body: payload as ImportPayload,
  }));
}

export function exportProject(projectId: string, includePending: boolean, includeVerified: boolean) {
  return unwrapData<ExportResponse>(client.POST("/projects/{project_id}/export", {
    params: {
      path: { project_id: projectId },
    },
    body: {
      include_pending: includePending,
      include_verified: includeVerified,
    },
  }));
}
