import { describe, expect, it } from "vitest";
import { DOCUMENT_WINDOW_SIZE } from "../features/project-shell/projectShellConstants";
import {
  isHexColor,
  mergeDocumentWindow,
  normalizeHexColor,
  trimDocumentWindow,
} from "../features/project-shell/projectShellUtils";
import type { DocumentListItem } from "../types";

function makeDocument(id: string): DocumentListItem {
  return {
    id,
    project_id: "project-1",
    project_name: "Project 1",
    document_name: `Document ${id}`,
    text: `text ${id}`,
    status: "pending",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-02T00:00:00Z",
    meta: {},
  };
}

describe("color helpers", () => {
  it("normalizes hex color with or without prefix", () => {
    expect(normalizeHexColor("AABBCC")).toBe("#aabbcc");
    expect(normalizeHexColor("#DDEEFF")).toBe("#ddeeff");
  });

  it("validates normalized hex color", () => {
    expect(isHexColor("112233")).toBe(true);
    expect(isHexColor("#112233")).toBe(true);
    expect(isHexColor("#xyzxyz")).toBe(false);
  });
});

describe("document window helpers", () => {
  it("trims overflow while preserving selected document", () => {
    const items = Array.from({ length: DOCUMENT_WINDOW_SIZE + 2 }, (_, index) => makeDocument(`doc-${index}`));

    const trimmed = trimDocumentWindow(items, "doc-121");

    expect(trimmed).toHaveLength(DOCUMENT_WINDOW_SIZE);
    expect(trimmed.some((item) => item.id === "doc-121")).toBe(true);
    expect(trimmed.some((item) => item.id === "doc-0")).toBe(false);
    expect(trimmed.some((item) => item.id === "doc-1")).toBe(false);
  });

  it("merges incoming items by id and caps the window size", () => {
    const existing = Array.from({ length: DOCUMENT_WINDOW_SIZE - 1 }, (_, index) => makeDocument(`doc-${index}`));
    const incoming = [
      { ...makeDocument("doc-2"), document_name: "Updated doc-2" },
      makeDocument("doc-new"),
    ];

    const merged = mergeDocumentWindow(existing, incoming, "doc-new");

    expect(merged).toHaveLength(DOCUMENT_WINDOW_SIZE);
    expect(merged.find((item) => item.id === "doc-2")?.document_name).toBe("Updated doc-2");
    expect(merged.some((item) => item.id === "doc-new")).toBe(true);
  });
});
