export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type StatusValue = "pending" | "verified";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserRecord {
  id: string;
  username: string;
  meta: JsonObject | null;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string | null;
  meta: JsonObject | null;
}

export interface LabelRecord {
  id: string;
  project_id: string;
  project_name: string;
  name: string;
  color: string;
  description: string;
  shortcut?: string | null;
  meta: JsonObject | null;
}

export interface AnnotationRecord {
  id: string;
  document_id: string;
  document_name: string;
  label_id: string;
  label_name: string;
  start: number;
  end: number;
  span_text: string;
  comment: string;
  status: StatusValue;
  meta: JsonObject | null;
}

export interface DocumentRecord {
  id: string;
  project_id: string;
  project_name?: string | null;
  document_name: string;
  text: string;
  annotations: AnnotationRecord[];
  meta: JsonObject | null;
}

export type DocumentListItem = Omit<DocumentRecord, "annotations">;

export interface DocumentListResponse {
  documents: DocumentListItem[];
  total: number;
  pending_total: number;
  offset: number;
  limit: number;
  search: string;
  sort: string;
}

export interface LabelExampleRecord {
  annotation_id: string;
  document_id: string;
  document_name: string;
  span_text: string;
  start: number;
  end: number;
  status: StatusValue;
  context_before: string;
  context_after: string;
}

export interface LabelSurfaceGroupRepresentativeRecord {
  annotation_id: string;
  document_id: string;
  document_name: string;
  span_text: string;
  start: number;
  end: number;
  status: StatusValue;
  context_before: string;
  context_after: string;
}

export interface LabelSurfaceGroupRecord {
  surface_text: string;
  surface_norm: string;
  duplicate_count: number;
  representative: LabelSurfaceGroupRepresentativeRecord;
}

export interface LabelSurfaceGroupsResponse {
  items: LabelSurfaceGroupRecord[];
  total: number;
  offset: number;
  limit: number;
  status: string;
  context_window: number;
  exclude_annotation_id?: string | null;
}

export interface AnnotationSearchItemRecord {
  annotation_id: string;
  document_id: string;
  document_name: string;
  label_id: string;
  label_name: string;
  label_color: string;
  start: number;
  end: number;
  span_text: string;
  status: StatusValue;
  context_before: string;
  context_after: string;
}

export interface AnnotationSearchResponse {
  items: AnnotationSearchItemRecord[];
  total: number;
  offset: number;
  limit: number;
  text: string;
  match: "exact" | "normalized";
  status: string;
  context_window: number;
  label_id?: string | null;
  exclude_annotation_id?: string | null;
}

export interface ProjectBundle {
  project: ProjectRecord;
  labels: LabelRecord[];
  documents: DocumentRecord[];
}

export interface ProjectImportResponse {
  project: ProjectRecord;
  imported: Record<string, number>;
  errors: Array<Record<string, JsonValue>>;
}

export interface ImportResponse {
  imported: Record<string, number>;
  errors: Array<Record<string, JsonValue>>;
}

export interface ExportResponse {
  project: ProjectRecord;
  labels: LabelRecord[];
  documents: DocumentRecord[];
  meta: JsonObject;
}
