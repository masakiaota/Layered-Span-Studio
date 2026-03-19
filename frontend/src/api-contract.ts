import type { components } from "./generated/openapi";

export type StatusValue = components["schemas"]["AnnotationStatus"];
export type DocumentSortValue = components["schemas"]["DocumentListSort"];
export type ExampleStatusValue = components["schemas"]["LabelExamplesStatusFilter"];

export type UserRecord = components["schemas"]["MeResponse"];
export type ProjectRecord = components["schemas"]["ProjectOut"];
export type ProjectSummaryRecord = components["schemas"]["ProjectSummaryOut"];
export type ProjectListItemRecord = components["schemas"]["ProjectListItemOut"];
export type LabelRecord = components["schemas"]["LabelOut"];
export type LabelListResponse = components["schemas"]["LabelListResponse"];
export type AnnotationRecord = components["schemas"]["AnnotationOut"];
export type AnnotationSearchItemRecord = components["schemas"]["AnnotationSearchItemOut"];
export type AnnotationSearchResponse =
  Omit<components["schemas"]["AnnotationSearchResponse"], "status"> & { status: string };
export type DocumentRecord = components["schemas"]["DocumentDetailOut"];
export type DocumentListResponse =
  Omit<components["schemas"]["DocumentListResponse"], "sort"> & { sort: string };
export type LabelExampleRecord = components["schemas"]["LabelExampleOut"];
export type LabelSurfaceGroupRepresentativeRecord = components["schemas"]["LabelSurfaceGroupRepresentativeOut"];
export type LabelSurfaceGroupRecord = components["schemas"]["LabelSurfaceGroupOut"];
export type LabelSurfaceGroupsResponse =
  Omit<components["schemas"]["LabelSurfaceGroupsResponse"], "status"> & { status: string };
export type ProjectImportResponse =
  Omit<components["schemas"]["ProjectImportResponse"], "project"> & { project: ProjectRecord };
export type ImportResponse = components["schemas"]["ImportResponse"];
export type ExportResponse = components["schemas"]["ExportResponse"];
export type ImportPayload = components["schemas"]["ImportRequest"];

export type CreateProjectInput = components["schemas"]["ProjectCreate"];
export type SaveProjectSettingsInput = components["schemas"]["ProjectSettingsPut"];
export type SaveProjectLabelInput = components["schemas"]["LabelSyncItemIn"];
export type CreateDocumentInput = components["schemas"]["DocumentCreate"];
export type SaveDocumentAnnotationInput = components["schemas"]["DocumentBundleAnnotationIn"];
