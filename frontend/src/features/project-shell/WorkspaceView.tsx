import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  ListItemButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import LabelRoundedIcon from "@mui/icons-material/LabelRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import { DocumentCanvas } from "../../components/DocumentCanvas";
import { contextSnippet, getDocumentHoverPreview } from "../workspace/workspaceUtils";
import { floatingTooltipSlotProps } from "./projectShellConstants";
import type { RightTab, SelectionPreview } from "./projectShellTypes";
import type {
  AnnotationSearchItemRecord,
  DocumentSortValue,
  DocumentRecord,
  LabelRecord,
  LabelSurfaceGroupRecord,
  StatusValue,
} from "../../api-contract";
import type {
  DocumentListItem,
  JsonObject,
  ProjectBundle,
} from "../../types";
import { getDocumentSnippetParts, groupAnnotationsByLabel } from "../../utils";
import { useI18n } from "../../i18n/useI18n";

function scrollRowIntoView(row: Element | null) {
  if (!row || typeof row.scrollIntoView !== "function") {
    return;
  }
  row.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function WorkspaceView({
  bundle,
  currentDocument,
  selectedDocumentId,
  currentDocumentLoading,
  currentHiddenBySearch,
  visibleDocuments,
  pinnedCurrentDocument,
  pendingDocumentTotal,
  documentTotal,
  searchQuery,
  sortMode,
  documentsLoadingMore,
  documentNextOffset,
  documentListScrollRef,
  focusedLabel,
  selectedAnnotationId,
  selectedAnnotation,
  selectedAnnotationMetaDraft,
  selectedAnnotationMetaError,
  selectionPreview,
  rightTab,
  annotationEditCollapsed,
  accordionOpen,
  sameLabelExamples,
  sameLabelExamplesTotal,
  sameLabelExamplesOffset,
  sameLabelExamplesLoadingMore,
  sameLabelExampleDetails,
  sameLabelExamplesScrollRef,
  sameSurfaceExamples,
  sameSurfaceExamplesTotal,
  sameSurfaceExamplesOffset,
  sameSurfaceExamplesLoadingMore,
  sameSurfaceExamplesScrollRef,
  sameSurfaceTargetLabelId,
  getDisplayDocumentStatus,
  dirty,
  saving,
  onOpenCreateDocument,
  onSearchQueryChange,
  onSortModeChange,
  onLoadMoreDocuments,
  onSelectDocument,
  onRequestDeleteDocument,
  deleteDisabled = false,
  onFocusLabel,
  onSelectAnnotation,
  onCreateAnnotation,
  onClearSelection,
  onSelectionDraftChange,
  onSave,
  onSubmit,
  onRightTabChange,
  onLoadMoreSameLabelExamples,
  onEnsureSameLabelDetails,
  onLoadMoreSameSurfaceExamples,
  onToggleAnnotationEditCollapsed,
  onUpdateSelectedAnnotationStatus,
  onUpdateSelectedAnnotationComment,
  onUpdateSelectedAnnotationMeta,
  onDeleteSelectedAnnotation,
  onToggleAnnotationGroup,
}: {
  bundle: ProjectBundle;
  currentDocument: DocumentRecord | null;
  selectedDocumentId: string | null;
  currentDocumentLoading: boolean;
  currentHiddenBySearch: boolean;
  visibleDocuments: DocumentListItem[];
  pinnedCurrentDocument: DocumentListItem | null;
  pendingDocumentTotal: number;
  documentTotal: number;
  searchQuery: string;
  sortMode: DocumentSortValue;
  documentsLoadingMore: boolean;
  documentNextOffset: number;
  documentListScrollRef: React.Ref<HTMLDivElement>;
  focusedLabel: LabelRecord | null;
  selectedAnnotationId: string | null;
  selectedAnnotation: DocumentRecord["annotations"][number] | null;
  selectedAnnotationMetaDraft: string;
  selectedAnnotationMetaError: string | null;
  selectionPreview: SelectionPreview | null;
  rightTab: RightTab;
  annotationEditCollapsed: boolean;
  accordionOpen: Record<string, boolean>;
  sameLabelExamples: LabelSurfaceGroupRecord[];
  sameLabelExamplesTotal: number;
  sameLabelExamplesOffset: number;
  sameLabelExamplesLoadingMore: boolean;
  sameLabelExampleDetails: Record<string, AnnotationSearchItemRecord[]>;
  sameLabelExamplesScrollRef: React.Ref<HTMLDivElement>;
  sameSurfaceExamples: AnnotationSearchItemRecord[];
  sameSurfaceExamplesTotal: number;
  sameSurfaceExamplesOffset: number;
  sameSurfaceExamplesLoadingMore: boolean;
  sameSurfaceExamplesScrollRef: React.Ref<HTMLDivElement>;
  sameSurfaceTargetLabelId: string | null;
  getDisplayDocumentStatus: (document: DocumentListItem) => StatusValue;
  dirty: boolean;
  saving: boolean;
  onOpenCreateDocument: () => void;
  onSearchQueryChange: (value: string) => void;
  onSortModeChange: (value: DocumentSortValue) => void;
  onLoadMoreDocuments: () => void;
  onSelectDocument: (documentId: string) => void;
  onRequestDeleteDocument: (documentId: string) => void;
  deleteDisabled?: boolean;
  onFocusLabel: (labelId: string) => void;
  onSelectAnnotation: (annotationId: string | null) => void;
  onCreateAnnotation: (start: number, end: number, text: string) => void;
  onClearSelection: () => void;
  onSelectionDraftChange: (selection: SelectionPreview | null) => void;
  onSave: () => void;
  onSubmit: () => void;
  onRightTabChange: (tab: RightTab) => void;
  onLoadMoreSameLabelExamples: () => void;
  onEnsureSameLabelDetails: (surfaceKey: string, surfaceText: string, duplicateCount: number) => void;
  onLoadMoreSameSurfaceExamples: () => void;
  onToggleAnnotationEditCollapsed: () => void;
  onUpdateSelectedAnnotationStatus: (status: StatusValue) => void;
  onUpdateSelectedAnnotationComment: (comment: string) => void;
  onUpdateSelectedAnnotationMeta: (metaText: string) => void;
  onDeleteSelectedAnnotation: () => void;
  onToggleAnnotationGroup: (labelId: string) => void;
}) {
  const groupedAnnotations = useMemo(
    () => (currentDocument ? groupAnnotationsByLabel(currentDocument, bundle.labels) : []),
    [currentDocument, bundle.labels],
  );
  const { t } = useI18n();
  const [hoveredDocumentId, setHoveredDocumentId] = useState<string | null>(null);
  const [focusedDocumentId, setFocusedDocumentId] = useState<string | null>(null);
  const documentRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const annotationRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const annotationOrderKey = useMemo(() => {
    return groupedAnnotations
      .map(
        (group) =>
          `${group.label.id}:${group.annotations
            .map((annotation) => `${annotation.id}:${annotation.start}:${annotation.end}`)
            .join(",")}`,
      )
      .join("|");
  }, [groupedAnnotations]);
  const selectedDocumentVisible = useMemo(
    () => Boolean(selectedDocumentId && visibleDocuments.some((document) => document.id === selectedDocumentId)),
    [selectedDocumentId, visibleDocuments],
  );

  useEffect(() => {
    setFocusedDocumentId((current) => (current && current !== selectedDocumentId ? null : current));
  }, [selectedDocumentId]);

  useEffect(() => {
    if (!selectedDocumentId || !selectedDocumentVisible) {
      return;
    }
    scrollRowIntoView(documentRowRefs.current[selectedDocumentId]);
  }, [selectedDocumentId, selectedDocumentVisible]);

  useEffect(() => {
    if (!selectedAnnotationId || rightTab !== "annotations") {
      return;
    }
    scrollRowIntoView(annotationRowRefs.current[selectedAnnotationId]);
  }, [annotationOrderKey, rightTab, selectedAnnotationId]);

  return (
    <>
      <Paper sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Box sx={{ p: 2, display: "grid", gap: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: "0.01em" }}>
                {pendingDocumentTotal} pending / {documentTotal} docs
              </Typography>
            </Box>
            <Tooltip title={t("projectShell.workspace.createDocument")}>
              <span>
                <IconButton onClick={onOpenCreateDocument} disabled={saving}>
                  <AddRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
          <TextField
            placeholder={t("projectShell.workspace.searchPlaceholder")}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            size="small"
            label={t("projectShell.workspace.sortLabel")}
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as DocumentSortValue)}
          >
            <MenuItem value="created">{t("projectShell.workspace.sortOptions.created")}</MenuItem>
            <MenuItem value="pending">{t("projectShell.workspace.sortOptions.pending")}</MenuItem>
            <MenuItem value="updated">{t("projectShell.workspace.sortOptions.updated")}</MenuItem>
            <MenuItem value="name">{t("projectShell.workspace.sortOptions.name")}</MenuItem>
          </TextField>
        </Box>
        <Divider />
        <Box
          ref={documentListScrollRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            if (
              !documentsLoadingMore &&
              documentNextOffset < documentTotal &&
              element.scrollTop + element.clientHeight >= element.scrollHeight - 32
            ) {
              onLoadMoreDocuments();
            }
          }}
          sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1, flex: 1, minHeight: 0, overflow: "auto" }}
        >
          {currentHiddenBySearch ? (
            <Alert severity="info">
              <Typography variant="body2">{t("projectShell.workspace.currentOutsideSearch")}</Typography>
              <Button size="small" onClick={() => onSearchQueryChange("")} sx={{ mt: 1, alignSelf: "flex-start", minWidth: "auto", px: 1 }}>
                {t("projectShell.workspace.clearSearch")}
              </Button>
            </Alert>
          ) : null}
          {visibleDocuments.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="subtitle2">{t("projectShell.workspace.noResultsTitle")}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t("projectShell.workspace.noResultsDescription")}
              </Typography>
            </Paper>
          ) : null}
          {pinnedCurrentDocument ? (
            <Alert severity="info" sx={{ alignItems: "flex-start" }}>
              <Typography variant="body2">{t("projectShell.workspace.pinnedCurrentDocument")}</Typography>
            </Alert>
          ) : null}
          {visibleDocuments.map((document) => {
            const deleteButtonVisible =
              document.id === selectedDocumentId || hoveredDocumentId === document.id || focusedDocumentId === document.id;
            const documentStatus = getDisplayDocumentStatus(document);
            return (
              <Tooltip
                key={document.id}
                placement="right-start"
                arrow
                slotProps={floatingTooltipSlotProps}
                title={
                  <Box sx={{ maxWidth: 360, p: 0.5 }}>
                    <Typography variant="subtitle2">{document.document_name}</Typography>
                    <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                      {getDocumentHoverPreview(document, searchQuery)}
                    </Typography>
                  </Box>
                }
              >
                <ListItemButton
                  ref={(element) => {
                    if (element) {
                      documentRowRefs.current[document.id] = element;
                      return;
                    }
                    delete documentRowRefs.current[document.id];
                  }}
                  selected={document.id === selectedDocumentId}
                  onClick={() => onSelectDocument(document.id)}
                  onMouseEnter={() => setHoveredDocumentId(document.id)}
                  onMouseLeave={() => setHoveredDocumentId((current) => (current === document.id ? null : current))}
                  onFocus={() => setFocusedDocumentId(document.id)}
                  onBlur={(event) => {
                    const nextFocused = event.relatedTarget as Node | null;
                    if (!event.currentTarget.contains(nextFocused)) {
                      setFocusedDocumentId((current) => (current === document.id ? null : current));
                    }
                  }}
                  sx={{
                    position: "relative",
                    alignItems: "flex-start",
                    display: "block",
                    px: 1.5,
                    py: 1.25,
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: document.id === selectedDocumentId ? "primary.main" : "#dbe3ee",
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        width: "calc(100% - 80px)",
                        minHeight: 24,
                        display: "block",
                        lineHeight: "24px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "clip",
                        maskImage: "linear-gradient(to right, #000 0%, #000 90%, transparent 100%)",
                        WebkitMaskImage: "linear-gradient(to right, #000 0%, #000 90%, transparent 100%)",
                      }}
                    >
                      {document.document_name}
                    </Typography>
                    <Typography component="div" variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
                      {getDocumentSnippetParts(document, searchQuery).map((part, index) =>
                        part.highlighted ? (
                          <Box
                            key={`${document.id}-snippet-${index}`}
                            component="mark"
                            sx={{ px: 0.15, py: 0.02, borderRadius: 0.5, bgcolor: alpha("#fbbc04", 0.34), color: "inherit" }}
                          >
                            {part.text}
                          </Box>
                        ) : (
                          <Box key={`${document.id}-snippet-${index}`} component="span">
                            {part.text}
                          </Box>
                        ),
                      )}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      position: "absolute",
                      top: 10,
                      right: 12,
                      width: 112,
                      height: 24,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                    }}
                  >
                    <Chip
                      size="small"
                      label={documentStatus}
                      color={documentStatus === "verified" ? "success" : "warning"}
                      sx={{
                        position: "absolute",
                        right: 0,
                        top: "50%",
                        transform: deleteButtonVisible ? "translate(-30px, -50%)" : "translate(0, -50%)",
                        transition: "transform 140ms ease",
                        height: 24,
                        "& .MuiChip-label": {
                          px: 1.1,
                          fontWeight: 600,
                          lineHeight: "24px",
                        },
                      }}
                    />
                    <Tooltip title="Delete document">
                      <span
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "50%",
                          width: 24,
                          height: 24,
                          transform: deleteButtonVisible ? "translateY(-50%)" : "translate(6px, -50%)",
                          transition: "opacity 140ms ease, transform 140ms ease, visibility 140ms ease",
                          visibility: deleteButtonVisible ? "visible" : "hidden",
                          opacity: deleteButtonVisible ? 1 : 0,
                          zIndex: 1,
                        }}
                      >
                        <IconButton
                          aria-label={t("projectShell.workspace.deleteDocumentAria", { name: document.document_name })}
                          color="error"
                          size="small"
                          disabled={deleteDisabled}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRequestDeleteDocument(document.id);
                          }}
                          sx={{
                            width: 24,
                            height: 24,
                            p: 0,
                            bgcolor: "background.paper",
                            border: "1px solid",
                            borderColor: alpha("#d93025", 0.18),
                            boxShadow: "0 2px 10px rgba(15, 23, 42, 0.08)",
                            "&:hover": {
                              bgcolor: alpha("#d93025", 0.08),
                              borderColor: alpha("#d93025", 0.28),
                            },
                          }}
                        >
                          <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </ListItemButton>
              </Tooltip>
            );
          })}
          {documentsLoadingMore ? (
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", py: 0.75 }}>
              {t("projectShell.workspace.loadingMore")}
            </Typography>
          ) : null}
          {!documentsLoadingMore && documentNextOffset >= documentTotal && visibleDocuments.length > 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", py: 0.75 }}>
              {t("projectShell.workspace.allLoaded")}
            </Typography>
          ) : null}
        </Box>
      </Paper>

      <Box sx={{ display: "grid", gap: 2, height: "100%", minHeight: 0, overflow: "hidden", gridTemplateRows: "auto minmax(0,1fr) auto" }}>
        <Paper sx={{ px: 1.5, py: 1.25, display: "flex", gap: 1, overflowX: "auto", minHeight: 58, alignItems: "center" }}>
          {bundle.labels.map((label) => {
            const active = label.id === focusedLabel?.id;
            return (
              <Chip
                key={label.id}
                label={label.name}
                onClick={(event) => {
                  onFocusLabel(label.id);
                  onSelectAnnotation(null);
                  event.currentTarget.blur();
                }}
                sx={{
                  height: 30,
                  px: 0.25,
                  color: active ? "#fff" : label.color,
                  backgroundColor: active ? label.color : alpha(label.color, 0.08),
                  border: `1px solid ${alpha(label.color, active ? 0.4 : 0.24)}`,
                  transition: "background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
                  boxShadow: active ? `inset 0 0 0 1px ${alpha("#ffffff", 0.14)}` : "none",
                  "&:hover": {
                    backgroundColor: active ? label.color : alpha(label.color, 0.14),
                    borderColor: alpha(label.color, active ? 0.56 : 0.42),
                    boxShadow: active
                      ? `0 0 0 3px ${alpha(label.color, 0.18)}, inset 0 0 0 1px ${alpha("#ffffff", 0.18)}`
                      : `0 0 0 3px ${alpha(label.color, 0.12)}`,
                    transform: "translateY(-1px)",
                  },
                  "&:focus-visible": {
                    borderColor: alpha(label.color, active ? 0.56 : 0.42),
                    boxShadow: `0 0 0 3px ${alpha(label.color, 0.2)}`,
                  },
                  "& .MuiChip-label": {
                    px: 1,
                    fontWeight: 600,
                    fontSize: 13,
                  },
                }}
              />
            );
          })}
        </Paper>

        {currentDocument ? (
          <DocumentCanvas
            document={currentDocument}
            labels={bundle.labels}
            focusedLabelId={focusedLabel?.id ?? null}
            selectedAnnotationId={selectedAnnotationId}
            onFocusLabel={onFocusLabel}
            onSelectAnnotation={(annotationId) => {
              onSelectionDraftChange(null);
              onSelectAnnotation(annotationId);
            }}
            onCreateAnnotation={onCreateAnnotation}
            onClearSelection={() => {
              onSelectionDraftChange(null);
              onClearSelection();
            }}
            onSelectionDraftChange={(selection) => {
              onSelectionDraftChange(selection);
              if (selection) {
                onSelectAnnotation(null);
                onRightTabChange("examples");
              }
            }}
          />
        ) : currentDocumentLoading ? (
          <Paper sx={{ p: 4, height: "100%", minHeight: 0, display: "grid", placeItems: "center", gap: 1.5, overflow: "auto" }}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">
              Document を読み込み中
            </Typography>
          </Paper>
        ) : (
          <Paper sx={{ p: 4, height: "100%", minHeight: 0, overflow: "auto" }}>
            <Typography variant="h6">{t("projectShell.workspace.noDocumentTitle")}</Typography>
          </Paper>
        )}

        <Stack direction="row" spacing={1} sx={{ ml: "auto", alignItems: "center", pb: 1, flexShrink: 0 }}>
          <Button
            variant="outlined"
            startIcon={<SaveRoundedIcon />}
            onClick={onSave}
            disabled={!dirty || saving}
            sx={{ minWidth: 108, minHeight: 40, px: 2.25, borderRadius: 1.5 }}
          >
            Save
          </Button>
          <Button
            variant="contained"
            endIcon={<TaskAltRoundedIcon />}
            onClick={onSubmit}
            disabled={!currentDocument || saving}
            sx={{ minWidth: 126, minHeight: 40, px: 2.5, borderRadius: 1.5 }}
          >
            Submit
          </Button>
        </Stack>
      </Box>

      <Paper sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Tabs value={rightTab} onChange={(_event, value) => onRightTabChange(value)} variant="fullWidth">
          <Tab value="examples" label={t("projectShell.workspace.tabs.examples")} />
          <Tab value="annotations" label={t("projectShell.workspace.tabs.annotations")} />
        </Tabs>
        <Divider />
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, overflow: "hidden" }}>
          {rightTab === "examples" ? (
            <>
              <Paper
                variant="outlined"
                sx={{ p: 2, display: "flex", flexDirection: "column", flexShrink: 0 }}
              >
                <Typography variant="subtitle2">
                  {t("projectShell.workspace.annotationGuideTitle", {
                    label: focusedLabel?.name ?? t("projectShell.workspace.fallbackLabel"),
                  })}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2, whiteSpace: "pre-wrap" }}>
                  {focusedLabel?.description || t("projectShell.workspace.annotationGuideEmpty")}
                </Typography>
              </Paper>
              <Box
                data-testid="examples-panels-grid"
                sx={{ display: "grid", gap: 2, flex: 1, minHeight: 0, gridTemplateRows: "minmax(0,1fr) minmax(0,1fr)" }}
              >
                <Paper
                  data-testid="same-label-examples-panel"
                  variant="outlined"
                  sx={{ p: 2, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
                >
                  <Typography variant="subtitle2">{t("projectShell.workspace.sameLabelExamplesTitle")}</Typography>
                  <Stack
                    ref={sameLabelExamplesScrollRef}
                    spacing={1.25}
                    onScroll={(event) => {
                      const element = event.currentTarget;
                      if (
                        !sameLabelExamplesLoadingMore &&
                        sameLabelExamplesOffset < sameLabelExamplesTotal &&
                        element.scrollTop + element.clientHeight >= element.scrollHeight - 24
                      ) {
                        onLoadMoreSameLabelExamples();
                      }
                    }}
                    sx={{ mt: 1.5, overflow: "auto", minHeight: 0, pr: 0.5 }}
                  >
                    {sameLabelExamples.map((item) => {
                      const detailItems = sameLabelExampleDetails[item.surface_text];
                      const representative = item.representative;
                      const emphasisColor = focusedLabel?.color ?? "#1a73e8";
                      return (
                        <Tooltip
                          key={item.surface_text}
                          placement="left-start"
                          arrow
                          slotProps={floatingTooltipSlotProps}
                          onOpen={() => onEnsureSameLabelDetails(item.surface_text, item.surface_text, item.duplicate_count)}
                          title={
                            <Box sx={{ maxWidth: 460, p: 0.75 }}>
                              <Typography variant="subtitle2">
                                {t("projectShell.workspace.sameLabelExamplesCount", {
                                  surface: item.surface_text,
                                  count: item.duplicate_count,
                                })}
                              </Typography>
                              <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                                {!detailItems ? (
                                  <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                    {t("projectShell.workspace.loading")}
                                  </Typography>
                                ) : null}
                                {detailItems?.map((detail) => (
                                  <Box key={detail.annotation_id}>
                                    <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                      {detail.document_name}
                                    </Typography>
                                    <Typography variant="body2" sx={{ lineHeight: 1.9, mt: 0.35 }}>
                                      <Box component="span" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                        {detail.context_before}
                                      </Box>
                                      <Box component="span" sx={{ fontWeight: 700 }}>
                                        {detail.span_text}
                                      </Box>
                                      <Box component="span" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                        {detail.context_after}
                                      </Box>
                                    </Typography>
                                  </Box>
                                ))}
                              </Stack>
                            </Box>
                          }
                        >
                          <Paper variant="outlined" sx={{ p: 1.5 }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                              <Typography variant="caption" color="text.secondary">
                                {representative.document_name}
                              </Typography>
                              <Chip size="small" label={representative.status} color={representative.status === "verified" ? "success" : "warning"} />
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                              {t("projectShell.workspace.sameLabelExamplesCount", {
                                surface: item.surface_text,
                                count: item.duplicate_count,
                              })}
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              <Box component="span" sx={{ color: "text.secondary" }}>
                                {representative.context_before}
                              </Box>
                              <Box
                                component="span"
                                sx={{
                                  fontWeight: 700,
                                  px: 0.15,
                                  py: 0.04,
                                  borderRadius: 0.75,
                                  bgcolor: alpha(emphasisColor, 0.18),
                                }}
                              >
                                {representative.span_text}
                              </Box>
                              <Box component="span" sx={{ color: "text.secondary" }}>
                                {representative.context_after}
                              </Box>
                            </Typography>
                          </Paper>
                        </Tooltip>
                      );
                    })}
                    {sameLabelExamplesLoadingMore ? (
                      <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", py: 0.5 }}>
                        {t("projectShell.workspace.loadingMore")}
                      </Typography>
                    ) : sameLabelExamples.length > 0 && sameLabelExamplesOffset >= sameLabelExamplesTotal ? (
                      <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", py: 0.5 }}>
                        {t("projectShell.workspace.allLoaded")}
                      </Typography>
                    ) : null}
                    {sameLabelExamples.length === 0 ? <Typography color="text.secondary">{t("projectShell.workspace.noMatches")}</Typography> : null}
                  </Stack>
                </Paper>

                <Paper
                  data-testid="same-surface-examples-panel"
                  variant="outlined"
                  sx={{ p: 2, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
                >
                  <Typography variant="subtitle2">{t("projectShell.workspace.sameSurfaceExamplesTitle")}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75 }}>
                    {selectionPreview?.text
                      ? t("projectShell.workspace.selectedRange", { text: selectionPreview.text })
                      : selectedAnnotation
                        ? t("projectShell.workspace.selectedTarget", { text: selectedAnnotation.span_text })
                        : t("projectShell.workspace.sameSurfaceIdle")}
                  </Typography>
                  <Stack
                    ref={sameSurfaceExamplesScrollRef}
                    spacing={1.25}
                    onScroll={(event) => {
                      const element = event.currentTarget;
                      if (
                        !sameSurfaceExamplesLoadingMore &&
                        sameSurfaceExamplesOffset < sameSurfaceExamplesTotal &&
                        element.scrollTop + element.clientHeight >= element.scrollHeight - 24
                      ) {
                        onLoadMoreSameSurfaceExamples();
                      }
                    }}
                    sx={{ mt: 1.5, overflow: "auto", minHeight: 0, pr: 0.5 }}
                  >
                    {sameSurfaceExamples.map((item) => {
                      const labelColor = item.label_color ?? "#1a73e8";
                      const highlightDifferentLabel = Boolean(sameSurfaceTargetLabelId) && item.label_id !== sameSurfaceTargetLabelId;
                      return (
                        <Tooltip
                          key={item.annotation_id}
                          placement="left-start"
                          arrow
                          slotProps={floatingTooltipSlotProps}
                          title={
                            <Box sx={{ maxWidth: 460, p: 0.75 }}>
                              <Typography variant="subtitle2">{item.document_name}</Typography>
                              <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.9 }}>
                                <Box component="span" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                  {item.context_before}
                                </Box>
                                <Box component="span" sx={{ fontWeight: 700 }}>
                                  {item.span_text}
                                </Box>
                                <Box component="span" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                  {item.context_after}
                                </Box>
                              </Typography>
                            </Box>
                          }
                        >
                          <Paper variant="outlined" sx={{ p: 1.5 }}>
                            <Stack direction="row" justifyContent="space-between">
                              <Typography variant="caption" color="text.secondary">
                                {item.document_name}
                              </Typography>
                              <Chip
                                size="small"
                                label={item.label_name}
                                sx={{
                                  color: labelColor,
                                  bgcolor: alpha(labelColor, highlightDifferentLabel ? 0.22 : 0.12),
                                  border: `1px solid ${alpha(labelColor, highlightDifferentLabel ? 0.34 : 0.18)}`,
                                  fontWeight: highlightDifferentLabel ? 700 : 500,
                                  boxShadow: highlightDifferentLabel ? `0 0 0 2px ${alpha(labelColor, 0.08)}` : "none",
                                }}
                              />
                            </Stack>
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              <Box component="span" sx={{ color: "text.secondary" }}>
                                {item.context_before}
                              </Box>
                              <Box component="span" sx={{ fontWeight: 700 }}>
                                {item.span_text}
                              </Box>
                              <Box component="span" sx={{ color: "text.secondary" }}>
                                {item.context_after}
                              </Box>
                            </Typography>
                          </Paper>
                        </Tooltip>
                      );
                    })}
                    {sameSurfaceExamplesLoadingMore ? (
                      <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", py: 0.5 }}>
                        {t("projectShell.workspace.loadingMore")}
                      </Typography>
                    ) : sameSurfaceExamples.length > 0 && sameSurfaceExamplesOffset >= sameSurfaceExamplesTotal ? (
                      <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", py: 0.5 }}>
                        {t("projectShell.workspace.allLoaded")}
                      </Typography>
                    ) : null}
                    {!selectionPreview && !selectedAnnotation ? (
                      <Typography color="text.secondary">{t("projectShell.workspace.sameSurfacePrompt")}</Typography>
                    ) : null}
                    {(selectionPreview || selectedAnnotation) && sameSurfaceExamples.length === 0 ? (
                      <Typography color="text.secondary">{t("projectShell.workspace.sameSurfaceNoMatches")}</Typography>
                    ) : null}
                  </Stack>
                </Paper>
              </Box>
            </>
          ) : (
            <>
              <Paper
                variant="outlined"
                sx={{ p: 2, display: "flex", flexDirection: "column", flexShrink: 0 }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  id="annotation-edit-toggle"
                  sx={{ cursor: "pointer", width: "fit-content" }}
                  onClick={onToggleAnnotationEditCollapsed}
                >
                  <Box sx={{ width: 18, display: "grid", placeItems: "center" }}>
                    <Typography variant="caption">{annotationEditCollapsed ? "▶" : "▼"}</Typography>
                  </Box>
                  <Typography variant="subtitle2">{t("projectShell.workspace.selectedAnnotationTitle")}</Typography>
                </Stack>
                {selectedAnnotation && !annotationEditCollapsed ? (
                  <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                    <Autocomplete
                      options={["pending", "verified"]}
                      value={selectedAnnotation.status}
                      renderInput={(params) => <TextField {...params} label={t("projectShell.workspace.status")} size="small" />}
                      onChange={(_event, value) => {
                        if (value) {
                          onUpdateSelectedAnnotationStatus(value as StatusValue);
                        }
                      }}
                    />
                    <TextField
                      label={t("projectShell.workspace.comment")}
                      multiline
                      minRows={3}
                      value={selectedAnnotation.comment}
                      onChange={(event) => onUpdateSelectedAnnotationComment(event.target.value)}
                    />
                    <TextField
                      label={t("projectShell.workspace.meta")}
                      multiline
                      minRows={3}
                      value={selectedAnnotationMetaDraft}
                      onChange={(event) => onUpdateSelectedAnnotationMeta(event.target.value)}
                      error={Boolean(selectedAnnotationMetaError)}
                      helperText={selectedAnnotationMetaError ?? undefined}
                    />
                    <Button color="error" variant="outlined" startIcon={<DeleteOutlineRoundedIcon />} onClick={onDeleteSelectedAnnotation}>
                      {t("projectShell.workspace.deleteAnnotation")}
                    </Button>
                  </Stack>
                ) : selectedAnnotation ? (
                  <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                    {t("projectShell.workspace.annotationCollapsed")}
                  </Typography>
                ) : (
                  <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                    {t("projectShell.workspace.annotationHint")}
                  </Typography>
                )}
              </Paper>

              <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                <Typography variant="subtitle2">{t("projectShell.workspace.documentAnnotationsTitle")}</Typography>
                <Stack spacing={1.5} sx={{ mt: 1.5, overflow: "auto", minHeight: 0, pr: 0.5 }}>
                  {groupedAnnotations.map(({ label, annotations }) => (
                    <Paper key={label.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ cursor: "pointer", width: "fit-content" }}
                        onClick={() => onToggleAnnotationGroup(label.id)}
                      >
                        <Box sx={{ width: 18, display: "grid", placeItems: "center" }}>
                          <Typography variant="caption">{accordionOpen[label.id] ?? true ? "▼" : "▶"}</Typography>
                        </Box>
                        <LabelRoundedIcon sx={{ color: label.color, fontSize: 18 }} />
                        <Typography variant="subtitle2">{label.name}</Typography>
                        <Chip size="small" label={annotations.length} />
                      </Stack>
                      <Stack spacing={1} sx={{ mt: 1.25, display: accordionOpen[label.id] ?? true ? "flex" : "none" }}>
                        {annotations.map((annotation) => {
                          const snippet = contextSnippet(currentDocument?.text ?? "", annotation.start, annotation.end, 10);
                          return (
                            <Paper
                              key={annotation.id}
                              ref={(element) => {
                                if (element) {
                                  annotationRowRefs.current[annotation.id] = element;
                                  return;
                                }
                                delete annotationRowRefs.current[annotation.id];
                              }}
                              variant="outlined"
                              sx={{
                                p: 1.25,
                                cursor: "pointer",
                                borderColor: annotation.id === selectedAnnotationId ? "primary.main" : undefined,
                              }}
                              onClick={() => {
                                onFocusLabel(annotation.label_id);
                                onSelectAnnotation(annotation.id);
                              }}
                            >
                              <Stack direction="row" justifyContent="space-between" spacing={1}>
                                <Typography variant="caption" color="text.secondary">
                                  {annotation.start}-{annotation.end}
                                </Typography>
                                <Chip size="small" label={annotation.status} color={annotation.status === "verified" ? "success" : "warning"} />
                              </Stack>
                              <Typography variant="body2" sx={{ mt: 0.75 }}>
                                <Box component="span" color="text.disabled">
                                  {snippet.before}
                                </Box>
                                <Box component="span" sx={{ fontWeight: 700 }}>
                                  {snippet.focus}
                                </Box>
                                <Box component="span" color="text.disabled">
                                  {snippet.after}
                                </Box>
                              </Typography>
                            </Paper>
                          );
                        })}
                        {annotations.length === 0 ? <Typography color="text.secondary">{t("projectShell.workspace.noAnnotations")}</Typography> : null}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Paper>
            </>
          )}
        </Box>
      </Paper>
    </>
  );
}
