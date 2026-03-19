import type { DocumentRecord, LabelRecord, ProjectRecord } from "./api-contract";

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type DocumentListItem = Omit<DocumentRecord, "annotations">;

export interface ProjectBundle {
  project: ProjectRecord;
  labels: LabelRecord[];
  documents: DocumentRecord[];
}
