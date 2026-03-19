import type { AnnotationRecord, DocumentRecord, LabelRecord } from "../../api-contract";
import type { DocumentListItem } from "../../types";

export function contextSnippet(text: string, start: number, end: number, size = 16) {
  return {
    before: text.slice(Math.max(0, start - size), start),
    focus: text.slice(start, end),
    after: text.slice(end, Math.min(text.length, end + size)),
  };
}

export function getDocumentHoverPreview(document: DocumentRecord | DocumentListItem, query: string, size = 180) {
  if (!query.trim()) {
    return document.text.slice(0, size);
  }
  const index = document.text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index < 0) {
    return document.text.slice(0, size);
  }
  const start = Math.max(0, index - 48);
  const end = Math.min(document.text.length, index + query.trim().length + 48);
  return `${start > 0 ? "…" : ""}${document.text.slice(start, end)}${end < document.text.length ? "…" : ""}`;
}

export function sortAnnotationsInPanelOrder(document: DocumentRecord, labels: LabelRecord[]) {
  const groups = new Map(labels.map((label) => [label.id, [] as AnnotationRecord[]]));
  const fallback: AnnotationRecord[] = [];
  document.annotations.forEach((annotation) => {
    const group = groups.get(annotation.label_id);
    if (group) {
      group.push(annotation);
    } else {
      fallback.push(annotation);
    }
  });
  const sortBySpanIndex = (left: AnnotationRecord, right: AnnotationRecord) =>
    left.start - right.start || left.end - right.end || left.id.localeCompare(right.id);
  const ordered: AnnotationRecord[] = [];
  labels.forEach((label) => {
    const group = groups.get(label.id) ?? [];
    group.sort(sortBySpanIndex);
    ordered.push(...group);
  });
  fallback.sort(sortBySpanIndex);
  ordered.push(...fallback);
  return ordered;
}
