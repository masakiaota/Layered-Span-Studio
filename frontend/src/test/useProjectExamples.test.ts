import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { useProjectExamples } from "../features/project-shell/useProjectExamples";
import type { SelectionPreview } from "../features/project-shell/projectShellTypes";
import { createQueryWrapper } from "./queryTestUtils";
import type {
  AnnotationRecord,
  AnnotationSearchItemRecord,
  LabelRecord,
  LabelSurfaceGroupRecord,
} from "../types";

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

const nextFocusedLabel: LabelRecord = {
  ...focusedLabel,
  id: "label-2",
  name: "Other",
};

const nextSelectionPreview: SelectionPreview = {
  ...selectionPreview,
  text: "Bob",
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
    vi.spyOn(api, "listLabelSurfaceGroups").mockImplementation((_projectId, labelId) => {
      return labelId === focusedLabel.id ? staleRequest.promise : latestRequest.promise;
    });

    const showToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ label }) =>
        useProjectExamples({
          projectId: "project-1",
          focusedLabel: label,
          selectedAnnotation: null,
          selectionPreview: null,
          showToast,
        }),
      {
        initialProps: { label: focusedLabel },
        wrapper: createQueryWrapper(),
      },
    );

    expect(result.current.sameLabelExamplesLoadingMore).toBe(true);

    rerender({ label: nextFocusedLabel });
    expect(result.current.sameLabelExamplesLoadingMore).toBe(true);

    await act(async () => {
      staleRequest.reject(new Error("stale label examples failed"));
      await staleRequest.promise.catch(() => undefined);
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
      await latestRequest.promise;
    });

    await waitFor(() => {
      expect(result.current.sameLabelExamplesLoadingMore).toBe(false);
      expect(result.current.sameLabelExamples).toEqual([createLabelSurfaceGroup({ surface_text: "Bob" })]);
    });
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
    vi.spyOn(api, "searchAnnotations").mockImplementation((_projectId, options) => {
      return options.text === selectionPreview.text ? staleRequest.promise : latestRequest.promise;
    });

    const showToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ preview }) =>
        useProjectExamples({
          projectId: "project-1",
          focusedLabel: null,
          selectedAnnotation: null,
          selectionPreview: preview,
          showToast,
        }),
      {
        initialProps: { preview: selectionPreview },
        wrapper: createQueryWrapper(),
      },
    );

    expect(result.current.sameSurfaceExamplesLoadingMore).toBe(true);

    rerender({ preview: nextSelectionPreview });
    expect(result.current.sameSurfaceExamplesLoadingMore).toBe(true);

    await act(async () => {
      staleRequest.reject(new Error("stale surface examples failed"));
      await staleRequest.promise.catch(() => undefined);
    });

    expect(result.current.sameSurfaceExamplesLoadingMore).toBe(true);
    expect(showToast).not.toHaveBeenCalledWith("stale surface examples failed", "error");

    latestRequest.resolve({
      items: [createAnnotationSearchItem({ annotation_id: "ann-2", span_text: "Bob" })],
      total: 2,
      offset: 1,
      limit: 8,
      text: "Bob",
      status: "all",
      context_window: 16,
      label_id: null,
      exclude_annotation_id: null,
    });

    await act(async () => {
      await latestRequest.promise;
    });

    await waitFor(() => {
      expect(result.current.sameSurfaceExamplesLoadingMore).toBe(false);
      expect(result.current.sameSurfaceExamples).toEqual([
        createAnnotationSearchItem({ annotation_id: "ann-2", span_text: "Bob" }),
      ]);
    });
  });
});
