import type {
  AnnotationRecord,
  DocumentRecord,
  JsonObject,
  JsonValue,
  LabelRecord,
  ProjectBundle,
  ProjectRecord,
  StatusValue,
} from "./types";

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function toJsonObject(value: JsonObject | null | undefined): JsonObject {
  return (value ?? {}) as JsonObject;
}

export function normalizeSearchText(value: string): string {
  return value.trim().replace(/[_\-\s]+/g, " ").toLowerCase();
}

export function buildSearchTokens(value: string): string[] {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

export function documentMatchesSearch(document: DocumentRecord, query: string): boolean {
  if (!query.trim()) {
    return true;
  }
  const normalizedText = normalizeSearchText(document.text);
  return buildSearchTokens(query).every((token) => normalizedText.includes(token));
}

export function getDocumentStatus(document: DocumentRecord): StatusValue {
  const status = toJsonObject(document.meta).status;
  return status === "verified" ? "verified" : "pending";
}

export function setDocumentStatus(document: DocumentRecord, status: StatusValue) {
  document.meta = {
    ...toJsonObject(document.meta),
    status,
  };
}

export function getProjectGuideline(project: ProjectRecord): string {
  const guideline = toJsonObject(project.meta).guideline;
  return typeof guideline === "string" ? guideline : "";
}

export function setProjectGuideline(project: ProjectRecord, guideline: string) {
  project.meta = {
    ...toJsonObject(project.meta),
    guideline,
  };
}

export function getProjectShortcutHelpEnabled(project: ProjectRecord): boolean {
  const value = toJsonObject(project.meta).shortcut_help_enabled;
  return value === false ? false : true;
}

export function setProjectShortcutHelpEnabled(project: ProjectRecord, enabled: boolean) {
  project.meta = {
    ...toJsonObject(project.meta),
    shortcut_help_enabled: enabled,
  };
}

export function compareJson(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function projectEquals(a: ProjectRecord, b: ProjectRecord): boolean {
  return a.name === b.name && (a.description ?? "") === (b.description ?? "") && compareJson(a.meta, b.meta);
}

export function labelEquals(a: LabelRecord, b: LabelRecord): boolean {
  return (
    a.name === b.name &&
    a.color === b.color &&
    a.description === b.description &&
    (a.shortcut ?? "") === (b.shortcut ?? "") &&
    compareJson(a.meta, b.meta)
  );
}

export function documentEquals(a: DocumentRecord, b: DocumentRecord): boolean {
  return a.document_name === b.document_name && compareJson(a.meta, b.meta);
}

export function annotationEquals(a: AnnotationRecord, b: AnnotationRecord): boolean {
  return a.comment === b.comment && a.status === b.status && compareJson(a.meta, b.meta);
}

export function isLocalId(id: string): boolean {
  return id.startsWith("local-");
}

export function makeLocalId(prefix: string): string {
  return `local-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDocumentSnippet(document: DocumentRecord, query: string): string {
  if (!query.trim()) {
    return document.text.slice(0, 120);
  }
  const tokens = buildSearchTokens(query);
  const normalized = normalizeSearchText(document.text);
  const first = tokens.find((token) => normalized.includes(token));
  if (!first) {
    return document.text.slice(0, 120);
  }
  const index = normalized.indexOf(first);
  const start = Math.max(0, index - 40);
  const end = Math.min(document.text.length, index + 80);
  return `${start > 0 ? "…" : ""}${document.text.slice(start, end)}${end < document.text.length ? "…" : ""}`;
}

export function sortDocuments(documents: DocumentRecord[], mode: string): DocumentRecord[] {
  const items = [...documents];
  if (mode === "name") {
    return items.sort((a, b) => a.document_name.localeCompare(b.document_name, "ja"));
  }
  if (mode === "pending") {
    return items.sort((a, b) => {
      const statusCompare = getDocumentStatus(a).localeCompare(getDocumentStatus(b));
      if (statusCompare !== 0) {
        return statusCompare;
      }
      return a.document_name.localeCompare(b.document_name, "ja");
    });
  }
  return items.sort((a, b) => a.document_name.localeCompare(b.document_name, "ja"));
}

export function groupAnnotationsByLabel(
  document: DocumentRecord,
  labels: LabelRecord[],
): Array<{ label: LabelRecord; annotations: AnnotationRecord[] }> {
  return labels.map((label) => ({
    label,
    annotations: [...document.annotations]
      .filter((annotation) => annotation.label_id === label.id)
      .sort((a, b) => a.start - b.start || a.end - b.end),
  }));
}

export function buildExportFilename(project: ProjectRecord): string {
  const safeName = project.name.replace(/[^\p{L}\p{N}\-_]+/gu, "-").replace(/-+/g, "-");
  return `${safeName || "layered-span-studio"}.json`;
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(file: File) {
  return JSON.parse(await file.text()) as JsonObject;
}

export function findNextPendingDocumentId(bundle: ProjectBundle, currentDocumentId: string): string | null {
  const items = bundle.documents;
  const currentIndex = items.findIndex((document) => document.id === currentDocumentId);
  for (let index = currentIndex + 1; index < items.length; index += 1) {
    if (getDocumentStatus(items[index]) === "pending") {
      return items[index].id;
    }
  }
  for (let index = 0; index < currentIndex; index += 1) {
    if (getDocumentStatus(items[index]) === "pending") {
      return items[index].id;
    }
  }
  return null;
}
