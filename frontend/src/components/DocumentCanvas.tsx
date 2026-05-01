import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Paper, Typography, alpha } from "@mui/material";
import type { DocumentRecord, LabelRecord } from "../api-contract";
import { useI18n } from "../i18n/useI18n";
import { isShortcutBlockedTarget } from "../utils";
import {
  UNDERLINE_HIT_HEIGHT,
  UNDERLINE_LANE_BASE,
  UNDERLINE_LANE_PITCH,
  buildAnnotationById,
  buildRectsByAnnotationId,
  buildSegments,
  buildUnderlineLaneByAnnotation,
  isBoxInViewport,
  mergeInlineRects,
  mixColorWithBlack,
  getSelectionOffset,
} from "./documentCanvasLayout";

type SelectionDraft = {
  start: number;
  end: number;
  text: string;
  top: number;
  left: number;
};

type MarkerBox = { annotationId: string; left: number; top: number; width: number; height: number; color: string };
type OverlayLine = { annotationId: string; left: number; top: number; width: number; color: string };
type SelectionBox = { left: number; top: number; width: number; height: number; color: string };

function areOverlayItemsEqual<T extends object>(left: T[], right: T[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((leftItem, index) => {
    const rightItem = right[index];
    const keys = Object.keys(leftItem) as Array<keyof T>;
    return keys.every((key) => leftItem[key] === rightItem[key]);
  });
}

export function DocumentCanvas({
  document,
  labels,
  focusedLabelId,
  selectedAnnotationId,
  onFocusLabel,
  onSelectAnnotation,
  onCreateAnnotation,
  onClearSelection,
  onSelectionDraftChange,
}: {
  document: DocumentRecord;
  labels: LabelRecord[];
  focusedLabelId: string | null;
  selectedAnnotationId: string | null;
  onFocusLabel: (labelId: string) => void;
  onSelectAnnotation: (annotationId: string | null) => void;
  onCreateAnnotation: (start: number, end: number, text: string) => void;
  onClearSelection: () => void;
  onSelectionDraftChange: (selection: { start: number; end: number; text: string } | null) => void;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const lastSelectionCommitAtRef = useRef(0);
  const [selection, setSelection] = useState<SelectionDraft | null>(null);
  const [hoveredLaneAnnotationId, setHoveredLaneAnnotationId] = useState<string | null>(null);
  const [laneTooltip, setLaneTooltip] = useState<{ text: string; color: string; top: number; left: number } | null>(
    null,
  );
  const [markerTooltip, setMarkerTooltip] = useState<{ text: string; color: string; top: number; left: number } | null>(
    null,
  );
  const [markerBoxes, setMarkerBoxes] = useState<MarkerBox[]>([]);
  const [overlayLines, setOverlayLines] = useState<OverlayLine[]>([]);
  const [selectionBoxes, setSelectionBoxes] = useState<SelectionBox[]>([]);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const annotationById = useMemo(() => buildAnnotationById(document.annotations), [document.annotations]);
  const labelsById = useMemo(() => new Map(labels.map((label) => [label.id, label])), [labels]);
  const underlineLayout = useMemo(
    () => buildUnderlineLaneByAnnotation(document.annotations, labels, focusedLabelId),
    [document.annotations, labels, focusedLabelId],
  );
  const segments = useMemo(
    () => buildSegments(document.text, document.annotations, focusedLabelId, selectedAnnotationId),
    [document, focusedLabelId, selectedAnnotationId],
  );

  useEffect(() => {
    setSelection(null);
    setHoveredLaneAnnotationId(null);
    setLaneTooltip(null);
    setMarkerTooltip(null);
  }, [document.id, focusedLabelId, selectedAnnotationId]);

  useLayoutEffect(() => {
    const root = textRef.current;
    const canvas = canvasRef.current;
    if (!root && !canvas) {
      return;
    }

    let frameId: number | null = null;
    const scheduleLayoutRefresh = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setLayoutRevision((current) => current + 1);
      });
    };

    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleLayoutRefresh) : null;
    if (canvas) {
      resizeObserver?.observe(canvas);
    }
    if (root && root !== canvas) {
      resizeObserver?.observe(root);
    }
    window.addEventListener("resize", scheduleLayoutRefresh);

    return () => {
      window.removeEventListener("resize", scheduleLayoutRefresh);
      resizeObserver?.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  useEffect(() => {
    if (!selection) {
      onSelectionDraftChange(null);
      return;
    }
    onSelectionDraftChange({
      start: selection.start,
      end: selection.end,
      text: selection.text,
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlockedTarget(event.target)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        onCreateAnnotation(selection.start, selection.end, selection.text);
        window.getSelection()?.removeAllRanges();
        setSelection(null);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, onCreateAnnotation, onSelectionDraftChange]);

  useLayoutEffect(() => {
    const root = textRef.current;
    const canvas = canvasRef.current;
    if (!root) {
      setMarkerBoxes([]);
      setOverlayLines([]);
      setSelectionBoxes([]);
      return;
    }
    const baseRect = canvas?.getBoundingClientRect() ?? root.getBoundingClientRect();
    const canvasScrollLeft = canvas?.scrollLeft ?? 0;
    const canvasScrollTop = canvas?.scrollTop ?? 0;
    const rectsByAnnotationId = buildRectsByAnnotationId(root, document.annotations);
    const viewportOverscan = 400;
    const viewport = {
      left: canvasScrollLeft - viewportOverscan,
      top: canvasScrollTop - viewportOverscan,
      right: canvasScrollLeft + (canvas?.clientWidth ?? Number.POSITIVE_INFINITY) + viewportOverscan,
      bottom: canvasScrollTop + (canvas?.clientHeight ?? Number.POSITIVE_INFINITY) + viewportOverscan,
    };

    const nextMarkerBoxes = document.annotations
      .filter((annotation) => annotation.label_id === focusedLabelId)
      .flatMap((annotation) => {
        const label = labelsById.get(annotation.label_id);
        const mergedRects = mergeInlineRects(rectsByAnnotationId[annotation.id] ?? []);
        return mergedRects.map((rect) => ({
          annotationId: annotation.id,
          color: label?.color ?? "#8b94a0",
          left: rect.left - baseRect.left + canvasScrollLeft,
          top: rect.top - baseRect.top + canvasScrollTop - 1,
          width: rect.right - rect.left,
          height: Math.max(18, rect.bottom - rect.top + 2),
        }));
      })
      .filter((box) => box.width > 0 && isBoxInViewport(box, viewport));

    const nextOverlayLines = document.annotations
      .filter((annotation) => annotation.label_id !== focusedLabelId)
      .flatMap((annotation) => {
        const laneIndex = underlineLayout.laneByAnnotationId[annotation.id];
        const label = labelsById.get(annotation.label_id);
        const mergedRects = mergeInlineRects(rectsByAnnotationId[annotation.id] ?? []);
        return mergedRects.map((rect) => ({
          annotationId: annotation.id,
          color: label?.color ?? "#8b94a0",
          left: rect.left - baseRect.left + canvasScrollLeft,
          width: rect.right - rect.left,
          top:
            rect.bottom -
            baseRect.top +
            canvasScrollTop +
            (UNDERLINE_LANE_BASE + (laneIndex ?? 0) * UNDERLINE_LANE_PITCH - UNDERLINE_HIT_HEIGHT / 2),
        }));
      })
      .filter((line) => line.width > 0 && isBoxInViewport({ ...line, height: UNDERLINE_HIT_HEIGHT }, viewport));

    const nextSelectionBoxes = selectedAnnotationId
      ? mergeInlineRects(rectsByAnnotationId[selectedAnnotationId] ?? []).map((rect) => {
          const selectedAnnotation = annotationById.get(selectedAnnotationId);
          const selectedLabel = selectedAnnotation ? labelsById.get(selectedAnnotation.label_id) : null;
          return {
            left: rect.left - baseRect.left + canvasScrollLeft,
            top: rect.top - baseRect.top + canvasScrollTop,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
            color: mixColorWithBlack(selectedLabel?.color ?? "#1a73e8", 0.5),
          };
        })
        .filter((box) => isBoxInViewport(box, viewport))
      : [];

    setMarkerBoxes((current) => (areOverlayItemsEqual(current, nextMarkerBoxes) ? current : nextMarkerBoxes));
    setOverlayLines((current) => (areOverlayItemsEqual(current, nextOverlayLines) ? current : nextOverlayLines));
    setSelectionBoxes((current) => (areOverlayItemsEqual(current, nextSelectionBoxes) ? current : nextSelectionBoxes));
  }, [
    annotationById,
    document.annotations,
    focusedLabelId,
    labelsById,
    layoutRevision,
    selectedAnnotationId,
    segments,
    underlineLayout,
  ]);

  const moveLaneTooltip = (annotationId: string, clientX: number, clientY: number) => {
    const annotation = annotationById.get(annotationId);
    const label = annotation ? labelsById.get(annotation.label_id) : null;
    if (!annotation || !label) {
      setLaneTooltip(null);
      return;
    }
    setLaneTooltip({
      text: label.name,
      color: label.color,
      left: Math.min(window.innerWidth - 180, clientX + 14),
      top: Math.min(window.innerHeight - 42, clientY + 16),
    });
  };

  const moveMarkerTooltip = (annotationId: string) => {
    const annotation = annotationById.get(annotationId);
    const label = annotation ? labelsById.get(annotation.label_id) : null;
    const canvas = canvasRef.current;
    const rootRect = canvas?.getBoundingClientRect() ?? textRef.current?.getBoundingClientRect();
    const canvasScrollLeft = canvas?.scrollLeft ?? 0;
    const canvasScrollTop = canvas?.scrollTop ?? 0;
    const annotationBoxes = markerBoxes.filter((box) => box.annotationId === annotationId);
    if (!annotation || !label || !rootRect || annotationBoxes.length === 0) {
      setMarkerTooltip(null);
      return;
    }
    const topLineTop = Math.min(...annotationBoxes.map((box) => box.top));
    const topLineBoxes = annotationBoxes.filter((box) => Math.abs(box.top - topLineTop) <= 1);
    const leftEdge = Math.min(...topLineBoxes.map((box) => box.left));
    const rightEdge = Math.max(...topLineBoxes.map((box) => box.left + box.width));
    setMarkerTooltip({
      text: label.name,
      color: label.color,
      left: rootRect.left + (leftEdge + rightEdge) / 2 - canvasScrollLeft,
      top: Math.max(8, rootRect.top + topLineTop - canvasScrollTop - 46),
    });
  };

  const selectionJustCommitted = () => performance.now() - lastSelectionCommitAtRef.current < 180;

  const commitSelection = useCallback(() => {
    const root = textRef.current;
    const selectionObj = window.getSelection();
    if (!root || !selectionObj || selectionObj.rangeCount === 0 || selectionObj.isCollapsed) {
      setSelection(null);
      return;
    }
    const range = selectionObj.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setSelection(null);
      return;
    }
    const start = getSelectionOffset(root, range.startContainer, range.startOffset);
    const end = getSelectionOffset(root, range.endContainer, range.endOffset);
    if (start === end) {
      setSelection(null);
      return;
    }
    const normalizedStart = Math.min(start, end);
    const normalizedEnd = Math.max(start, end);
    const rect = range.getBoundingClientRect();
    setSelection({
      start: normalizedStart,
      end: normalizedEnd,
      text: document.text.slice(normalizedStart, normalizedEnd),
      top: rect.bottom + 8,
      left: rect.left,
    });
    lastSelectionCommitAtRef.current = performance.now();
  }, [document.text]);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      commitSelection();
    };
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [commitSelection]);

  return (
    <Box sx={{ position: "relative", height: "100%", minHeight: 0 }}>
      <Paper
        sx={{
          p: 2.5,
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("projectShell.workspace.canvasHint")}
        </Typography>
        <Box
          ref={canvasRef}
          onClick={(event) => {
            if (selectionJustCommitted()) {
              return;
            }
            if (!window.getSelection()?.isCollapsed) {
              return;
            }
            if (event.target === event.currentTarget) {
              onClearSelection();
            }
          }}
          sx={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            px: 0.75,
            pr: 0.5,
          }}
        >
          <Box
            ref={textRef}
            data-testid="doc-text"
            onMouseUp={commitSelection}
            onMouseLeave={() => {
              setHoveredLaneAnnotationId(null);
              setLaneTooltip(null);
              setMarkerTooltip(null);
            }}
            sx={{
              fontSize: 18,
              lineHeight: 1.95,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              userSelect: "text",
              position: "relative",
              pb: `${underlineLayout.reserveBottom}px`,
              zIndex: 2,
            }}
          >
            {segments.map((segment) => {
              const primaryFocused = segment.focused[0] ?? null;
              return (
                <Box
                  key={segment.id}
                  component="span"
                  data-primary-ann-id={primaryFocused?.id ?? ""}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (selectionJustCommitted()) {
                      return;
                    }
                    if (!window.getSelection()?.isCollapsed) {
                      return;
                    }
                    if (primaryFocused) {
                      onSelectAnnotation(primaryFocused.id);
                      return;
                    }
                    onClearSelection();
                  }}
                  onMouseEnter={(event) => {
                    if (!primaryFocused) {
                      return;
                    }
                    setLaneTooltip(null);
                    moveMarkerTooltip(primaryFocused.id);
                  }}
                  onMouseMove={() => {
                    if (!primaryFocused) {
                      return;
                    }
                    moveMarkerTooltip(primaryFocused.id);
                  }}
                  onMouseLeave={() => {
                    setMarkerTooltip(null);
                  }}
                  sx={{
                    display: "inline",
                    cursor: segment.covers.length ? "pointer" : "text",
                    backgroundColor: "transparent",
                    borderRadius: "4px",
                    boxDecorationBreak: "clone",
                    WebkitBoxDecorationBreak: "clone",
                  }}
                >
                  {segment.text}
                </Box>
              );
            })}
          </Box>

          <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}>
            {markerBoxes.map((box, index) => (
              <Box
                key={`${box.annotationId}-marker-${index}`}
                sx={{
                  position: "absolute",
                  left: box.left - 1,
                  top: box.top,
                  width: box.width + 2,
                  height: box.height,
                  borderRadius: 1,
                  backgroundColor: alpha(box.color, 0.28),
                }}
              />
            ))}
          </Box>

          <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3 }}>
            {overlayLines.map((line, index) => {
              const isHover = hoveredLaneAnnotationId === line.annotationId;
              const isSelected = selectedAnnotationId === line.annotationId;
              const dimmed = hoveredLaneAnnotationId && !isHover && !isSelected;
              return (
                <Box
                  key={`${line.annotationId}-${index}`}
                  data-overlay-ann-id={line.annotationId}
                  onMouseEnter={() => setHoveredLaneAnnotationId(line.annotationId)}
                  onMouseLeave={() => {
                    setHoveredLaneAnnotationId(null);
                    setLaneTooltip(null);
                  }}
                  onMouseMove={(event) => moveLaneTooltip(line.annotationId, event.clientX, event.clientY)}
                  onClick={(event) => {
                    event.stopPropagation();
                    const annotation = annotationById.get(line.annotationId);
                    if (!annotation) {
                      return;
                    }
                    setMarkerTooltip(null);
                    onFocusLabel(annotation.label_id);
                    onSelectAnnotation(annotation.id);
                  }}
                  sx={{
                    position: "absolute",
                    pointerEvents: "auto",
                    left: line.left,
                    top: line.top,
                    width: line.width,
                    height: UNDERLINE_HIT_HEIGHT,
                    cursor: "pointer",
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      height: isHover || isSelected ? 3 : 2.5,
                      borderRadius: 999,
                      backgroundColor: alpha(line.color, dimmed ? 0.28 : 0.94),
                    },
                  }}
                />
              );
            })}
            {selectionBoxes.map((box, index) => (
              <Box
                key={`${box.left}-${box.top}-${index}`}
                sx={{
                  position: "absolute",
                  left: box.left - 1,
                  top: box.top - 1,
                  width: box.width + 2,
                  height: box.height + 2,
                  pointerEvents: "none",
                  boxShadow: `0 0 0 2px ${box.color}`,
                  borderRadius: 1,
                  backgroundColor: "transparent",
                }}
              />
            ))}
          </Box>
        </Box>
      </Paper>

      {selection ? (
        <Paper
          sx={{
            position: "fixed",
            top: selection.top,
            left: selection.left,
            zIndex: 30,
            px: 1,
            py: 0.5,
            display: "flex",
            gap: 1,
            alignItems: "center",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {selection.text}
          </Typography>
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              onCreateAnnotation(selection.start, selection.end, selection.text);
              window.getSelection()?.removeAllRanges();
              setSelection(null);
            }}
          >
            Add annotation ↵
          </Button>
        </Paper>
      ) : null}

      {laneTooltip ? (
        <Paper
          sx={{
            position: "fixed",
            top: laneTooltip.top,
            left: laneTooltip.left,
            zIndex: 31,
            px: 1,
            py: 0.5,
            display: "flex",
            gap: 0.75,
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: laneTooltip.color }} />
          <Typography variant="caption">{laneTooltip.text}</Typography>
        </Paper>
      ) : null}

      {markerTooltip ? (
        <Paper
          sx={{
            position: "fixed",
            top: markerTooltip.top,
            left: markerTooltip.left,
            transform: "translateX(-50%)",
            zIndex: 31,
            px: 1.1,
            py: 0.45,
            borderRadius: 999,
            bgcolor: "rgba(84, 88, 96, 0.96)",
            color: "#ffffff",
            boxShadow: "0 10px 22px rgba(15, 23, 42, 0.18)",
            pointerEvents: "none",
            "&::after": {
              content: '""',
              position: "absolute",
              left: "50%",
              top: "100%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "7px solid rgba(84, 88, 96, 0.96)",
            },
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: "0.01em" }}>
            {markerTooltip.text}
          </Typography>
        </Paper>
      ) : null}
    </Box>
  );
}
