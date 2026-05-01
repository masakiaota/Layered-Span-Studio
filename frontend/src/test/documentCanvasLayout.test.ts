import { describe, expect, it, vi } from "vitest";
import type { AnnotationRecord, LabelRecord } from "../api-contract";
import {
  buildAnnotationById,
  buildSegments,
  buildUnderlineLaneByAnnotation,
  collectTextNodeIndex,
  getSelectionOffset,
  getTextRectsForOffsetRange,
  isBoxInViewport,
  mergeInlineRects,
} from "../components/documentCanvasLayout";

const label: LabelRecord = {
  id: "label-1",
  project_id: "project-1",
  project_name: "Project 1",
  name: "Label 1",
  color: "#3366ff",
  description: "",
  shortcut: "1",
  meta: {},
};

const secondaryLabel: LabelRecord = {
  ...label,
  id: "label-2",
  name: "Label 2",
  color: "#33aa66",
  shortcut: "2",
};

function makeAnnotation(
  id: string,
  start: number,
  end: number,
  labelId = label.id,
): AnnotationRecord {
  return {
    id,
    document_id: "doc-1",
    document_name: "Document 1",
    label_id: labelId,
    label_name: labelId,
    start,
    end,
    span_text: "",
    comment: "",
    status: "pending",
    meta: {},
  };
}

describe("document canvas layout helpers", () => {
  it("builds segments while preserving original annotation order for overlaps", () => {
    const annotations = [
      makeAnnotation("ann-b", 2, 8, label.id),
      makeAnnotation("ann-a", 0, 5, label.id),
      makeAnnotation("ann-c", 4, 10, secondaryLabel.id),
    ];

    const segments = buildSegments("abcdefghij", annotations, label.id, "ann-b");

    expect(segments.map((segment) => [segment.start, segment.end, segment.covers.map((item) => item.id)])).toEqual([
      [0, 2, ["ann-a"]],
      [2, 4, ["ann-b", "ann-a"]],
      [4, 5, ["ann-b", "ann-a", "ann-c"]],
      [5, 8, ["ann-b", "ann-c"]],
      [8, 10, ["ann-c"]],
    ]);
    expect(segments[1].focused.map((annotation) => annotation.id)).toEqual(["ann-b", "ann-a"]);
    expect(segments[1].selected).toBe(true);
  });

  it("keeps segment generation stable for larger synthetic inputs", () => {
    const text = "x".repeat(500);
    const annotations = Array.from({ length: 120 }, (_, index) => {
      const start = index * 3;
      return makeAnnotation(
        `ann-${index}`,
        start,
        Math.min(text.length, start + 25),
        index % 2 ? label.id : secondaryLabel.id,
      );
    });

    const segments = buildSegments(text, annotations, label.id, "ann-10");

    expect(segments[0].start).toBe(0);
    expect(segments[segments.length - 1]?.end).toBe(text.length);
    expect(segments.every((segment) => segment.start < segment.end)).toBe(true);
    expect(segments.find((segment) => segment.selected)?.covers.some((annotation) => annotation.id === "ann-10")).toBe(
      true,
    );
  });

  it("resolves offsets across split text nodes", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>abc</span><span>de</span><span> fg</span>";
    document.body.append(root);

    const originalGetClientRects = Range.prototype.getClientRects;
    const getClientRects = vi.fn(function getClientRects(this: Range) {
      expect(this.toString()).toBe("cde ");
      return [
        { left: 1, right: 11, top: 2, bottom: 6, width: 10, height: 4 },
      ] as unknown as DOMRectList;
    });
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: getClientRects,
    });

    try {
      const entries = collectTextNodeIndex(root);
      const firstTextNode = root.querySelector("span")?.firstChild;

      expect(firstTextNode).toBeTruthy();
      expect(getSelectionOffset(root, firstTextNode as Node, 2)).toBe(2);
      expect(getTextRectsForOffsetRange(entries, 2, 6)).toEqual([
        { left: 1, right: 11, top: 2, bottom: 6, width: 10, height: 4 },
      ]);
      expect(getClientRects).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(Range.prototype, "getClientRects", {
        configurable: true,
        value: originalGetClientRects,
      });
      root.remove();
    }
  });

  it("builds lookup and underline lane helpers without changing established ordering", () => {
    const annotations = [
      makeAnnotation("ann-1", 0, 8, secondaryLabel.id),
      makeAnnotation("ann-2", 2, 6, secondaryLabel.id),
      makeAnnotation("ann-3", 8, 12, label.id),
    ];

    expect(buildAnnotationById(annotations).get("ann-2")?.start).toBe(2);
    expect(buildUnderlineLaneByAnnotation(annotations, [label, secondaryLabel], label.id).laneByAnnotationId).toEqual({
      "ann-1": 0,
      "ann-2": 1,
    });
  });

  it("merges inline rects and filters viewport boxes", () => {
    expect(
      mergeInlineRects([
        { left: 1, right: 5, top: 2, bottom: 10, width: 4, height: 8 },
        { left: 5.5, right: 9, top: 2.5, bottom: 10.5, width: 3.5, height: 8 },
        { left: 1, right: 4, top: 20, bottom: 28, width: 3, height: 8 },
      ]),
    ).toEqual([
      { left: 1, right: 9, top: 2, bottom: 10 },
      { left: 1, right: 4, top: 20, bottom: 28 },
    ]);
    expect(isBoxInViewport({ left: 10, top: 10, width: 5, height: 5 }, { left: 0, top: 0, right: 20, bottom: 20 })).toBe(
      true,
    );
    expect(
      isBoxInViewport({ left: 30, top: 10, width: 5, height: 5 }, { left: 0, top: 0, right: 20, bottom: 20 }),
    ).toBe(false);
  });
});
