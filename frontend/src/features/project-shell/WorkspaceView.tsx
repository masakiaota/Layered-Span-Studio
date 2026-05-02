import { useEffect, useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import LabelRoundedIcon from "@mui/icons-material/LabelRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SkipNextRoundedIcon from "@mui/icons-material/SkipNextRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import { DocumentCanvas } from "../../components/DocumentCanvas";
import { contextSnippet } from "../workspace/workspaceUtils";
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
import type { DocumentListItem, JsonObject, ProjectBundle } from "../../types";
import { groupAnnotationsByLabel } from "../../utils";
import { useI18n } from "../../i18n/useI18n";
import { DocumentListPane } from "./DocumentListPane";

type AnnotationRecord = DocumentRecord["annotations"][number];

const STATUS_VALUES: StatusValue[] = ["pending", "verified"];

function scrollRowIntoView(row: Element | null) {
  if (!row || typeof row.scrollIntoView !== "function") {
    return;
  }
  row.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function SelectedAnnotationDock({
  annotation,
  annotationLabel,
  labels,
  metaDraft,
  metaError,
  pendingCount,
  saving,
  detailsOpen,
  onToggleDetails,
  onSelectNextPendingAnnotation,
  onVerifySelectedAnnotation,
  onUpdateLabel,
  onUpdateStatus,
  onUpdateComment,
  onUpdateMeta,
  onDelete,
}: {
  annotation: AnnotationRecord;
  annotationLabel: LabelRecord | null;
  labels: LabelRecord[];
  metaDraft: string;
  metaError: string | null;
  pendingCount: number;
  saving: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onSelectNextPendingAnnotation: () => void;
  onVerifySelectedAnnotation: () => void;
  onUpdateLabel: (labelId: string) => void;
  onUpdateStatus: (status: StatusValue) => void;
  onUpdateComment: (comment: string) => void;
  onUpdateMeta: (metaText: string) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const detailsId = `selected-annotation-details-${annotation.id}`;

  return (
    <Paper
      data-testid="selected-annotation-dock"
      variant="outlined"
      sx={{
        p: 1.5,
        borderColor: "primary.light",
        bgcolor: alpha("#1a73e8", 0.018),
        boxShadow: `0 10px 28px ${alpha("#1a73e8", 0.08)}`,
        flexShrink: 0,
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <Stack spacing={1.1} sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, overflow: "hidden" }}>
          <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
            {t("projectShell.workspace.selectedAnnotationDockTitle")}
          </Typography>
          <Chip
            size="small"
            label={annotation.status}
            color={annotation.status === "verified" ? "success" : "warning"}
            sx={{ flexShrink: 0 }}
          />
          <Typography variant="body2" sx={{ minWidth: 0, fontWeight: 700 }} noWrap>
            {annotation.span_text}
          </Typography>
        </Stack>

        <Box
          sx={{
            display: "flex",
            flexWrap: "nowrap",
            gap: 1,
            alignItems: "center",
            minWidth: 0,
            overflow: "visible",
          }}
        >
          <Autocomplete
            options={labels}
            value={annotationLabel}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => <TextField {...params} label="Label" size="small" />}
            onChange={(_event, value) => {
              if (value) {
                onUpdateLabel(value.id);
              }
            }}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <LabelRoundedIcon sx={{ color: option.color, fontSize: 18 }} />
                {option.name}
              </Box>
            )}
            sx={{ flex: "1 1 0", minWidth: 128 }}
          />
          <Button
            variant="outlined"
            startIcon={<SkipNextRoundedIcon />}
            onClick={onSelectNextPendingAnnotation}
            disabled={saving || pendingCount === 0}
            sx={{ flex: "0 0 auto", minWidth: 148, minHeight: 40, px: 1.25, whiteSpace: "nowrap" }}
          >
            Next pending
          </Button>
          <Button
            variant="contained"
            startIcon={<TaskAltRoundedIcon />}
            onClick={onVerifySelectedAnnotation}
            disabled={saving || annotation.status === "verified"}
            sx={{ flex: "0 0 auto", minWidth: 148, minHeight: 40, px: 1.25, whiteSpace: "nowrap" }}
          >
            Mark verified
          </Button>
          <IconButton
            aria-label="Annotation details"
            aria-controls={detailsId}
            aria-expanded={detailsOpen}
            onClick={onToggleDetails}
            sx={{
              flex: "0 0 40px",
              width: 40,
              height: 40,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.5,
            }}
          >
            <ExpandMoreRoundedIcon
              sx={{
                transform: detailsOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: (theme) => theme.transitions.create("transform", { duration: theme.transitions.duration.shortest }),
              }}
            />
          </IconButton>
        </Box>

        <Collapse in={detailsOpen} timeout="auto" unmountOnExit>
          <Box id={detailsId} sx={{ display: "flex", flexDirection: "column", gap: 1.25, minWidth: 0, pt: 0.25 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", justifyContent: "space-between", minWidth: 0 }}>
              <Autocomplete
                options={STATUS_VALUES}
                value={annotation.status}
                renderInput={(params) => <TextField {...params} label={t("projectShell.workspace.status")} size="small" />}
                onChange={(_event, value) => {
                  if (value) {
                    onUpdateStatus(value);
                  }
                }}
                sx={{ width: { xs: "100%", sm: 180 } }}
              />
              <Tooltip title={t("projectShell.workspace.deleteAnnotation")}>
                <IconButton
                  aria-label={t("projectShell.workspace.deleteAnnotation")}
                  color="error"
                  onClick={onDelete}
                  sx={{
                    width: 40,
                    height: 40,
                    border: "1px solid",
                    borderColor: "error.light",
                    borderRadius: 1.5,
                    flexShrink: 0,
                  }}
                >
                  <DeleteOutlineRoundedIcon />
                </IconButton>
              </Tooltip>
            </Box>
            <TextField
              label={t("projectShell.workspace.comment")}
              size="small"
              multiline
              minRows={2}
              maxRows={6}
              fullWidth
              value={annotation.comment}
              onChange={(event) => onUpdateComment(event.target.value)}
            />
            <TextField
              label={t("projectShell.workspace.meta")}
              size="small"
              multiline
              minRows={4}
              maxRows={10}
              fullWidth
              value={metaDraft}
              onChange={(event) => onUpdateMeta(event.target.value)}
              error={Boolean(metaError)}
              helperText={metaError ?? undefined}
            />
          </Box>
        </Collapse>
      </Stack>
    </Paper>
  );
}

function DocumentAnnotationListPanel({
  currentDocument,
  groups,
  pendingCount,
  selectedAnnotationId,
  accordionOpen,
  annotationRowRefs,
  onFocusLabel,
  onSelectAnnotation,
  onToggleAnnotationGroup,
}: {
  currentDocument: DocumentRecord | null;
  groups: Array<{ label: LabelRecord; annotations: AnnotationRecord[] }>;
  pendingCount: number;
  selectedAnnotationId: string | null;
  accordionOpen: Record<string, boolean>;
  annotationRowRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onFocusLabel: (labelId: string) => void;
  onSelectAnnotation: (annotationId: string | null) => void;
  onToggleAnnotationGroup: (labelId: string) => void;
}) {
  const { t } = useI18n();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, px: 2 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {t("projectShell.workspace.documentAnnotationsTitle")}
        </Typography>
        <Chip
          size="small"
          label={t("projectShell.workspace.pendingAnnotationCount", { count: pendingCount })}
          color={pendingCount > 0 ? "warning" : "success"}
          sx={{ fontWeight: 700 }}
        />
      </Stack>
      <Stack data-testid="document-annotation-list" spacing={1.5} sx={{ mt: 1.5, overflow: "auto", minHeight: 0, pr: 0.5 }}>
        {currentDocument && groups.length === 0 ? <Typography color="text.secondary">{t("projectShell.workspace.noAnnotations")}</Typography> : null}
        {groups.map(({ label, annotations }) => (
          <Paper key={label.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack
              component="button"
              type="button"
              direction="row"
              spacing={1}
              alignItems="center"
              aria-controls={`document-annotation-group-${label.id}`}
              aria-expanded={accordionOpen[label.id] ?? true}
              sx={{
                appearance: "none",
                background: "transparent",
                border: 0,
                cursor: "pointer",
                font: "inherit",
                p: 0,
                textAlign: "left",
                width: "100%",
                minWidth: 0,
              }}
              onClick={() => onToggleAnnotationGroup(label.id)}
            >
              <Box sx={{ width: 18, flexShrink: 0, display: "grid", placeItems: "center" }}>
                <Typography variant="caption">{accordionOpen[label.id] ?? true ? "▼" : "▶"}</Typography>
              </Box>
              <LabelRoundedIcon sx={{ color: label.color, flexShrink: 0, fontSize: 18 }} />
              <Typography variant="subtitle2" noWrap sx={{ minWidth: 0, flex: 1 }}>
                {label.name}
              </Typography>
              <Chip size="small" label={annotations.length} sx={{ flexShrink: 0 }} />
            </Stack>
            <Stack id={`document-annotation-group-${label.id}`} spacing={1} sx={{ mt: 1.25, display: accordionOpen[label.id] ?? true ? "flex" : "none" }}>
              {annotations.map((annotation) => {
                const snippet = contextSnippet(currentDocument?.text ?? "", annotation.start, annotation.end, 10);
                return (
                  <Paper
                    key={annotation.id}
                    role="button"
                    tabIndex={0}
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
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") {
                        return;
                      }
                      event.preventDefault();
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
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}

export function WorkspaceView({
  bundle,
  currentDocument,
  selectedDocumentId,
  currentDocumentLoading,
  currentHiddenBySearch,
  visibleDocuments,
  currentDocumentOutsideWindow,
  pendingDocumentTotal,
  documentTotal,
  searchQuery,
  sortMode,
  documentsLoadingMore,
  documentWindowStartOffset,
  documentNextOffset,
  documentListScrollRef,
  focusedLabel,
  selectedAnnotationId,
  selectedAnnotation,
  selectedAnnotationMetaDraft,
  selectedAnnotationMetaError,
  selectionPreview,
  rightTab,
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
  onReturnToSelectedDocument,
  onLoadPreviousDocuments,
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
  onSelectNextPendingAnnotation,
  onVerifySelectedAnnotation,
  onUpdateSelectedAnnotationLabel,
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
  currentDocumentOutsideWindow: boolean;
  pendingDocumentTotal: number;
  documentTotal: number;
  searchQuery: string;
  sortMode: DocumentSortValue;
  documentsLoadingMore: boolean;
  documentWindowStartOffset: number;
  documentNextOffset: number;
  documentListScrollRef: React.Ref<HTMLDivElement>;
  focusedLabel: LabelRecord | null;
  selectedAnnotationId: string | null;
  selectedAnnotation: DocumentRecord["annotations"][number] | null;
  selectedAnnotationMetaDraft: string;
  selectedAnnotationMetaError: string | null;
  selectionPreview: SelectionPreview | null;
  rightTab: RightTab;
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
  onReturnToSelectedDocument: () => Promise<unknown> | unknown;
  onLoadPreviousDocuments: () => Promise<unknown> | unknown;
  onLoadMoreDocuments: () => Promise<unknown> | unknown;
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
  onSelectNextPendingAnnotation: () => void;
  onVerifySelectedAnnotation: () => void;
  onUpdateSelectedAnnotationLabel: (labelId: string) => void;
  onUpdateSelectedAnnotationStatus: (status: StatusValue) => void;
  onUpdateSelectedAnnotationComment: (comment: string) => void;
  onUpdateSelectedAnnotationMeta: (metaText: string) => void;
  onDeleteSelectedAnnotation: () => void;
  onToggleAnnotationGroup: (labelId: string) => void;
}) {
  const [annotationDetailsOpen, setAnnotationDetailsOpen] = useState(false);
  const groupedAnnotations = useMemo(
    () => (currentDocument ? groupAnnotationsByLabel(currentDocument, bundle.labels) : []),
    [currentDocument, bundle.labels],
  );
  const visibleAnnotationGroups = useMemo(
    () => groupedAnnotations.filter((group) => group.annotations.length > 0),
    [groupedAnnotations],
  );
  const pendingAnnotationCount = useMemo(
    () => currentDocument?.annotations.filter((annotation) => annotation.status === "pending").length ?? 0,
    [currentDocument],
  );
  const selectedAnnotationLabel = useMemo(
    () => bundle.labels.find((label) => label.id === selectedAnnotation?.label_id) ?? null,
    [bundle.labels, selectedAnnotation?.label_id],
  );
  const { t } = useI18n();
  const labelChipRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const annotationRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const labelOrderKey = useMemo(() => bundle.labels.map((label) => label.id).join("|"), [bundle.labels]);
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

  useEffect(() => {
    if (!focusedLabel) {
      return;
    }
    scrollRowIntoView(labelChipRefs.current[focusedLabel.id]);
  }, [focusedLabel?.id, labelOrderKey]);

  useEffect(() => {
    if (!selectedAnnotationId || rightTab !== "annotations") {
      return;
    }
    scrollRowIntoView(annotationRowRefs.current[selectedAnnotationId]);
  }, [annotationOrderKey, rightTab, selectedAnnotationId]);

  return (
    <>
      <DocumentListPane
        selectedDocumentId={selectedDocumentId}
        currentHiddenBySearch={currentHiddenBySearch}
        visibleDocuments={visibleDocuments}
        currentDocumentOutsideWindow={currentDocumentOutsideWindow}
        pendingDocumentTotal={pendingDocumentTotal}
        documentTotal={documentTotal}
        searchQuery={searchQuery}
        sortMode={sortMode}
        documentsLoadingMore={documentsLoadingMore}
        documentWindowStartOffset={documentWindowStartOffset}
        documentNextOffset={documentNextOffset}
        documentListScrollRef={documentListScrollRef}
        getDisplayDocumentStatus={getDisplayDocumentStatus}
        saving={saving}
        deleteDisabled={deleteDisabled}
        onOpenCreateDocument={onOpenCreateDocument}
        onSearchQueryChange={onSearchQueryChange}
        onSortModeChange={onSortModeChange}
        onReturnToSelectedDocument={onReturnToSelectedDocument}
        onLoadPreviousDocuments={onLoadPreviousDocuments}
        onLoadMoreDocuments={onLoadMoreDocuments}
        onSelectDocument={onSelectDocument}
        onRequestDeleteDocument={onRequestDeleteDocument}
      />

      <Box sx={{ display: "grid", gap: 2, height: "100%", minHeight: 0, overflow: "hidden", gridTemplateRows: "auto minmax(0,1fr) auto auto" }}>
        <Paper
          data-testid="label-selector"
          sx={{
            px: 1.5,
            py: 1.25,
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            overflowX: "hidden",
            overflowY: "auto",
            minHeight: 58,
            maxHeight: 126,
            alignItems: "center",
            alignContent: "flex-start",
          }}
        >
          {bundle.labels.map((label) => {
            const active = label.id === focusedLabel?.id;
            return (
              <Chip
                key={label.id}
                ref={(element) => {
                  labelChipRefs.current[label.id] = element;
                }}
                label={label.name}
                onClick={(event) => {
                  onFocusLabel(label.id);
                  onSelectAnnotation(null);
                  event.currentTarget.blur();
                }}
                sx={{
                  height: 30,
                  px: 0.25,
                  maxWidth: "100%",
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
                    overflow: "hidden",
                    textOverflow: "ellipsis",
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

        {selectedAnnotation ? (
          <SelectedAnnotationDock
            annotation={selectedAnnotation}
            annotationLabel={selectedAnnotationLabel}
            labels={bundle.labels}
            metaDraft={selectedAnnotationMetaDraft}
            metaError={selectedAnnotationMetaError}
            pendingCount={pendingAnnotationCount}
            saving={saving}
            detailsOpen={annotationDetailsOpen}
            onToggleDetails={() => setAnnotationDetailsOpen((open) => !open)}
            onSelectNextPendingAnnotation={onSelectNextPendingAnnotation}
            onVerifySelectedAnnotation={onVerifySelectedAnnotation}
            onUpdateLabel={onUpdateSelectedAnnotationLabel}
            onUpdateStatus={onUpdateSelectedAnnotationStatus}
            onUpdateComment={onUpdateSelectedAnnotationComment}
            onUpdateMeta={onUpdateSelectedAnnotationMeta}
            onDelete={onDeleteSelectedAnnotation}
          />
        ) : null}

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
            <DocumentAnnotationListPanel
              currentDocument={currentDocument}
              groups={visibleAnnotationGroups}
              pendingCount={pendingAnnotationCount}
              selectedAnnotationId={selectedAnnotationId}
              accordionOpen={accordionOpen}
              annotationRowRefs={annotationRowRefs}
              onFocusLabel={onFocusLabel}
              onSelectAnnotation={(annotationId) => {
                onSelectionDraftChange(null);
                onSelectAnnotation(annotationId);
              }}
              onToggleAnnotationGroup={onToggleAnnotationGroup}
            />
          )}
        </Box>
      </Paper>
    </>
  );
}
