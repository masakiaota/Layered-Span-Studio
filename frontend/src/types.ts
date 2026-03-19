import type { DocumentRecord, LabelRecord, ProjectRecord } from "./api-contract";

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: unknown };

export type DocumentListItem = Omit<DocumentRecord, "annotations">;

export interface ProjectBundle {
  project: ProjectRecord;
  labels: LabelRecord[];
  documents: DocumentRecord[];
}
