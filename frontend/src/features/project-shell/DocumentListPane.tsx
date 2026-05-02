import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, Ref, UIEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  ListItemButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import type { DocumentSortValue, StatusValue } from "../../api-contract";
import type { DocumentListItem } from "../../types";
import { useI18n } from "../../i18n/useI18n";
import { getDocumentSnippetParts } from "../../utils";
import { getDocumentHoverPreview } from "../workspace/workspaceUtils";
import { floatingTooltipSlotProps } from "./projectShellConstants";

const DOCUMENT_LIST_EDGE_THRESHOLD = 32;

type DocumentScrollAnchor = {
  documentId: string;
  top: number;
};

type DocumentListPaneProps = {
  selectedDocumentId: string | null;
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
  documentListScrollRef: Ref<HTMLDivElement>;
  getDisplayDocumentStatus: (document: DocumentListItem) => StatusValue;
  saving: boolean;
  deleteDisabled?: boolean;
  onOpenCreateDocument: () => void;
  onSearchQueryChange: (value: string) => void;
  onSortModeChange: (value: DocumentSortValue) => void;
  onReturnToSelectedDocument: () => Promise<unknown> | unknown;
  onLoadPreviousDocuments: () => Promise<unknown> | unknown;
  onLoadMoreDocuments: () => Promise<unknown> | unknown;
  onSelectDocument: (documentId: string) => void;
  onRequestDeleteDocument: (documentId: string) => void;
};

type DocumentListControlsProps = Pick<
  DocumentListPaneProps,
  | "pendingDocumentTotal"
  | "documentTotal"
  | "searchQuery"
  | "sortMode"
  | "saving"
  | "onOpenCreateDocument"
  | "onSearchQueryChange"
  | "onSortModeChange"
>;

type DocumentListRowProps = {
  document: DocumentListItem;
  selected: boolean;
  deleteButtonVisible: boolean;
  status: StatusValue;
  searchQuery: string;
  deleteDisabled: boolean;
  onSetRowElement: (documentId: string, element: HTMLDivElement | null) => void;
  onSelect: (documentId: string) => void;
  onHoverStart: (documentId: string) => void;
  onHoverEnd: (documentId: string) => void;
  onFocus: (documentId: string) => void;
  onBlur: (documentId: string) => void;
  onRequestDelete: (documentId: string) => void;
};

function scrollRowIntoView(row: Element | null) {
  if (!row || typeof row.scrollIntoView !== "function") {
    return;
  }
  row.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function getDocumentRows(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>("[data-document-row='true']"));
}

function findDocumentRow(element: HTMLElement, documentId: string) {
  return getDocumentRows(element).find((row) => row.dataset.documentId === documentId) ?? null;
}

function getDocumentScrollAnchor(element: HTMLElement): DocumentScrollAnchor | null {
  const containerTop = element.getBoundingClientRect().top;
  const row = getDocumentRows(element).find((candidate) => candidate.getBoundingClientRect().bottom > containerTop) ?? null;
  if (!row || !row.dataset.documentId) {
    return null;
  }
  return {
    documentId: row.dataset.documentId,
    top: row.getBoundingClientRect().top,
  };
}

function isDocumentRowOutsideViewport(row: HTMLElement, element: HTMLElement) {
  const containerRect = element.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  return rowRect.bottom <= containerRect.top || rowRect.top >= containerRect.bottom;
}

