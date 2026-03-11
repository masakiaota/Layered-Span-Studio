import type { DocumentListItem, DocumentRecord } from "../../types";
import { DOCUMENT_WINDOW_SIZE } from "./projectShellConstants";

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
