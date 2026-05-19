import type { LabelDraft } from "./projectShellTypes";
import type { DocumentListResponse, DocumentRecord, LabelRecord, ProjectRecord } from "../../api-contract";
import type { DocumentListItem } from "../../types";
import { DEFAULT_LABEL_COLOR, DOCUMENT_WINDOW_SIZE } from "./projectShellConstants";
import { makeLocalId } from "../../utils";

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return value;
}

export function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(normalizeHexColor(value));
}

export function createEmptyLabelDraft(): LabelDraft {
  return {
    id: "",
    name: "",
    color: DEFAULT_LABEL_COLOR,
    description: "",
  };
}

export function toLabelDraft(label: Pick<LabelRecord, "id" | "name" | "color" | "description">): LabelDraft {
  return {
    id: label.id,
    name: label.name,
    color: label.color,
    description: label.description,
  };
}

export function findConflictingLabelName(
  labels: Array<Pick<LabelRecord, "id" | "name">>,
  draft: Pick<LabelDraft, "id" | "name">,
) {
  const normalizedName = draft.name.trim();
  return labels.find((label) => label.id !== draft.id && label.name.trim() === normalizedName) ?? null;
}

export type LabelDraftSubmitResult =
  | { status: "submitted"; label: LabelRecord; labels: LabelRecord[] }
  | { status: "empty-name" }
  | { status: "invalid-color" }
  | { status: "duplicate"; conflictingLabel: Pick<LabelRecord, "id" | "name"> };

export function submitLabelDraft(
  project: Pick<ProjectRecord, "id" | "name">,
  labels: LabelRecord[],
  labelDraft: LabelDraft,
): LabelDraftSubmitResult {
  if (!labelDraft.name.trim()) {
    return { status: "empty-name" };
  }
  if (!isHexColor(labelDraft.color)) {
    return { status: "invalid-color" };
  }

  const conflictingLabel = findConflictingLabelName(labels, labelDraft);
  if (conflictingLabel) {
    return { status: "duplicate", conflictingLabel };
  }

  const editingLabel = labels.find((label) => label.id === labelDraft.id);
  const nextLabel: LabelRecord = {
    id: labelDraft.id || makeLocalId("label"),
    project_id: project.id,
    project_name: project.name,
    name: labelDraft.name.trim(),
    color: normalizeHexColor(labelDraft.color),
    description: labelDraft.description,
    shortcut: editingLabel?.shortcut ?? null,
    meta: {},
  };
  const index = labels.findIndex((label) => label.id === nextLabel.id);
  const nextLabels = [...labels];
  if (index >= 0) {
    nextLabels[index] = nextLabel;
  } else {
    nextLabels.push(nextLabel);
  }
  return { status: "submitted", label: nextLabel, labels: nextLabels };
}

export function toDocumentListItem(document: DocumentRecord): DocumentListItem {
  return {
    id: document.id,
    project_id: document.project_id,
    project_name: document.project_name,
    document_name: document.document_name,
    text: document.text,
    status: document.status,
    created_at: document.created_at,
    updated_at: document.updated_at,
    meta: document.meta,
  };
}

export function trimDocumentWindow(items: DocumentListItem[], selectedId: string | null) {
  if (items.length <= DOCUMENT_WINDOW_SIZE) {
    return items;
  }
  let overflow = items.length - DOCUMENT_WINDOW_SIZE;
  return items.filter((item) => {
    if (overflow > 0 && item.id !== selectedId) {
      overflow -= 1;
      return false;
    }
    return true;
  });
}

export function trimDocumentScrollWindow(items: DocumentListItem[], trimFrom: "start" | "end") {
  if (items.length <= DOCUMENT_WINDOW_SIZE) {
    return items;
  }
  return trimFrom === "start"
    ? items.slice(items.length - DOCUMENT_WINDOW_SIZE)
    : items.slice(0, DOCUMENT_WINDOW_SIZE);
}

function mergeUniqueDocuments(items: DocumentListItem[]) {
  const merged: DocumentListItem[] = [];
  items.forEach((item) => {
    const index = merged.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) {
      merged[index] = item;
      return;
    }
    merged.push(item);
  });
  return merged;
}

export function mergeDocumentWindow(existing: DocumentListItem[], incoming: DocumentListItem[], selectedId: string | null) {
  const merged = [...existing];
  incoming.forEach((item) => {
    const index = merged.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) {
      merged[index] = item;
      return;
    }
    merged.push(item);
  });
  return trimDocumentWindow(merged, selectedId);
}

export function mergeDocumentScrollWindow(
  existing: DocumentListItem[],
  incoming: DocumentListItem[],
  direction: "next" | "previous",
) {
  const merged =
    direction === "previous"
      ? mergeUniqueDocuments([...incoming, ...existing])
      : mergeUniqueDocuments([...existing, ...incoming]);
  return trimDocumentScrollWindow(merged, direction === "previous" ? "end" : "start");
}

function trimRemainderForRefresh(
  remainder: DocumentListItem[],
  maxCount: number,
  selectedId: string | null,
) {
  if (remainder.length <= maxCount) {
    return remainder;
  }
  let trimmed = trimDocumentWindow(remainder, selectedId);
  if (trimmed.length <= maxCount) {
    return trimmed;
  }
  let overflow = trimmed.length - maxCount;
  return trimmed.filter((item) => {
    if (overflow > 0 && item.id !== selectedId) {
      overflow -= 1;
      return false;
    }
    return true;
  });
}

export function mergeDocumentListRefresh(
  current: DocumentListItem[],
  responseDocuments: DocumentListItem[],
  responseOffset: number,
  selectedId: string | null,
) {
  if (responseOffset === 0) {
    const responseIds = new Set(responseDocuments.map((document) => document.id));
    const remainder = current.filter((document) => !responseIds.has(document.id));
    const maxRemainderCount = Math.max(0, DOCUMENT_WINDOW_SIZE - responseDocuments.length);
    const keptRemainder = trimRemainderForRefresh(remainder, maxRemainderCount, selectedId);
    return [...responseDocuments, ...keptRemainder];
  }
  return mergeDocumentWindow(current, responseDocuments, selectedId);
}

export async function collectDocumentNames(
  total: number,
  pageSize: number,
  fetchPage: (offset: number, limit: number) => Promise<DocumentListResponse>,
) {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize must be a positive integer");
  }
  if (total <= 0) {
    return [];
  }

  const names: string[] = [];
  for (let offset = 0; offset < total; offset += pageSize) {
    const response = await fetchPage(offset, pageSize);
    names.push(...response.documents.map((document) => document.document_name));
    if (response.documents.length < pageSize) {
      break;
    }
  }

  return names;
}
