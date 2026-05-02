import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import type {
  AnnotationRecord,
  AnnotationSearchItemRecord,
  LabelRecord,
  LabelSurfaceGroupRecord,
} from "../../api-contract";
import type { ToastState } from "../../hooks/useToast";
import { EXAMPLES_BATCH_SIZE } from "./projectShellConstants";
import type { SelectionPreview } from "./projectShellTypes";

type UseProjectExamplesOptions = {
  projectId: string | null;
  focusedLabel: LabelRecord | null;
  selectedAnnotation: AnnotationRecord | null;
  selectedAnnotationExcludeId: string | null;
  selectionPreview: SelectionPreview | null;
  showToast: (message: string, severity?: ToastState["severity"]) => void;
};

export function useProjectExamples({
  projectId,
  focusedLabel,
  selectedAnnotation,
  selectedAnnotationExcludeId,
  selectionPreview,
  showToast,
}: UseProjectExamplesOptions) {
  const [sameLabelExamples, setSameLabelExamples] = useState<LabelSurfaceGroupRecord[]>([]);
  const [sameLabelExamplesTotal, setSameLabelExamplesTotal] = useState(0);
  const [sameLabelExamplesOffset, setSameLabelExamplesOffset] = useState(0);
  const [sameLabelExamplesLoadingMore, setSameLabelExamplesLoadingMore] = useState(false);
  const [sameLabelExampleDetails, setSameLabelExampleDetails] = useState<Record<string, AnnotationSearchItemRecord[]>>({});
  const [sameSurfaceExamples, setSameSurfaceExamples] = useState<AnnotationSearchItemRecord[]>([]);
  const [sameSurfaceExamplesTotal, setSameSurfaceExamplesTotal] = useState(0);
  const [sameSurfaceExamplesOffset, setSameSurfaceExamplesOffset] = useState(0);
  const [sameSurfaceExamplesLoadingMore, setSameSurfaceExamplesLoadingMore] = useState(false);
  const sameLabelExamplesRequestIdRef = useRef(0);
  const sameSurfaceExamplesRequestIdRef = useRef(0);

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
            annotationId: selectedAnnotationExcludeId,
            labelId: selectedAnnotation.label_id,
          }
        : null;
  }, [focusedLabel?.id, selectedAnnotation, selectedAnnotationExcludeId, selectionPreview]);

  async function loadSameLabelExamples(reset: boolean) {
    const requestId = ++sameLabelExamplesRequestIdRef.current;
    if (!focusedLabel || !projectId) {
      setSameLabelExamples([]);
      setSameLabelExamplesTotal(0);
      setSameLabelExamplesOffset(0);
      setSameLabelExamplesLoadingMore(false);
      return;
    }
    setSameLabelExamplesLoadingMore(true);
    try {
      const response = await api.listLabelSurfaceGroups(projectId, focusedLabel.id, {
        offset: reset ? 0 : sameLabelExamplesOffset,
        limit: EXAMPLES_BATCH_SIZE,
        status: "all",
        contextWindow: 16,
        excludeAnnotationId: selectedAnnotation?.label_id === focusedLabel.id ? selectedAnnotationExcludeId : null,
      });
      if (requestId !== sameLabelExamplesRequestIdRef.current) {
        return;
      }
      setSameLabelExamples((current) => (reset ? response.items : [...current, ...response.items]));
      setSameLabelExamplesTotal(response.total);
      setSameLabelExamplesOffset(response.offset + response.items.length);
      if (reset) {
        setSameLabelExampleDetails({});
      }
    } catch (error) {
      if (requestId === sameLabelExamplesRequestIdRef.current) {
        showToast(error instanceof Error ? error.message : "関連例の取得に失敗した", "error");
      }
    } finally {
      if (requestId === sameLabelExamplesRequestIdRef.current) {
        setSameLabelExamplesLoadingMore(false);
      }
    }
  }

  async function loadSameSurfaceExamples(reset: boolean) {
    const requestId = ++sameSurfaceExamplesRequestIdRef.current;
    if (!sameSurfaceTarget || !projectId) {
      setSameSurfaceExamples([]);
      setSameSurfaceExamplesTotal(0);
      setSameSurfaceExamplesOffset(0);
      setSameSurfaceExamplesLoadingMore(false);
      return;
    }
    setSameSurfaceExamplesLoadingMore(true);
    try {
      const response = await api.searchAnnotations(projectId, {
        text: sameSurfaceTarget.text,
        status: "all",
        labelId: sameSurfaceTarget.labelId ?? null,
        excludeAnnotationId: sameSurfaceTarget.annotationId ?? null,
        offset: reset ? 0 : sameSurfaceExamplesOffset,
        limit: EXAMPLES_BATCH_SIZE,
        contextWindow: 16,
      });
      if (requestId !== sameSurfaceExamplesRequestIdRef.current) {
        return;
      }
      setSameSurfaceExamples((current) => (reset ? response.items : [...current, ...response.items]));
      setSameSurfaceExamplesTotal(response.total);
      setSameSurfaceExamplesOffset(response.offset + response.items.length);
    } catch (error) {
      if (requestId === sameSurfaceExamplesRequestIdRef.current) {
        showToast(error instanceof Error ? error.message : "同一表層事例の取得に失敗した", "error");
      }
    } finally {
      if (requestId === sameSurfaceExamplesRequestIdRef.current) {
        setSameSurfaceExamplesLoadingMore(false);
      }
    }
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
        excludeAnnotationId: selectedAnnotation?.label_id === focusedLabel.id ? selectedAnnotationExcludeId : null,
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

  useEffect(() => {
    void loadSameLabelExamples(true);
  }, [projectId, focusedLabel?.id, selectedAnnotation?.id, selectedAnnotationExcludeId]);

  useEffect(() => {
    void loadSameSurfaceExamples(true);
  }, [projectId, sameSurfaceTarget?.text, sameSurfaceTarget?.annotationId, sameSurfaceTarget?.labelId]);

  return {
    sameLabelExamples,
    sameLabelExamplesTotal,
    sameLabelExamplesOffset,
    sameLabelExamplesLoadingMore,
    sameLabelExampleDetails,
    sameSurfaceExamples,
    sameSurfaceExamplesTotal,
    sameSurfaceExamplesOffset,
    sameSurfaceExamplesLoadingMore,
    sameSurfaceTargetLabelId: sameSurfaceTarget?.labelId ?? null,
    loadSameLabelExamples,
    loadSameSurfaceExamples,
    ensureSameLabelDetails,
  };
}
