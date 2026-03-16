import { describe, expect, it } from "vitest";
import { parseBulkAnnotationPayload } from "../features/project-shell/annotationBulkImport";
import type { LabelRecord } from "../types";

const labels: LabelRecord[] = [
  {
    id: "label-symptom",
    project_id: "project-1",
    project_name: "Medical NER",
    name: "症状",
    color: "#e74c3c",
    description: "",
    shortcut: null,
    meta: {},
  },
  {
    id: "label-disease",
    project_id: "project-1",
    project_name: "Medical NER",
    name: "疾患",
    color: "#2980b9",
    description: "",
    shortcut: null,
    meta: {},
  },
];

describe("parseBulkAnnotationPayload", () => {
  it("accepts valid payload and resolves label_name to label_id", () => {
    const result = parseBulkAnnotationPayload(
      {
        annotations: [
          {
            label_name: "症状",
            start: 0,
            end: 2,
            span_text: "頭痛",
          },
        ],
      },
      {
        labels,
        existingAnnotations: [],
      },
    );

    expect(result.issues).toEqual([]);
    expect(result.annotations).toEqual([
      {
        label_id: "label-symptom",
        start: 0,
        end: 2,
        span_text: "頭痛",
        comment: "",
        status: "pending",
        meta: {},
      },
    ]);
  });

  it("rejects payload when range is invalid", () => {
    const result = parseBulkAnnotationPayload(
      [
        {
          label_id: "label-symptom",
          start: 2,
          end: 1,
          span_text: "頭痛",
          status: "pending",
        },
      ],
      {
        labels,
        existingAnnotations: [],
      },
    );

    expect(result.annotations).toEqual([]);
    expect(result.issues).toContain("annotations[0] の範囲が不正である");
  });

  it("rejects overlap with existing annotations in the same label", () => {
    const result = parseBulkAnnotationPayload(
      {
        annotations: [
          {
            label_id: "label-symptom",
            start: 1,
            end: 3,
            span_text: "痛あ",
            status: "pending",
          },
        ],
      },
      {
        labels,
        existingAnnotations: [
          {
            label_id: "label-symptom",
            start: 0,
            end: 2,
          },
        ],
      },
    );

    expect(result.annotations).toEqual([]);
    expect(result.issues).toContain("annotations[0] は同一 label 内で既存または投入 payload と範囲が重複している");
  });

  it("rejects overlap within payload even when ranges arrive out of order", () => {
    const result = parseBulkAnnotationPayload(
      {
        annotations: [
          {
            label_id: "label-symptom",
            start: 4,
            end: 6,
            span_text: "あり",
          },
          {
            label_id: "label-symptom",
            start: 1,
            end: 5,
            span_text: "痛あり",
          },
        ],
      },
      {
        labels,
        existingAnnotations: [],
      },
    );

    expect(result.annotations).toEqual([
      {
        label_id: "label-symptom",
        start: 4,
        end: 6,
        span_text: "あり",
        comment: "",
        status: "pending",
        meta: {},
      },
    ]);
    expect(result.issues).toContain("annotations[1] は同一 label 内で既存または投入 payload と範囲が重複している");
  });
});
