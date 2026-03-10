import type {
  AnnotationRecord,
  DocumentRecord,
  DocumentListItem,
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

function normalizeSimpleSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function findSimpleSearchMatchRange(text: string, query: string) {
  const normalizedQuery = normalizeSimpleSearchQuery(query);
  if (!normalizedQuery) {
    return null;
  }
  const start = text.toLowerCase().indexOf(normalizedQuery);
  if (start < 0) {
    return null;
  }
  return {
    start,
    end: start + normalizedQuery.length,
  };
}

export function documentMatchesSearch(document: DocumentRecord, query: string): boolean {
  return !query.trim() || findSimpleSearchMatchRange(document.text, query) !== null;
}

type DocumentListCompatible = Pick<DocumentListItem, "text" | "meta" | "document_name" | "id">;

export function getDocumentStatus(document: DocumentListCompatible): StatusValue {
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

export function isShortcutBlockedTarget(target: EventTarget | null): boolean {
  return Boolean(
    target instanceof HTMLElement &&
      target.closest(
        "input, textarea, select, [contenteditable='true'], [role='combobox'], [role='listbox'], [role='option']",
      ),
  );
}

type DocumentSnippetWindow = {
  content: string;
  matchStart: number | null;
  matchEnd: number | null;
  hasLeadingEllipsis: boolean;
  hasTrailingEllipsis: boolean;
};

export type DocumentSnippetPart = {
  text: string;
  highlighted: boolean;
};

function buildDocumentSnippetWindow(document: DocumentListCompatible, query: string): DocumentSnippetWindow {
  if (!query.trim()) {
    return {
      content: document.text.slice(0, 120),
      matchStart: null,
      matchEnd: null,
      hasLeadingEllipsis: false,
      hasTrailingEllipsis: document.text.length > 120,
    };
  }
  const match = findSimpleSearchMatchRange(document.text, query);
  if (!match) {
    return {
      content: document.text.slice(0, 120),
      matchStart: null,
      matchEnd: null,
      hasLeadingEllipsis: false,
      hasTrailingEllipsis: document.text.length > 120,
    };
  }
  const start = Math.max(0, match.start - 40);
  const end = Math.min(document.text.length, match.end + 40);
  return {
    content: document.text.slice(start, end),
    matchStart: match.start - start,
    matchEnd: match.end - start,
    hasLeadingEllipsis: start > 0,
    hasTrailingEllipsis: end < document.text.length,
  };
}

export function getDocumentSnippet(document: DocumentListCompatible, query: string): string {
  const snippet = buildDocumentSnippetWindow(document, query);
  return `${snippet.hasLeadingEllipsis ? "…" : ""}${snippet.content}${snippet.hasTrailingEllipsis ? "…" : ""}`;
}

export function getDocumentSnippetParts(document: DocumentListCompatible, query: string): DocumentSnippetPart[] {
  const snippet = buildDocumentSnippetWindow(document, query);
  const parts: DocumentSnippetPart[] = [];
  if (snippet.hasLeadingEllipsis) {
    parts.push({ text: "…", highlighted: false });
  }
  if (snippet.matchStart === null || snippet.matchEnd === null) {
    parts.push({ text: snippet.content, highlighted: false });
  } else {
    if (snippet.matchStart > 0) {
      parts.push({
        text: snippet.content.slice(0, snippet.matchStart),
        highlighted: false,
      });
    }
    parts.push({
      text: snippet.content.slice(snippet.matchStart, snippet.matchEnd),
      highlighted: true,
    });
    if (snippet.matchEnd < snippet.content.length) {
      parts.push({
        text: snippet.content.slice(snippet.matchEnd),
        highlighted: false,
      });
    }
  }
  if (snippet.hasTrailingEllipsis) {
    parts.push({ text: "…", highlighted: false });
  }
  return parts.filter((part) => part.text.length > 0);
}

function getDocumentMetaTimestamp(document: DocumentRecord, key: "created_at" | "updated_at"): number | null {
  const value = toJsonObject(document.meta)[key];
  if (typeof value !== "string") {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function sortDocuments(documents: DocumentRecord[], mode: string): DocumentRecord[] {
  const items = [...documents];
  const originalIndexById = new Map(items.map((document, index) => [document.id, index]));
  const compareByOriginalOrder = (left: DocumentRecord, right: DocumentRecord) =>
    (originalIndexById.get(left.id) ?? 0) - (originalIndexById.get(right.id) ?? 0);
  if (mode === "created") {
    return items.sort((left, right) => {
      const leftCreated = getDocumentMetaTimestamp(left, "created_at");
      const rightCreated = getDocumentMetaTimestamp(right, "created_at");
      if (leftCreated !== null || rightCreated !== null) {
        if (leftCreated === null) {
          return 1;
        }
        if (rightCreated === null) {
          return -1;
        }
        if (leftCreated !== rightCreated) {
          return leftCreated - rightCreated;
        }
      }
      return compareByOriginalOrder(left, right);
    });
  }
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
  if (mode === "updated") {
    return items.sort((left, right) => {
      const leftUpdated = getDocumentMetaTimestamp(left, "updated_at") ?? getDocumentMetaTimestamp(left, "created_at");
      const rightUpdated =
        getDocumentMetaTimestamp(right, "updated_at") ?? getDocumentMetaTimestamp(right, "created_at");
      if (leftUpdated !== null || rightUpdated !== null) {
        if (leftUpdated === null) {
          return 1;
        }
        if (rightUpdated === null) {
          return -1;
        }
        if (leftUpdated !== rightUpdated) {
          return rightUpdated - leftUpdated;
        }
      }
      return compareByOriginalOrder(left, right);
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
