import { describe, expect, it, vi } from "vitest";
import { DOCUMENT_WINDOW_SIZE } from "../features/project-shell/projectShellConstants";
import {
  collectDocumentNames,
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

describe("collectDocumentNames", () => {
  it("rejects non-positive page size", async () => {
    const fetchPage = vi.fn();

    await expect(collectDocumentNames(4, 0, fetchPage)).rejects.toThrow("pageSize must be a positive integer");
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("fetches names in pages until all known documents are collected", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        documents: [makeDocument("doc-1"), makeDocument("doc-2")],
        total: 4,
        pending_total: 4,
        offset: 0,
        limit: 2,
        search: "",
        sort: "created",
      })
      .mockResolvedValueOnce({
        documents: [makeDocument("doc-3"), makeDocument("doc-4")],
        total: 4,
        pending_total: 4,
        offset: 2,
        limit: 2,
        search: "",
        sort: "created",
      });

    await expect(collectDocumentNames(4, 2, fetchPage)).resolves.toEqual([
      "Document doc-1",
      "Document doc-2",
      "Document doc-3",
      "Document doc-4",
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it("stops early when the backend returns a short final page", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      documents: [makeDocument("doc-1")],
      total: 10,
      pending_total: 10,
      offset: 0,
      limit: 2,
      search: "",
      sort: "created",
    });

    await expect(collectDocumentNames(10, 2, fetchPage)).resolves.toEqual(["Document doc-1"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
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
