import type { AnnotationSearchResponse, ExampleStatusValue } from "../api-contract";
import { client, unwrapData } from "./client";

type AnnotationSearchOptions = {
  text: string;
  status?: ExampleStatusValue;
  labelId?: string | null;
  excludeAnnotationId?: string | null;
  offset?: number;
  limit?: number;
  contextWindow?: number;
};

export function searchAnnotations(projectId: string, options: AnnotationSearchOptions) {
  return unwrapData<AnnotationSearchResponse>(client.GET("/projects/{project_id}/annotations/search", {
    params: {
      path: { project_id: projectId },
      query: {
        text: options.text,
        status: options.status ?? "verified",
        label_id: options.labelId ?? undefined,
        exclude_annotation_id: options.excludeAnnotationId ?? undefined,
        offset: options.offset ?? 0,
        limit: options.limit ?? 50,
        context_window: options.contextWindow ?? 20,
      },
    },
  }));
}
