import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../../api";
import type { ToastState } from "../../hooks/useToast";
import { throwIfAborted } from "../../query/queryAbort";
import { queryKeys } from "../../query/queryKeys";
import type {
  AnnotationRecord,
  AnnotationSearchItemRecord,
  LabelRecord,
  LabelSurfaceGroupRecord,
} from "../../types";
import { EXAMPLES_BATCH_SIZE } from "./projectShellConstants";
import type { SelectionPreview } from "./projectShellTypes";

type UseProjectExamplesOptions = {
  projectId: string | null;
  focusedLabel: LabelRecord | null;
  selectedAnnotation: AnnotationRecord | null;
  selectionPreview: SelectionPreview | null;
  showToast: (message: string, severity?: ToastState["severity"]) => void;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getNextOffset(page: { offset: number; items: unknown[]; total: number }) {
  const nextOffset = page.offset + page.items.length;
  return nextOffset < page.total ? nextOffset : undefined;
}

export function useProjectExamples({
  projectId,
  focusedLabel,
  selectedAnnotation,
  selectionPreview,
  showToast,
}: UseProjectExamplesOptions) {
  const [sameLabelExampleDetails, setSameLabelExampleDetails] = useState<Record<string, AnnotationSearchItemRecord[]>>({});
  const excludedSelectedAnnotationId =
    focusedLabel && selectedAnnotation?.label_id === focusedLabel.id ? selectedAnnotation.id : null;

  const sameSurfaceTarget = useMemo(() => {
    return selectionPreview && selectionPreview.text.trim()
      ? {
          text: selectionPreview.text,
          annotationId: null,
          labelId: focusedLabel?.id ?? null,
        }
      : selectedAnnotation
        ? {
            text: selectedAnnotation.span_text,
            annotationId: selectedAnnotation.id,
            labelId: selectedAnnotation.label_id,
          }
        : null;
  }, [focusedLabel?.id, selectedAnnotation, selectionPreview]);

  const sameLabelExamplesQuery = useInfiniteQuery({
    queryKey: queryKeys.sameLabelExamples(
      projectId,
      focusedLabel?.id ?? null,
      excludedSelectedAnnotationId,
    ),
    enabled: Boolean(projectId && focusedLabel),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      if (!projectId || !focusedLabel) {
        return {
          items: [] as LabelSurfaceGroupRecord[],
          total: 0,
          offset: 0,
          limit: EXAMPLES_BATCH_SIZE,
          status: "all",
          context_window: 16,
        };
      }
      throwIfAborted(signal);
      try {
        const response = await api.listLabelSurfaceGroups(
          projectId,
          focusedLabel.id,
          {
            offset: pageParam,
            limit: EXAMPLES_BATCH_SIZE,
            status: "all",
            contextWindow: 16,
            excludeAnnotationId: excludedSelectedAnnotationId,
          },
          signal,
        );
        throwIfAborted(signal);
        return response;
      } catch (error) {
        if (signal.aborted) {
          throwIfAborted(signal);
        }
        throw error;
      }
    },
    getNextPageParam: getNextOffset,
  });

  const sameSurfaceExamplesQuery = useInfiniteQuery({
    queryKey: queryKeys.sameSurfaceExamples(
      projectId,
      sameSurfaceTarget?.text ?? null,
      sameSurfaceTarget?.labelId ?? null,
      sameSurfaceTarget?.annotationId ?? null,
    ),
    enabled: Boolean(projectId && sameSurfaceTarget),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      if (!projectId || !sameSurfaceTarget) {
        return {
          items: [] as AnnotationSearchItemRecord[],
          total: 0,
          offset: 0,
          limit: EXAMPLES_BATCH_SIZE,
          text: "",
          status: "all",
          context_window: 16,
          label_id: null,
          exclude_annotation_id: null,
        };
      }
      throwIfAborted(signal);
      try {
        const response = await api.searchAnnotations(
          projectId,
          {
            text: sameSurfaceTarget.text,
            status: "all",
            labelId: sameSurfaceTarget.labelId ?? null,
            excludeAnnotationId: sameSurfaceTarget.annotationId ?? null,
            offset: pageParam,
            limit: EXAMPLES_BATCH_SIZE,
            contextWindow: 16,
          },
          signal,
        );
        throwIfAborted(signal);
        return response;
      } catch (error) {
        if (signal.aborted) {
          throwIfAborted(signal);
        }
        throw error;
      }
    },
    getNextPageParam: getNextOffset,
  });

  useEffect(() => {
    setSameLabelExampleDetails({});
  }, [projectId, focusedLabel?.id, selectedAnnotation?.id]);

  useEffect(() => {
    if (sameLabelExamplesQuery.error instanceof Error) {
      showToast(sameLabelExamplesQuery.error.message, "error");
    }
  }, [sameLabelExamplesQuery.error, sameLabelExamplesQuery.errorUpdatedAt, showToast]);

  useEffect(() => {
    if (sameSurfaceExamplesQuery.error instanceof Error) {
      showToast(sameSurfaceExamplesQuery.error.message, "error");
    }
  }, [sameSurfaceExamplesQuery.error, sameSurfaceExamplesQuery.errorUpdatedAt, showToast]);

  const sameLabelExamples = useMemo(
    () => sameLabelExamplesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [sameLabelExamplesQuery.data],
  );
  const sameSurfaceExamples = useMemo(
    () => sameSurfaceExamplesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [sameSurfaceExamplesQuery.data],
  );
  const sameLabelExamplesTotal = sameLabelExamplesQuery.data?.pages[0]?.total ?? 0;
  const sameSurfaceExamplesTotal = sameSurfaceExamplesQuery.data?.pages[0]?.total ?? 0;

  async function loadSameLabelExamples(reset: boolean) {
    if (!projectId || !focusedLabel) {
      return;
    }
    if (reset) {
      await sameLabelExamplesQuery.refetch();
      return;
    }
    if (!sameLabelExamplesQuery.hasNextPage || sameLabelExamplesQuery.isFetchingNextPage) {
      return;
    }
    await sameLabelExamplesQuery.fetchNextPage({ cancelRefetch: true });
  }

  async function loadSameSurfaceExamples(reset: boolean) {
    if (!projectId || !sameSurfaceTarget) {
      return;
    }
    if (reset) {
      await sameSurfaceExamplesQuery.refetch();
      return;
    }
    if (!sameSurfaceExamplesQuery.hasNextPage || sameSurfaceExamplesQuery.isFetchingNextPage) {
      return;
    }
    await sameSurfaceExamplesQuery.fetchNextPage({ cancelRefetch: true });
  }

  async function ensureSameLabelDetails(surfaceKey: string, surfaceText: string, duplicateCount: number) {
    if (!projectId || !focusedLabel || sameLabelExampleDetails[surfaceKey]) {
      return;
    }
    try {
      const response = await api.searchAnnotations(projectId, {
        text: surfaceText,
        status: "all",
        labelId: focusedLabel.id,
        excludeAnnotationId: excludedSelectedAnnotationId,
        limit: Math.min(Math.max(duplicateCount, EXAMPLES_BATCH_SIZE), EXAMPLES_BATCH_SIZE * 3),
        contextWindow: 42,
      });
      setSameLabelExampleDetails((current) => ({
        ...current,
        [surfaceKey]: response.items,
      }));
    } catch {
      // hover 時の補助表示なので失敗は黙って握る
    }
  }

  return {
    sameLabelExamples,
    sameLabelExamplesTotal,
    sameLabelExamplesOffset: sameLabelExamples.length,
    sameLabelExamplesLoadingMore: sameLabelExamplesQuery.isPending || sameLabelExamplesQuery.isFetchingNextPage,
    sameLabelExampleDetails,
    sameSurfaceExamples,
    sameSurfaceExamplesTotal,
    sameSurfaceExamplesOffset: sameSurfaceExamples.length,
    sameSurfaceExamplesLoadingMore: sameSurfaceExamplesQuery.isPending || sameSurfaceExamplesQuery.isFetchingNextPage,
    sameSurfaceTargetLabelId: sameSurfaceTarget?.labelId ?? null,
    loadSameLabelExamples,
    loadSameSurfaceExamples,
    ensureSameLabelDetails,
  };
}
