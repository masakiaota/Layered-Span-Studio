import type {
  LabelListResponse,
  LabelSurfaceGroupsResponse,
  SaveProjectLabelInput,
} from "../api-contract";
import { toJsonObject } from "../utils";
import { ApiError, client, unwrapData } from "./client";

function assertLabelListResponseRevision(payload: LabelListResponse): LabelListResponse {
  if (!payload.revision || payload.revision.trim().length === 0) {
    throw new ApiError("Labels revision が取得できなかった", 500);
  }
  return payload;
}

export function listLabels(projectId: string) {
  return unwrapData<LabelListResponse>(client.GET("/projects/{project_id}/labels", {
    params: { path: { project_id: projectId } },
  })).then(assertLabelListResponseRevision);
}

export function saveProjectLabels(
  projectId: string,
  labels: Array<Pick<SaveProjectLabelInput, "name" | "color" | "description" | "shortcut" | "meta"> & { id: string | null }>,
  baseRevision: string,
) {
  return unwrapData<LabelListResponse>(client.PUT("/projects/{project_id}/labels", {
    params: { path: { project_id: projectId } },
    body: {
      base_revision: baseRevision,
      labels: labels.map((label) => ({
        ...label,
        meta: toJsonObject(label.meta ?? null),
      })),
    },
  })).then(assertLabelListResponseRevision);
}

type LabelSurfaceGroupOptions = {
  offset?: number;
  limit?: number;
  status?: string;
  contextWindow?: number;
  excludeAnnotationId?: string | null;
};

export function listLabelSurfaceGroups(
  projectId: string,
  labelId: string,
  options?: LabelSurfaceGroupOptions,
) {
  return unwrapData<LabelSurfaceGroupsResponse>(client.GET("/projects/{project_id}/labels/{label_id}/surface-groups", {
    params: {
      path: { project_id: projectId, label_id: labelId },
      query: {
        offset: options?.offset ?? 0,
        limit: options?.limit ?? 50,
        status: (options?.status ?? "verified") as "pending" | "verified" | "all",
        context_window: options?.contextWindow ?? 20,
        exclude_annotation_id: options?.excludeAnnotationId ?? undefined,
      },
    },
  }));
}
