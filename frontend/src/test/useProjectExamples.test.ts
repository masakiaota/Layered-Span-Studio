import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { useProjectExamples } from "../features/project-shell/useProjectExamples";
import type { SelectionPreview } from "../features/project-shell/projectShellTypes";
import type {
  AnnotationRecord,
  AnnotationSearchItemRecord,
  LabelRecord,
  LabelSurfaceGroupRecord,
} from "../api-contract";

const focusedLabel: LabelRecord = {
  id: "label-1",
  project_id: "project-1",
  project_name: "Test Project",
  name: "Entity",
  color: "#e74c3c",
  description: "",
  shortcut: null,
  meta: {},
};

const selectedAnnotation: AnnotationRecord = {
  id: "ann-1",
  document_id: "doc-1",
  document_name: "Doc 1",
  label_id: "label-1",
  label_name: "Entity",
  start: 0,
  end: 5,
  span_text: "Alice",
  comment: "",
  status: "pending",
  meta: {},
};

const selectionPreview: SelectionPreview = {
  start: 0,
  end: 5,
  text: "Alice",
};

function createLabelSurfaceGroup(
  overrides: Partial<LabelSurfaceGroupRecord> = {},
): LabelSurfaceGroupRecord {
  return {
    surface_text: "Alice",
    duplicate_count: 1,
    representative: {
      annotation_id: "ann-1",
      document_id: "doc-1",
      document_name: "Doc 1",
      span_text: "Alice",
      start: 0,
      end: 5,
      status: "verified",
      context_before: "",
      context_after: " went home",
    },
    ...overrides,
  };
}

function createAnnotationSearchItem(
  overrides: Partial<AnnotationSearchItemRecord> = {},
): AnnotationSearchItemRecord {
  return {
    annotation_id: "ann-1",
    document_id: "doc-1",
    document_name: "Doc 1",
    label_id: "label-1",
    label_name: "Entity",
    label_color: "#e74c3c",
    start: 0,
    end: 5,
    span_text: "Alice",
    status: "verified",
    context_before: "",
    context_after: " went home",
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useProjectExamples", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("suppresses stale sameLabelExamples errors while a newer request is still pending", async () => {
    const staleRequest = createDeferred<{
      items: LabelSurfaceGroupRecord[];
      total: number;
      offset: number;
      limit: number;
      status: string;
      context_window: number;
      exclude_annotation_id?: string | null;
    }>();
    const latestRequest = createDeferred<{
      items: LabelSurfaceGroupRecord[];
      total: number;
      offset: number;
      limit: number;
      status: string;
      context_window: number;
      exclude_annotation_id?: string | null;
    }>();
    vi.spyOn(api, "listLabelSurfaceGroups")
      .mockResolvedValueOnce({
        items: [createLabelSurfaceGroup()],
        total: 2,
        offset: 0,
        limit: 8,
        status: "all",
        context_window: 16,
      })
      .mockReturnValueOnce(staleRequest.promise)
      .mockReturnValueOnce(latestRequest.promise);

    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useProjectExamples({
        projectId: "project-1",
        focusedLabel,
        selectedAnnotation: null,
        selectionPreview: null,
        showToast,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    let staleLoad!: Promise<void>;
    let latestLoad!: Promise<void>;

    act(() => {
      staleLoad = result.current.loadSameLabelExamples(false);
    });
    act(() => {
      latestLoad = result.current.loadSameLabelExamples(false);
    });

    expect(result.current.sameLabelExamplesLoadingMore).toBe(true);

    staleRequest.reject(new Error("stale label examples failed"));

    await act(async () => {
      await staleLoad;
    });

    expect(result.current.sameLabelExamplesLoadingMore).toBe(true);
    expect(showToast).not.toHaveBeenCalledWith("stale label examples failed", "error");

    latestRequest.resolve({
      items: [createLabelSurfaceGroup({ surface_text: "Bob" })],
      total: 2,
      offset: 1,
      limit: 8,
      status: "all",
      context_window: 16,
    });

    await act(async () => {
      await latestLoad;
    });

    expect(result.current.sameLabelExamplesLoadingMore).toBe(false);
  });

  it("suppresses stale sameSurfaceExamples errors while a newer request is still pending", async () => {
    const staleRequest = createDeferred<{
      items: AnnotationSearchItemRecord[];
      total: number;
      offset: number;
      limit: number;
      text: string;
      status: string;
      context_window: number;
      label_id?: string | null;
      exclude_annotation_id?: string | null;
    }>();
    const latestRequest = createDeferred<{
      items: AnnotationSearchItemRecord[];
      total: number;
      offset: number;
      limit: number;
      text: string;
      status: string;
      context_window: number;
      label_id?: string | null;
      exclude_annotation_id?: string | null;
    }>();
    vi.spyOn(api, "searchAnnotations")
      .mockResolvedValueOnce({
        items: [createAnnotationSearchItem()],
        total: 2,
        offset: 0,
        limit: 8,
        text: "Alice",
        status: "all",
        context_window: 16,
        label_id: null,
        exclude_annotation_id: null,
      })
      .mockReturnValueOnce(staleRequest.promise)
      .mockReturnValueOnce(latestRequest.promise);

    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useProjectExamples({
        projectId: "project-1",
        focusedLabel: null,
        selectedAnnotation: null,
        selectionPreview,
        showToast,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    let staleLoad!: Promise<void>;
    let latestLoad!: Promise<void>;

    act(() => {
      staleLoad = result.current.loadSameSurfaceExamples(false);
    });
    act(() => {
      latestLoad = result.current.loadSameSurfaceExamples(false);
    });

    expect(result.current.sameSurfaceExamplesLoadingMore).toBe(true);

    staleRequest.reject(new Error("stale surface examples failed"));

    await act(async () => {
      await staleLoad;
    });

    expect(result.current.sameSurfaceExamplesLoadingMore).toBe(true);
    expect(showToast).not.toHaveBeenCalledWith("stale surface examples failed", "error");

    latestRequest.resolve({
      items: [createAnnotationSearchItem({ annotation_id: "ann-2", span_text: "Bob" })],
      total: 2,
      offset: 1,
      limit: 8,
      text: "Alice",
      status: "all",
      context_window: 16,
      label_id: null,
      exclude_annotation_id: null,
    });

    await act(async () => {
      await latestLoad;
    });

    expect(result.current.sameSurfaceExamplesLoadingMore).toBe(false);
  });
});
