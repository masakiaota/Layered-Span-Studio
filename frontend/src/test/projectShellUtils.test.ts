import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LABEL_COLOR,
  DOCUMENT_PAGE_SIZE,
  DOCUMENT_WINDOW_SIZE,
} from "../features/project-shell/projectShellConstants";
import {
  collectDocumentNames,
  createEmptyLabelDraft,
  findConflictingLabelName,
  isHexColor,
  mergeDocumentListRefresh,
  mergeDocumentWindow,
  normalizeHexColor,
  submitLabelDraft,
  toLabelDraft,
  trimDocumentWindow,
} from "../features/project-shell/projectShellUtils";
import type { LabelRecord, ProjectRecord } from "../api-contract";
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

const project: Pick<ProjectRecord, "id" | "name"> = {
  id: "project-1",
  name: "Project 1",
};

function makeLabel(id: string, name: string, shortcut: string | null = null): LabelRecord {
  return {
    id,
    project_id: project.id,
    project_name: project.name,
    name,
    color: "#112233",
    description: "",
    shortcut,
    meta: {},
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("label draft helpers", () => {
  it("creates an empty label draft", () => {
    expect(createEmptyLabelDraft()).toEqual({
      id: "",
      name: "",
      color: DEFAULT_LABEL_COLOR,
      description: "",
    });
  });

  it("converts a label record into an editable draft", () => {
    const label: LabelRecord = {
      id: "label-1",
      project_id: "project-1",
      project_name: "Project 1",
      name: "Disease",
      color: "#112233",
      description: "desc",
      shortcut: "1",
      meta: {},
    };

    expect(toLabelDraft(label)).toEqual({
      id: "label-1",
      name: "Disease",
      color: "#112233",
      description: "desc",
    });
  });

  it("finds conflicting label names while ignoring the currently edited label", () => {
    const labels: Array<Pick<LabelRecord, "id" | "name">> = [
      { id: "label-1", name: "Disease" },
      { id: "label-2", name: "Finding" },
    ];

    expect(findConflictingLabelName(labels, { id: "label-1", name: "Disease" })).toBeNull();
    expect(findConflictingLabelName(labels, { id: "label-1", name: " Finding " })).toEqual({
      id: "label-2",
      name: "Finding",
    });
  });

  it("submits a new label with normalized values", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);

    const result = submitLabelDraft(project, [makeLabel("label-1", "Disease", "1")], {
      id: "",
      name: " Finding ",
      color: "AABBCC",
      description: "desc",
    });

    expect(result).toMatchObject({
      status: "submitted",
      label: {
        id: "local-label-4fzzzxjy",
        project_id: "project-1",
        project_name: "Project 1",
        name: "Finding",
        color: "#aabbcc",
        description: "desc",
        shortcut: null,
        meta: {},
      },
    });
    expect(result.status === "submitted" ? result.labels.map((label) => label.name) : []).toEqual([
      "Disease",
      "Finding",
    ]);
  });

  it("updates the edited label and preserves its shortcut", () => {
    const result = submitLabelDraft(project, [makeLabel("label-1", "Disease", "1")], {
      id: "label-1",
      name: " Updated Disease ",
      color: "#445566",
      description: "updated",
    });

    expect(result).toMatchObject({
      status: "submitted",
      label: {
        id: "label-1",
        name: "Updated Disease",
        shortcut: "1",
      },
    });
    expect(result.status === "submitted" ? result.labels : []).toHaveLength(1);
  });

  it("rejects duplicate label names before mutating labels", () => {
    const labels = [makeLabel("label-1", "Disease"), makeLabel("label-2", "Finding")];

    expect(submitLabelDraft(project, labels, {
      id: "label-1",
      name: " Finding ",
      color: "#445566",
      description: "",
    })).toEqual({
      status: "duplicate",
      conflictingLabel: labels[1],
    });
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

  it("prepends first-page refresh results while keeping scrolled documents", () => {
    const current = [makeDocument("doc-40"), makeDocument("doc-41")];
    const refreshedFirstPage = [makeDocument("doc-new"), makeDocument("doc-1")];

    const merged = mergeDocumentListRefresh(current, refreshedFirstPage, 0, null);

    expect(merged.map((item) => item.id)).toEqual(["doc-new", "doc-1", "doc-40", "doc-41"]);
  });

  it("keeps refreshed first-page documents when the scroll window is already full", () => {
    const current = Array.from({ length: DOCUMENT_WINDOW_SIZE }, (_, index) => makeDocument(`doc-${index}`));
    const refreshedFirstPage = [makeDocument("doc-new"), makeDocument("doc-0")];

    const merged = mergeDocumentListRefresh(current, refreshedFirstPage, 0, "doc-119");

    expect(merged.some((item) => item.id === "doc-new")).toBe(true);
    expect(merged.some((item) => item.id === "doc-119")).toBe(true);
    expect(merged).toHaveLength(DOCUMENT_WINDOW_SIZE);
  });

  it("trims remainder overflow from the far end to keep the first-page boundary contiguous", () => {
    const current = Array.from({ length: DOCUMENT_WINDOW_SIZE }, (_, index) => makeDocument(`doc-${index}`));
    const refreshedFirstPage = [
      makeDocument("doc-new"),
      ...Array.from({ length: DOCUMENT_PAGE_SIZE - 1 }, (_, index) => makeDocument(`doc-${index}`)),
    ];

    const merged = mergeDocumentListRefresh(current, refreshedFirstPage, 0, null);
    const boundaryId = `doc-${DOCUMENT_PAGE_SIZE - 1}`;

    expect(merged.some((item) => item.id === "doc-new")).toBe(true);
    expect(merged.some((item) => item.id === boundaryId)).toBe(true);
    expect(merged.some((item) => item.id === "doc-119")).toBe(false);
    expect(merged).toHaveLength(DOCUMENT_WINDOW_SIZE);
  });
});
