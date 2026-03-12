import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import type { ToastState } from "../../hooks/useToast";
import type {
  AnnotationRecord,
  AnnotationSearchItemRecord,
  LabelRecord,
  LabelSurfaceGroupRecord,
} from "../../types";
import type { SelectionPreview } from "./projectShellTypes";

type UseProjectExamplesOptions = {
  token: string;
  projectId: string | null;
  focusedLabel: LabelRecord | null;
  selectedAnnotation: AnnotationRecord | null;
  selectionPreview: SelectionPreview | null;
  showToast: (message: string, severity?: ToastState["severity"]) => void;
};

export function useProjectExamples({
  token,
  projectId,
  focusedLabel,
  selectedAnnotation,
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

  async function loadSameLabelExamples(reset: boolean) {
    if (!focusedLabel || !projectId) {
      setSameLabelExamples([]);
      setSameLabelExamplesTotal(0);
      setSameLabelExamplesOffset(0);
      return;
    }
    setSameLabelExamplesLoadingMore(true);
    try {
      const response = await api.listLabelSurfaceGroups(token, projectId, focusedLabel.id, {
        offset: reset ? 0 : sameLabelExamplesOffset,
        limit: 8,
        status: "all",
        contextWindow: 16,
        excludeAnnotationId: selectedAnnotation?.label_id === focusedLabel.id ? selectedAnnotation.id : null,
      });
      setSameLabelExamples((current) => (reset ? response.items : [...current, ...response.items]));
      setSameLabelExamplesTotal(response.total);
      setSameLabelExamplesOffset(response.offset + response.items.length);
      if (reset) {
        setSameLabelExampleDetails({});
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "関連例の取得に失敗した", "error");
    } finally {
      setSameLabelExamplesLoadingMore(false);
    }
  }

  async function loadSameSurfaceExamples(reset: boolean) {
    if (!sameSurfaceTarget || !projectId) {
      setSameSurfaceExamples([]);
      setSameSurfaceExamplesTotal(0);
      setSameSurfaceExamplesOffset(0);
      return;
    }
    setSameSurfaceExamplesLoadingMore(true);
    try {
      const response = await api.searchAnnotations(token, projectId, {
        text: sameSurfaceTarget.text,
        status: "all",
        labelId: sameSurfaceTarget.labelId ?? null,
        excludeAnnotationId: sameSurfaceTarget.annotationId ?? null,
        offset: reset ? 0 : sameSurfaceExamplesOffset,
        limit: 8,
        contextWindow: 16,
      });
      setSameSurfaceExamples((current) => (reset ? response.items : [...current, ...response.items]));
      setSameSurfaceExamplesTotal(response.total);
      setSameSurfaceExamplesOffset(response.offset + response.items.length);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "同一表層事例の取得に失敗した", "error");
    } finally {
      setSameSurfaceExamplesLoadingMore(false);
    }
  }

  async function ensureSameLabelDetails(surfaceKey: string, surfaceText: string, duplicateCount: number) {
    if (!projectId || !focusedLabel || sameLabelExampleDetails[surfaceKey]) {
      return;
    }
    try {
      const response = await api.searchAnnotations(token, projectId, {
        text: surfaceText,
        status: "all",
        labelId: focusedLabel.id,
        excludeAnnotationId: selectedAnnotation?.label_id === focusedLabel.id ? selectedAnnotation.id : null,
        limit: Math.min(Math.max(duplicateCount, 8), 24),
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
  }, [projectId, focusedLabel?.id, selectedAnnotation?.id]);

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