function assignRef<T>(ref: Ref<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref) {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

function useDocumentListScroll({
  selectedDocumentId,
  visibleDocuments,
  currentDocumentOutsideWindow,
  documentsLoadingMore,
  documentWindowStartOffset,
  documentNextOffset,
  documentTotal,
  documentListScrollRef,
  onReturnToSelectedDocument,
  onLoadPreviousDocuments,
  onLoadMoreDocuments,
}: Pick<
  DocumentListPaneProps,
  | "selectedDocumentId"
  | "visibleDocuments"
  | "currentDocumentOutsideWindow"
  | "documentsLoadingMore"
  | "documentWindowStartOffset"
  | "documentNextOffset"
  | "documentTotal"
  | "documentListScrollRef"
  | "onReturnToSelectedDocument"
  | "onLoadPreviousDocuments"
  | "onLoadMoreDocuments"
>) {
  const [selectedDocumentOutsideViewport, setSelectedDocumentOutsideViewport] = useState(false);
  const documentListElementRef = useRef<HTMLDivElement | null>(null);
  const documentRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScrollAnchorRef = useRef<DocumentScrollAnchor | null>(null);
  const documentPageRequestInFlightRef = useRef(false);
  const selectedDocumentVisible = useMemo(
    () => Boolean(selectedDocumentId && visibleDocuments.some((document) => document.id === selectedDocumentId)),
    [selectedDocumentId, visibleDocuments],
  );

  const updateSelectedDocumentOutsideViewport = useCallback(() => {
    if (currentDocumentOutsideWindow) {
      setSelectedDocumentOutsideViewport(true);
      return;
    }
    if (!selectedDocumentId) {
      setSelectedDocumentOutsideViewport(false);
      return;
    }
    const element = documentListElementRef.current;
    const row = documentRowRefs.current[selectedDocumentId];
    setSelectedDocumentOutsideViewport(Boolean(element && row && isDocumentRowOutsideViewport(row, element)));
  }, [currentDocumentOutsideWindow, selectedDocumentId]);

  useLayoutEffect(() => {
    if (!selectedDocumentId || !selectedDocumentVisible) {
      return;
    }
    scrollRowIntoView(documentRowRefs.current[selectedDocumentId]);
  }, [selectedDocumentId, selectedDocumentVisible]);

  useLayoutEffect(() => {
    const anchor = pendingScrollAnchorRef.current;
    const element = documentListElementRef.current;
    if (!anchor || !element) {
      return;
    }
    const row = findDocumentRow(element, anchor.documentId);
    pendingScrollAnchorRef.current = null;
    if (!row) {
      return;
    }
    element.scrollTop += row.getBoundingClientRect().top - anchor.top;
  }, [visibleDocuments]);

  useLayoutEffect(() => {
    updateSelectedDocumentOutsideViewport();
  }, [updateSelectedDocumentOutsideViewport, visibleDocuments]);

  const setDocumentListElement = useCallback((element: HTMLDivElement | null) => {
    documentListElementRef.current = element;
    assignRef(documentListScrollRef, element);
  }, [documentListScrollRef]);

  const setDocumentRowElement = useCallback((documentId: string, element: HTMLDivElement | null) => {
    if (element) {
      documentRowRefs.current[documentId] = element;
      return;
    }
    delete documentRowRefs.current[documentId];
  }, []);

  const requestDocumentPage = useCallback((loader: () => Promise<unknown> | unknown) => {
    if (documentPageRequestInFlightRef.current) {
      return;
    }
    documentPageRequestInFlightRef.current = true;
    let loadResult: Promise<unknown> | unknown;
    try {
      loadResult = loader();
    } catch (error) {
      documentPageRequestInFlightRef.current = false;
      throw error;
    }
    void Promise.resolve(loadResult).finally(() => {
      documentPageRequestInFlightRef.current = false;
    });
  }, []);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    updateSelectedDocumentOutsideViewport();
    if (
      !documentsLoadingMore &&
      !documentPageRequestInFlightRef.current &&
      documentWindowStartOffset > 0 &&
      element.scrollTop <= DOCUMENT_LIST_EDGE_THRESHOLD
    ) {
      pendingScrollAnchorRef.current = getDocumentScrollAnchor(element);
      requestDocumentPage(onLoadPreviousDocuments);
      return;
    }
    if (
      !documentsLoadingMore &&
      !documentPageRequestInFlightRef.current &&
      documentNextOffset < documentTotal &&
      element.scrollTop + element.clientHeight >= element.scrollHeight - DOCUMENT_LIST_EDGE_THRESHOLD
    ) {
      requestDocumentPage(onLoadMoreDocuments);
    }
  }, [
    documentNextOffset,
    documentTotal,
    documentWindowStartOffset,
    documentsLoadingMore,
    onLoadMoreDocuments,
    onLoadPreviousDocuments,
    requestDocumentPage,
    updateSelectedDocumentOutsideViewport,
  ]);

  const handleReturnToSelectedDocument = useCallback(() => {
    const selectedRow = selectedDocumentId ? documentRowRefs.current[selectedDocumentId] : null;
    if (selectedRow) {
      scrollRowIntoView(selectedRow);
      setSelectedDocumentOutsideViewport(false);
      return;
    }
    void onReturnToSelectedDocument();
  }, [onReturnToSelectedDocument, selectedDocumentId]);

  return {
    selectedDocumentOutsideViewport,
    setDocumentListElement,
    setDocumentRowElement,
    handleScroll,
    handleReturnToSelectedDocument,
  };
}

function DocumentListControls({
  pendingDocumentTotal,
  documentTotal,
  searchQuery,
  sortMode,
  saving,
  onOpenCreateDocument,
  onSearchQueryChange,
  onSortModeChange,
}: DocumentListControlsProps) {
  const { t } = useI18n();

  return (
    <>
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
    </>
  );
}

