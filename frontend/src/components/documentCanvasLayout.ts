import type { AnnotationRecord, LabelRecord } from "../api-contract";

export const UNDERLINE_LANE_BASE = 5.0;
export const UNDERLINE_LANE_PITCH = 4.4;
export const UNDERLINE_PADDING_TAIL = 5;
export const UNDERLINE_HIT_HEIGHT = 5;

export type TextSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
  covers: AnnotationRecord[];
  focused: AnnotationRecord[];
  selected: boolean;
};

export type InlineRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export type MergedInlineRect = Pick<InlineRect, "left" | "right" | "top" | "bottom">;

type TextNodeEntry = {
  node: Text;
  start: number;
  end: number;
};

export function getSelectionOffset(container: HTMLElement, node: Node, offset: number) {
  let total = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const currentNode = walker.currentNode;
    const length = currentNode.textContent?.length ?? 0;
    if (currentNode === node) {
      return total + offset;
    }
    total += length;
  }
  return total;
}

export function mixColorWithBlack(hexColor: string, ratio = 0.5) {
  const normalized = hexColor.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "#1d1d1d";
  }
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) => Math.round(channel * (1 - ratio)));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

export function buildAnnotationById(annotations: AnnotationRecord[]) {
  return new Map(annotations.map((annotation) => [annotation.id, annotation]));
}

function createAnnotationOrderById(annotations: AnnotationRecord[]) {
  return new Map(annotations.map((annotation, index) => [annotation.id, index]));
}

function appendAnnotationAtOffset(
  annotationsByOffset: Map<number, AnnotationRecord[]>,
  offset: number,
  annotation: AnnotationRecord,
) {
  const annotations = annotationsByOffset.get(offset);
  if (annotations) {
    annotations.push(annotation);
    return;
  }
  annotationsByOffset.set(offset, [annotation]);
}

function sortByOriginalAnnotationOrder(
  annotations: AnnotationRecord[],
  annotationOrderById: Map<string, number>,
) {
  annotations.sort(
    (left, right) => (annotationOrderById.get(left.id) ?? 0) - (annotationOrderById.get(right.id) ?? 0),
  );
}

export function buildSegments(
  text: string,
  annotations: AnnotationRecord[],
  focusedLabelId: string | null,
  selectedAnnotationId: string | null,
) {
  const boundaries = new Set<number>([0, text.length]);
  const startsByOffset = new Map<number, AnnotationRecord[]>();
  const endsByOffset = new Map<number, AnnotationRecord[]>();
  annotations.forEach((annotation) => {
    boundaries.add(annotation.start);
    boundaries.add(annotation.end);
    appendAnnotationAtOffset(startsByOffset, annotation.start, annotation);
    appendAnnotationAtOffset(endsByOffset, annotation.end, annotation);
  });

  const sortedBoundaries = [...boundaries].sort((a, b) => a - b);
  const activeById = new Map<string, AnnotationRecord>();
  const annotationOrderById = createAnnotationOrderById(annotations);
  const segments: TextSegment[] = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const start = sortedBoundaries[index];
    const end = sortedBoundaries[index + 1];

    endsByOffset.get(start)?.forEach((annotation) => {
      activeById.delete(annotation.id);
    });
    startsByOffset.get(start)?.forEach((annotation) => {
      activeById.set(annotation.id, annotation);
    });

    if (start === end) {
      continue;
    }

    const covers = [...activeById.values()];
    sortByOriginalAnnotationOrder(covers, annotationOrderById);
    segments.push({
      id: `${start}-${end}`,
      start,
      end,
      text: text.slice(start, end),
      covers,
      focused: covers.filter((annotation) => annotation.label_id === focusedLabelId),
      selected: covers.some((annotation) => annotation.id === selectedAnnotationId),
    });
  }

  return segments;
}

export function buildUnderlineLaneByAnnotation(
  annotations: AnnotationRecord[],
  labels: LabelRecord[],
  focusedLabelId: string | null,
) {
  const labelOrderById = new Map(labels.map((label, index) => [label.id, index]));
  const laneEnds: number[] = [];
  const laneByAnnotationId: Record<string, number> = {};
  let maxLane = -1;
  annotations
    .filter((annotation) => annotation.label_id !== focusedLabelId)
    .sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start;
      }
      if (left.end !== right.end) {
        return left.end - right.end;
      }
      const labelDiff = (labelOrderById.get(left.label_id) ?? 0) - (labelOrderById.get(right.label_id) ?? 0);
      if (labelDiff !== 0) {
        return labelDiff;
      }
      return left.id.localeCompare(right.id);
    })
    .forEach((annotation) => {
      let laneIndex = 0;
      while (laneIndex < laneEnds.length && laneEnds[laneIndex] > annotation.start) {
        laneIndex += 1;
      }
      laneEnds[laneIndex] = annotation.end;
      laneByAnnotationId[annotation.id] = laneIndex;
      maxLane = Math.max(maxLane, laneIndex);
    });

  return {
    laneByAnnotationId,
    reserveBottom:
      maxLane >= 0 ? UNDERLINE_LANE_BASE + maxLane * UNDERLINE_LANE_PITCH + UNDERLINE_PADDING_TAIL : 0,
  };
}

