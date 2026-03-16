import type { AnnotationRecord, JsonObject, LabelRecord, StatusValue } from "../../types";

export type BulkAnnotationInput = Pick<
  AnnotationRecord,
  "label_id" | "start" | "end" | "span_text" | "comment" | "status" | "meta"
>;

type ParseBulkAnnotationPayloadOptions = {
  labels: LabelRecord[];
  existingAnnotations: Array<Pick<AnnotationRecord, "label_id" | "start" | "end">>;
};

type AnnotationRange = { start: number; end: number };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseAnnotationsNode(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isPlainObject(payload)) {
    return null;
  }
  return Array.isArray(payload.annotations) ? payload.annotations : null;
}

function isStatus(value: unknown): value is StatusValue {
  return value === "pending" || value === "verified";
}

function resolveLabelId(
  item: Record<string, unknown>,
  labelIdByName: Map<string, string>,
): string | null {
  if (typeof item.label_id === "string" && item.label_id.trim().length > 0) {
    return item.label_id.trim();
  }
  if (typeof item.label_name === "string" && item.label_name.trim().length > 0) {
    return labelIdByName.get(item.label_name.trim()) ?? null;
  }
  return null;
}

function compareRanges(left: AnnotationRange, right: AnnotationRange) {
  return left.start - right.start || left.end - right.end;
}

function findRangeInsertIndex(ranges: AnnotationRange[], start: number, end: number) {
  const target = { start, end };
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (compareRanges(ranges[mid], target) < 0) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function overlapsAdjacentRange(ranges: AnnotationRange[], index: number, start: number, end: number) {
  const previous = index > 0 ? ranges[index - 1] : null;
  if (previous && previous.end > start) {
    return true;
  }
  const next = index < ranges.length ? ranges[index] : null;
  return Boolean(next && next.start < end);
}

function normalizeMeta(value: unknown): JsonObject | null | undefined {
  if (value === undefined) {
    return {};
  }
  if (value === null) {
    return null;
  }
  if (isPlainObject(value)) {
    return value as JsonObject;
  }
  return undefined;
}

export function parseBulkAnnotationPayload(
  payload: unknown,
  options: ParseBulkAnnotationPayloadOptions,
): { annotations: BulkAnnotationInput[]; issues: string[] } {
  const rawAnnotations = parseAnnotationsNode(payload);
  if (!rawAnnotations) {
    return {
      annotations: [],
      issues: ["JSON は `annotations` 配列、または annotation 配列そのものをトップレベルに持つ必要がある"],
    };
  }
  if (rawAnnotations.length === 0) {
    return {
      annotations: [],
      issues: ["`annotations` が空である"],
    };
  }

  const labelIdSet = new Set(options.labels.map((label) => label.id));
  const labelIdByName = new Map(options.labels.map((label) => [label.name.trim(), label.id]));
  const rangesByLabelId = new Map<string, AnnotationRange[]>();
  for (const annotation of options.existingAnnotations) {
    const ranges = rangesByLabelId.get(annotation.label_id) ?? [];
    ranges.push({ start: annotation.start, end: annotation.end });
    rangesByLabelId.set(annotation.label_id, ranges);
  }
  for (const ranges of rangesByLabelId.values()) {
    ranges.sort(compareRanges);
  }

  const issues: string[] = [];
  const annotations: BulkAnnotationInput[] = [];

  rawAnnotations.forEach((item, index) => {
    if (!isPlainObject(item)) {
      issues.push(`annotations[${index}] が object でない`);
      return;
    }

    const labelId = resolveLabelId(item, labelIdByName);
    if (!labelId) {
      issues.push(`annotations[${index}] の label_id / label_name が解決できない`);
      return;
    }
    if (!labelIdSet.has(labelId)) {
      issues.push(`annotations[${index}] の label_id が project に存在しない`);
      return;
    }

    if (!Number.isInteger(item.start)) {
      issues.push(`annotations[${index}].start が整数でない`);
      return;
    }
    if (!Number.isInteger(item.end)) {
      issues.push(`annotations[${index}].end が整数でない`);
      return;
    }
    const start = item.start as number;
    const end = item.end as number;
    if (start < 0 || end <= start) {
      issues.push(`annotations[${index}] の範囲が不正である`);
      return;
    }

    if (typeof item.span_text !== "string") {
      issues.push(`annotations[${index}].span_text が文字列でない`);
      return;
    }

    const status = item.status === undefined ? "pending" : item.status;
    if (!isStatus(status)) {
      issues.push(`annotations[${index}].status が不正である`);
      return;
    }

    if (item.comment !== undefined && typeof item.comment !== "string") {
      issues.push(`annotations[${index}].comment が文字列でない`);
      return;
    }

    const meta = normalizeMeta(item.meta);
    if (meta === undefined) {
      issues.push(`annotations[${index}].meta は object または null を指定する`);
      return;
    }

    const ranges = rangesByLabelId.get(labelId) ?? [];
    const insertIndex = findRangeInsertIndex(ranges, start, end);
    if (overlapsAdjacentRange(ranges, insertIndex, start, end)) {
      issues.push(`annotations[${index}] は同一 label 内で既存または投入 payload と範囲が重複している`);
      return;
    }
    ranges.splice(insertIndex, 0, { start, end });
    rangesByLabelId.set(labelId, ranges);

    annotations.push({
      label_id: labelId,
      start,
      end,
      span_text: item.span_text,
      comment: typeof item.comment === "string" ? item.comment : "",
      status,
      meta,
    });
  });

  return { annotations, issues };
}