function DocumentListRow({
  document,
  selected,
  deleteButtonVisible,
  status,
  searchQuery,
  deleteDisabled,
  onSetRowElement,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onFocus,
  onBlur,
  onRequestDelete,
}: DocumentListRowProps) {
  const { t } = useI18n();

  return (
    <Tooltip
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
        data-document-id={document.id}
        data-document-row="true"
        ref={(element) => onSetRowElement(document.id, element)}
        selected={selected}
        onClick={() => onSelect(document.id)}
        onMouseEnter={() => onHoverStart(document.id)}
        onMouseLeave={() => onHoverEnd(document.id)}
        onFocus={() => onFocus(document.id)}
        onBlur={(event) => {
          const nextFocused = event.relatedTarget as Node | null;
          if (!event.currentTarget.contains(nextFocused)) {
            onBlur(document.id);
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
          borderColor: selected ? "primary.main" : "#dbe3ee",
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
            label={status}
            color={status === "verified" ? "success" : "warning"}
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
          <Tooltip title={t("projectShell.workspace.deleteDocumentTooltip")}>
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
                  onRequestDelete(document.id);
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
}

function ReturnToSelectedDocumentBar({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();

  return (
    <Paper
      variant="outlined"
      square
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2,
        px: 0.5,
        py: 0.25,
        minHeight: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.paper",
        borderColor: alpha("#1a73e8", 0.16),
        borderLeft: 0,
        borderRight: 0,
        boxShadow: "none",
      }}
    >
      <Button size="small" onClick={onClick} sx={{ minWidth: "auto", minHeight: 24, px: 1, py: 0, lineHeight: 1.2 }}>
        {t("projectShell.workspace.returnToSelectedDocument")}
      </Button>
    </Paper>
  );
}

export function DocumentListPane({
  selectedDocumentId,
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
  getDisplayDocumentStatus,
  saving,
  deleteDisabled = false,
  onOpenCreateDocument,
  onSearchQueryChange,
  onSortModeChange,
  onReturnToSelectedDocument,
  onLoadPreviousDocuments,
  onLoadMoreDocuments,
  onSelectDocument,
  onRequestDeleteDocument,
}: DocumentListPaneProps) {
  const { t } = useI18n();
  const [hoveredDocumentId, setHoveredDocumentId] = useState<string | null>(null);
  const [focusedDocumentId, setFocusedDocumentId] = useState<string | null>(null);
  const {
    selectedDocumentOutsideViewport,
    setDocumentListElement,
    setDocumentRowElement,
    handleScroll,
    handleReturnToSelectedDocument,
  } = useDocumentListScroll({
    selectedDocumentId,
    visibleDocuments,
    currentDocumentOutsideWindow,
    documentsLoadingMore,
    documentWindowStartOffset,
    documentNextOffset,
    documentTotal,
    documentListScrollRef,
    onReturnToSelectedDocument,
    onLoadPreviousDocuments,
    onLoadMoreDocuments,
  });

  useEffect(() => {
    setFocusedDocumentId((current) => (current && current !== selectedDocumentId ? null : current));
  }, [selectedDocumentId]);

  return (
    <Paper sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <DocumentListControls
        pendingDocumentTotal={pendingDocumentTotal}
        documentTotal={documentTotal}
        searchQuery={searchQuery}
        sortMode={sortMode}
        saving={saving}
        onOpenCreateDocument={onOpenCreateDocument}
        onSearchQueryChange={onSearchQueryChange}
        onSortModeChange={onSortModeChange}
      />
      <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
        <Box
          data-testid="document-list-scroll"
          ref={setDocumentListElement}
          onScroll={handleScroll}
          sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1, height: "100%", minHeight: 0, overflow: "auto" }}
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
          {visibleDocuments.map((document) => {
            const deleteButtonVisible =
              document.id === selectedDocumentId || hoveredDocumentId === document.id || focusedDocumentId === document.id;
            return (
              <DocumentListRow
                key={document.id}
                document={document}
                selected={document.id === selectedDocumentId}
                deleteButtonVisible={deleteButtonVisible}
                status={getDisplayDocumentStatus(document)}
                searchQuery={searchQuery}
                deleteDisabled={deleteDisabled}
                onSetRowElement={setDocumentRowElement}
                onSelect={onSelectDocument}
                onHoverStart={setHoveredDocumentId}
                onHoverEnd={(documentId) => setHoveredDocumentId((current) => (current === documentId ? null : current))}
                onFocus={setFocusedDocumentId}
                onBlur={(documentId) => setFocusedDocumentId((current) => (current === documentId ? null : current))}
                onRequestDelete={onRequestDeleteDocument}
              />
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
        {selectedDocumentOutsideViewport ? <ReturnToSelectedDocumentBar onClick={handleReturnToSelectedDocument} /> : null}
      </Box>
    </Paper>
  );
}
