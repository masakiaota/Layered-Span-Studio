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
