import { useCallback, useEffect, useMemo, useState } from "react";
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

type ExamplePage<T> = {
  items: T[];
  total: number;
  offset: number;
};

export type ExampleFeedState<T> = {
  items: T[];
  total: number;
  hasNextPage: boolean;
  isPending: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<void>;
};

export type ProjectExamplesState = {
  sameLabel: ExampleFeedState<LabelSurfaceGroupRecord>;
  sameLabelDetails: Record<string, AnnotationSearchItemRecord[]>;
  ensureSameLabelDetails: (surfaceKey: string, surfaceText: string, duplicateCount: number) => Promise<void>;
  sameSurface: ExampleFeedState<AnnotationSearchItemRecord>;
  sameSurfaceTargetLabelId: string | null;
};

function getNextOffset<T>(page: ExamplePage<T>) {
  const nextOffset = page.offset + page.items.length;
  return nextOffset < page.total ? nextOffset : undefined;
}

function flattenItems<T>(pages: Array<{ items: T[] }> | undefined) {
  return pages?.flatMap((page) => page.items) ?? [];
}

export function useProjectExamples({
  projectId,
  focusedLabel,
  selectedAnnotation,
  selectionPreview,
  showToast,
}: UseProjectExamplesOptions): ProjectExamplesState {
  const [sameLabelDetails, setSameLabelDetails] = useState<Record<string, AnnotationSearchItemRecord[]>>({});
  const excludedAnnotationId =
    focusedLabel && selectedAnnotation?.label_id === focusedLabel.id ? selectedAnnotation.id : null;

  const sameSurfaceTarget = useMemo(() => {
    if (selectionPreview && selectionPreview.text.trim()) {
      return {
        text: selectionPreview.text,
        annotationId: null,
        labelId: focusedLabel?.id ?? null,
      };
    }
    if (!selectedAnnotation) {
      return null;
    }
    return {
      text: selectedAnnotation.span_text,
      annotationId: selectedAnnotation.id,
      labelId: selectedAnnotation.label_id,
    };
  }, [focusedLabel?.id, selectedAnnotation, selectionPreview]);

  const sameLabelQuery = useInfiniteQuery({
    queryKey: queryKeys.sameLabelExamples(projectId, focusedLabel?.id ?? null, excludedAnnotationId),
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
      const response = await api.listLabelSurfaceGroups(
        projectId,
        focusedLabel.id,
        {
          offset: pageParam,
          limit: EXAMPLES_BATCH_SIZE,
          status: "all",
          contextWindow: 16,
          excludeAnnotationId: excludedAnnotationId,
        },
        signal,
      );
      throwIfAborted(signal);
      return response;
    },
    getNextPageParam: getNextOffset,
  });

  const sameSurfaceQuery = useInfiniteQuery({
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
    },
    getNextPageParam: getNextOffset,
  });

  useEffect(() => {
    setSameLabelDetails({});
  }, [projectId, focusedLabel?.id, selectedAnnotation?.id]);

  useEffect(() => {
    if (sameLabelQuery.error instanceof Error) {
      showToast(sameLabelQuery.error.message, "error");
    }
  }, [sameLabelQuery.error, sameLabelQuery.errorUpdatedAt, showToast]);

  useEffect(() => {
    if (sameSurfaceQuery.error instanceof Error) {
      showToast(sameSurfaceQuery.error.message, "error");
    }
  }, [sameSurfaceQuery.error, sameSurfaceQuery.errorUpdatedAt, showToast]);

  const fetchNextSameLabelPage = useCallback(async () => {
    if (!sameLabelQuery.hasNextPage || sameLabelQuery.isFetchingNextPage) {
      return;
    }
    await sameLabelQuery.fetchNextPage({ cancelRefetch: true });
  }, [sameLabelQuery]);

  const fetchNextSameSurfacePage = useCallback(async () => {
    if (!sameSurfaceQuery.hasNextPage || sameSurfaceQuery.isFetchingNextPage) {
      return;
    }
    await sameSurfaceQuery.fetchNextPage({ cancelRefetch: true });
  }, [sameSurfaceQuery]);

  const ensureSameLabelDetails = useCallback(
    async (surfaceKey: string, surfaceText: string, duplicateCount: number) => {
      if (!projectId || !focusedLabel || sameLabelDetails[surfaceKey]) {
        return;
      }
      try {
        const response = await api.searchAnnotations(projectId, {
          text: surfaceText,
          status: "all",
          labelId: focusedLabel.id,
          excludeAnnotationId: excludedAnnotationId,
          limit: Math.min(Math.max(duplicateCount, EXAMPLES_BATCH_SIZE), EXAMPLES_BATCH_SIZE * 3),
          contextWindow: 42,
        });
        setSameLabelDetails((current) => ({
          ...current,
          [surfaceKey]: response.items,
        }));
      } catch {
        // hover 時の補助表示なので失敗は黙って握る
      }
    },
    [excludedAnnotationId, focusedLabel, projectId, sameLabelDetails],
  );

  return {
    sameLabel: {
      items: flattenItems(sameLabelQuery.data?.pages),
      total: sameLabelQuery.data?.pages[0]?.total ?? 0,
      hasNextPage: Boolean(sameLabelQuery.hasNextPage),
      isPending: sameLabelQuery.isPending,
      isFetchingNextPage: sameLabelQuery.isFetchingNextPage,
      fetchNextPage: fetchNextSameLabelPage,
    },
    sameLabelDetails,
    ensureSameLabelDetails,
    sameSurface: {
      items: flattenItems(sameSurfaceQuery.data?.pages),
      total: sameSurfaceQuery.data?.pages[0]?.total ?? 0,
      hasNextPage: Boolean(sameSurfaceQuery.hasNextPage),
      isPending: sameSurfaceQuery.isPending,
      isFetchingNextPage: sameSurfaceQuery.isFetchingNextPage,
      fetchNextPage: fetchNextSameSurfacePage,
    },
    sameSurfaceTargetLabelId: sameSurfaceTarget?.labelId ?? null,
  };
}
