export const queryKeys = {
  session: () => ["session"] as const,
  projects: () => ["projects"] as const,
  sameLabelExamples: (projectId: string | null, labelId: string | null, excludeAnnotationId: string | null) =>
    ["projects", projectId, "labels", labelId, "surface-groups", excludeAnnotationId] as const,
  sameSurfaceExamples: (
    projectId: string | null,
    text: string | null,
    labelId: string | null,
    excludeAnnotationId: string | null,
  ) => ["projects", projectId, "annotation-search", text, labelId, excludeAnnotationId] as const,
} as const;