export function mergeInlineRects(rects: InlineRect[]) {
  const sorted = [...rects]
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((left, right) => (left.top !== right.top ? left.top - right.top : left.left - right.left));
  const merged: MergedInlineRect[] = [];
  sorted.forEach((rect) => {
    const last = merged[merged.length - 1];
    const isSameLine =
      last &&
      Math.abs(last.top - rect.top) <= 1 &&
      Math.abs(last.bottom - rect.bottom) <= 1 &&
      rect.left <= last.right + 2;
    if (isSameLine) {
      last.right = Math.max(last.right, rect.right);
      return;
    }
    merged.push({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    });
  });
  return merged;
}

export function collectTextNodeIndex(container: HTMLElement) {
  const entries: TextNodeEntry[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const length = node.textContent?.length ?? 0;
    entries.push({ node, start: offset, end: offset + length });
    offset += length;
  }
  return entries;
}

function findTextPosition(entries: TextNodeEntry[], offset: number) {
  if (entries.length === 0) {
    return null;
  }

  let low = 0;
  let high = entries.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const entry = entries[middle];
    if (offset < entry.start) {
      high = middle - 1;
      continue;
    }
    if (offset > entry.end || (offset === entry.end && offset !== entry.start && middle < entries.length - 1)) {
      low = middle + 1;
      continue;
    }
    return { node: entry.node, offset: offset - entry.start };
  }

  const last = entries[entries.length - 1];
  if (offset >= last.end) {
    return { node: last.node, offset: last.node.textContent?.length ?? 0 };
  }
  return null;
}

export function getTextRectsForOffsetRange(
  entries: TextNodeEntry[],
  start: number,
  end: number,
): InlineRect[] {
  const startPosition = findTextPosition(entries, start);
  const endPosition = findTextPosition(entries, end);
  if (!startPosition || !endPosition || start >= end) {
    return [];
  }

  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  if (typeof range.getClientRects !== "function") {
    range.detach();
    return [];
  }
  const rects = Array.from(range.getClientRects()).map((rect) => ({
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }));
  range.detach();
  return rects;
}

export function buildRectsByAnnotationId(root: HTMLElement, annotations: AnnotationRecord[]) {
  const textNodeIndex = collectTextNodeIndex(root);
  const rectsByAnnotationId: Record<string, InlineRect[]> = {};
  annotations.forEach((annotation) => {
    rectsByAnnotationId[annotation.id] = getTextRectsForOffsetRange(textNodeIndex, annotation.start, annotation.end);
  });
  return rectsByAnnotationId;
}

export function isBoxInViewport(
  box: { left: number; top: number; width: number; height?: number },
  viewport: { left: number; top: number; right: number; bottom: number },
) {
  const height = box.height ?? 1;
  return box.left + box.width >= viewport.left && box.left <= viewport.right && box.top + height >= viewport.top && box.top <= viewport.bottom;
}

export function resolveLineHeight(lineHeight: string, fallback: number) {
  if (!lineHeight.trim().endsWith("px")) {
    return fallback;
  }
  const parsed = Number.parseFloat(lineHeight);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function calculateAnnotationScrollTop({
  selectedTop,
  selectedBottom,
  lineHeight,
  viewportTop,
  viewportHeight,
  maxScrollTop,
}: {
  selectedTop: number;
  selectedBottom: number;
  lineHeight: number;
  viewportTop: number;
  viewportHeight: number;
  maxScrollTop: number;
}) {
  const viewportBottom = viewportTop + viewportHeight;
  if (selectedTop >= viewportTop && selectedBottom + lineHeight <= viewportBottom) {
    return null;
  }
  const contextOffset = Math.max(lineHeight, viewportHeight * 0.32);
  const contextTarget = selectedTop - contextOffset;
  const bottomTarget = selectedBottom + lineHeight - viewportHeight;
  const canFitFullSelection = bottomTarget <= selectedTop;
  const target = canFitFullSelection
    ? Math.min(Math.max(contextTarget, bottomTarget), selectedTop)
    : selectedTop < viewportTop
      ? selectedTop
      : bottomTarget;
  return Math.min(Math.max(target, 0), Math.max(maxScrollTop, 0));
}
