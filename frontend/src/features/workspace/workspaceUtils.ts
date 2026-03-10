import type { AnnotationRecord, DocumentRecord, LabelRecord, ProjectBundle } from "../../types";
import { normalizeSearchText } from "../../utils";

export function contextSnippet(text: string, start: number, end: number, size = 16) {
  return {
    before: text.slice(Math.max(0, start - size), start),
    focus: text.slice(start, end),
    after: text.slice(end, Math.min(text.length, end + size)),
  };
}

export function getDocumentHoverPreview(document: DocumentRecord, query: string, size = 180) {
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

export function getSameLabelSurfaceExamples(
  bundle: ProjectBundle,
  focusedLabel: LabelRecord | null,
  selectedAnnotation: AnnotationRecord | null,
) {
  if (!focusedLabel) {
    return [];
  }
  const entries = bundle.documents.flatMap((document) =>
    document.annotations
      .filter((annotation) => annotation.label_id === focusedLabel.id)
      .filter((annotation) => !selectedAnnotation || annotation.id !== selectedAnnotation.id)
      .map((annotation) => ({ document, annotation })),
  );
  const deduped = new Map<
    string,
    {
      document: DocumentRecord;
      annotation: AnnotationRecord;
      duplicateCount: number;
      duplicates: Array<{ document: DocumentRecord; annotation: AnnotationRecord }>;
    }
  >();
  entries.forEach((entry) => {
    const key = normalizeSearchText(entry.annotation.span_text);
    if (!key) {
      return;
    }
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, { ...entry, duplicateCount: 1, duplicates: [entry] });
      return;
    }
    existing.duplicateCount += 1;
    existing.duplicates.push(entry);
    if (existing.annotation.status !== "verified" && entry.annotation.status === "verified") {
      deduped.set(key, { ...entry, duplicateCount: existing.duplicateCount, duplicates: existing.duplicates });
    }
  });
  return [...deduped.values()]
    .sort((left, right) => {
      if (left.annotation.status !== right.annotation.status) {
        return left.annotation.status === "verified" ? -1 : 1;
      }
      return right.document.document_name.localeCompare(left.document.document_name, "ja");
    });
}

export function getSameSurfaceAnnotationExamples(bundle: ProjectBundle, selectedAnnotation: AnnotationRecord | null) {
  if (!selectedAnnotation) {
    return [];
  }
  const target = normalizeSearchText(selectedAnnotation.span_text);
  return bundle.documents
    .flatMap((document) =>
      document.annotations
        .filter((annotation) => normalizeSearchText(annotation.span_text) === target)
        .filter((annotation) => annotation.id !== selectedAnnotation.id)
        .map((annotation) => ({ document, annotation })),
    )
    .sort((left, right) => {
      const leftDifferent = left.annotation.label_id !== selectedAnnotation.label_id;
      const rightDifferent = right.annotation.label_id !== selectedAnnotation.label_id;
      if (leftDifferent !== rightDifferent) {
        return leftDifferent ? -1 : 1;
      }
      if (left.annotation.status !== right.annotation.status) {
        return left.annotation.status === "verified" ? -1 : 1;
      }
      return right.document.document_name.localeCompare(left.document.document_name, "ja");
    })
    .slice(0, 8);
}

export function getSameSurfaceExamplesByText(
  bundle: ProjectBundle,
  target: { text: string; annotationId?: string | null; labelId?: string | null } | null,
) {
  if (!target?.text.trim()) {
    return [];
  }
  const normalizedTarget = normalizeSearchText(target.text);
  if (!normalizedTarget) {
    return [];
  }
  return bundle.documents
    .flatMap((document) =>
      document.annotations
        .filter((annotation) => normalizeSearchText(annotation.span_text) === normalizedTarget)
        .filter((annotation) => !target.annotationId || annotation.id !== target.annotationId)
        .map((annotation) => ({ document, annotation })),
    )
    .sort((left, right) => {
      const leftDifferent = target.labelId ? left.annotation.label_id !== target.labelId : false;
      const rightDifferent = target.labelId ? right.annotation.label_id !== target.labelId : false;
      if (leftDifferent !== rightDifferent) {
        return leftDifferent ? -1 : 1;
      }
      if (left.annotation.status !== right.annotation.status) {
        return left.annotation.status === "verified" ? -1 : 1;
      }
      return right.document.document_name.localeCompare(left.document.document_name, "ja");
    });
}
