import { describe, expect, it } from "vitest";
import type { DocumentRecord, ProjectRecord } from "../api-contract";
import {
  documentMatchesSearch,
  getDocumentSnippetParts,
  getProjectGuideline,
  parseAnnotationMetaDraft,
  setProjectGuideline,
} from "../utils";

function makeDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc-1",
    project_id: "project-1",
    project_name: "Project 1",
    document_name: "Document 1",
    text: "Alpha beta gamma delta epsilon zeta",
    status: "pending",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-02T00:00:00Z",
    annotations: [],
    meta: {},
    ...overrides,
  };
}

describe("parseAnnotationMetaDraft", () => {
  it("accepts JSON object", () => {
    expect(parseAnnotationMetaDraft('{ "note": "ok", "count": 2 }')).toEqual({
      valid: true,
      value: { note: "ok", count: 2 },
      error: null,
    });
  });

  it("accepts null", () => {
    expect(parseAnnotationMetaDraft("null")).toEqual({
      valid: true,
      value: null,
      error: null,
    });
  });

  it("rejects arrays", () => {
    expect(parseAnnotationMetaDraft("[1, 2, 3]")).toEqual({
      valid: false,
      value: undefined,
      error: "Meta は JSON object または null を入力する",
    });
  });

  it("rejects invalid JSON", () => {
    expect(parseAnnotationMetaDraft("{ invalid")).toEqual({
      valid: false,
      value: undefined,
      error: "Meta は有効な JSON を入力する",
    });
  });
});

describe("project guideline helpers", () => {
  it("reads and writes guideline in project meta", () => {
    const project: ProjectRecord = {
      id: "project-1",
      name: "Project 1",
      description: "desc",
      meta: { keep: true },
      created_at: "2026-03-01T00:00:00Z",
    };

    setProjectGuideline(project, "Guideline text");

    expect(getProjectGuideline(project)).toBe("Guideline text");
    expect(project.meta).toEqual({ keep: true, guideline: "Guideline text" });
  });
});

describe("document search helpers", () => {
  it("matches text case-insensitively", () => {
    const document = makeDocument();
    expect(documentMatchesSearch(document, "BETA GAMMA")).toBe(true);
    expect(documentMatchesSearch(document, "theta")).toBe(false);
  });

  it("highlights only the matched fragment in snippet parts", () => {
    const document = makeDocument();
    expect(getDocumentSnippetParts(document, "gamma")).toEqual([
      { text: "Alpha beta ", highlighted: false },
      { text: "gamma", highlighted: true },
      { text: " delta epsilon zeta", highlighted: false },
    ]);
  });
});
