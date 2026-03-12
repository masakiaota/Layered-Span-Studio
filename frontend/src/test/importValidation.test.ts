import { describe, expect, it } from "vitest";
import {
  buildImportValidationMessage,
  describeImportSummary,
  validateImportPayload,
} from "../importValidation";

describe("validateImportPayload", () => {
  it("accepts a structurally valid payload and returns summary", () => {
    const payload = {
      project: { name: "Project A" },
      labels: [{ name: "Disease", color: "#ff0000", description: "desc" }],
      documents: [
        {
          document_name: "Doc 1",
          text: "text",
          annotations: [{ id: "a1" }, { id: "a2" }],
        },
      ],
    };

    expect(validateImportPayload(payload)).toEqual({
      issues: [],
      summary: {
        labelCount: 1,
        documentCount: 1,
        annotationCount: 2,
      },
    });
  });

  it("reports malformed top-level sections", () => {
    expect(validateImportPayload({ labels: [], documents: [] }).issues).toContain("`project` が object でない");
    expect(validateImportPayload({ project: {}, documents: [] }).issues).toContain("`labels` が配列でない");
    expect(validateImportPayload({ project: {}, labels: [] }).issues).toContain("`documents` が配列でない");
  });

  it("reports duplicate label names in payload and existing labels", () => {
    const payload = {
      project: { name: "Project A" },
      labels: [
        { name: "Disease", color: "#ff0000", description: "desc" },
        { name: "Disease", color: "#00ff00", description: "desc" },
      ],
      documents: [],
    };

    const issues = validateImportPayload(payload, { existingLabelNames: ["Disease"] }).issues;

    expect(issues).toContain("label 名が payload 内で重複している: Disease");
    expect(issues).toContain("既存 label と重複している: Disease");
  });

  it("reports duplicate document names in payload and existing documents", () => {
    const payload = {
      project: { name: "Project A" },
      labels: [],
      documents: [
        { document_name: "Doc 1", text: "text", annotations: [] },
        { document_name: "Doc 1", text: "text", annotations: [] },
      ],
    };

    const issues = validateImportPayload(payload, { existingDocumentNames: ["Doc 1"] }).issues;

    expect(issues).toContain("document 名が payload 内で重複している: Doc 1");
    expect(issues).toContain("既存 document と重複している: Doc 1");
  });
});

describe("import validation helpers", () => {
  it("formats issue preview compactly", () => {
    expect(buildImportValidationMessage(["a", "b", "c", "d"])).toBe("a / b / c / 他 1 件");
  });

  it("describes summary counts", () => {
    expect(
      describeImportSummary({
        labelCount: 2,
        documentCount: 3,
        annotationCount: 8,
      }),
    ).toBe("Label 2 件 / Document 3 件 / Annotation 8 件");
  });
});
