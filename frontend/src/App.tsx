import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Autocomplete,
  Box,
  Button,
  Chip,
  ClickAwayListener,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Fade,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Popper,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import LabelRoundedIcon from "@mui/icons-material/LabelRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import WorkspacesRoundedIcon from "@mui/icons-material/WorkspacesRounded";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import { DocumentCanvas } from "./components/DocumentCanvas";
import {
  contextSnippet,
  getDocumentHoverPreview,
  sortAnnotationsInPanelOrder,
} from "./features/workspace/workspaceUtils";
import { useToast } from "./hooks/useToast";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import type {
  AnnotationRecord,
  AnnotationSearchItemRecord,
  DocumentRecord,
  DocumentListItem,
  JsonObject,
  LabelRecord,
  LabelSurfaceGroupRecord,
  ProjectBundle,
  StatusValue,
  UserRecord,
} from "./types";
import {
  buildExportFilename,
  deepClone,
  documentMatchesSearch,
  downloadJson,
  getDocumentSnippetParts,
  getDocumentStatus,
  getProjectGuideline,
  groupAnnotationsByLabel,
  isShortcutBlockedTarget,
  isLocalId,
  makeLocalId,
  readJsonFile,
  setProjectGuideline,
} from "./utils";

type PendingAction =
  | { type: "doc"; docId: string }
  | { type: "settings" }
  | { type: "workspace" }
  | { type: "projects" };

type SelectionPreview = {
  start: number;
  end: number;
  text: string;
};

const TOKEN_KEY = "layered-span-studio/token";
const EXAMPLES_BATCH_SIZE = 8;
const DOCUMENT_PAGE_SIZE = 40;
const DOCUMENT_WINDOW_SIZE = 120;

function ProjectShell({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: UserRecord;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId = "" } = useParams();
  const view: "workspace" | "settings" = location.pathname.endsWith("/settings") ? "settings" : "workspace";
  const { toast, showToast, closeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = useState<Pick<ProjectBundle, "project" | "labels"> | null>(null);
  const [documentSnapshotsById, setDocumentSnapshotsById] = useState<Record<string, DocumentRecord>>({});
  const [historyState, setHistoryState] = useState<{ documentId: string | null; entries: DocumentRecord[]; index: number }>({
    documentId: null,
    entries: [],
    index: -1,
  });
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [focusedLabelId, setFocusedLabelId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectionPreview, setSelectionPreview] = useState<SelectionPreview | null>(null);
  const [rightTab, setRightTab] = useState<"examples" | "annotations">("examples");
  const [annotationEditCollapsed, setAnnotationEditCollapsed] = useState(true);
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("created");
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [createDocOpen, setCreateDocOpen] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocText, setNewDocText] = useState("");
  const [labelDraft, setLabelDraft] = useState({
    id: "",
    name: "",
    color: "#1a73e8",
    description: "",
  });
  const [settingsImportFile, setSettingsImportFile] = useState<File | null>(null);
  const [exportPending, setExportPending] = useState(true);
  const [exportVerified, setExportVerified] = useState(true);
  const [documentList, setDocumentList] = useState<DocumentListItem[]>([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [pendingDocumentTotal, setPendingDocumentTotal] = useState(0);
  const [documentNextOffset, setDocumentNextOffset] = useState(0);
  const [documentsLoadingMore, setDocumentsLoadingMore] = useState(false);
  const [sameLabelExamples, setSameLabelExamples] = useState<LabelSurfaceGroupRecord[]>([]);
  const [sameLabelExamplesTotal, setSameLabelExamplesTotal] = useState(0);
  const [sameLabelExamplesOffset, setSameLabelExamplesOffset] = useState(0);
  const [sameLabelExamplesLoadingMore, setSameLabelExamplesLoadingMore] = useState(false);
  const [sameLabelExampleDetails, setSameLabelExampleDetails] = useState<Record<string, AnnotationSearchItemRecord[]>>({});
  const [sameSurfaceExamples, setSameSurfaceExamples] = useState<AnnotationSearchItemRecord[]>([]);
  const [sameSurfaceExamplesTotal, setSameSurfaceExamplesTotal] = useState(0);
  const [sameSurfaceExamplesOffset, setSameSurfaceExamplesOffset] = useState(0);
  const [sameSurfaceExamplesLoadingMore, setSameSurfaceExamplesLoadingMore] = useState(false);
  const shortcutButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingActionConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const documentListScrollRef = useRef<HTMLDivElement | null>(null);
  const sameLabelExamplesScrollRef = useRef<HTMLDivElement | null>(null);
  const sameSurfaceExamplesScrollRef = useRef<HTMLDivElement | null>(null);
  const shortcutDragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const documentListRequestIdRef = useRef(0);
  const [shortcutPanelOffset, setShortcutPanelOffset] = useState({ x: 0, y: 0 });
  const [shortcutDragging, setShortcutDragging] = useState(false);
  const initialDocumentListLoadedRef = useRef(false);

  function toDocumentListItem(document: DocumentRecord): DocumentListItem {
    return {
      id: document.id,
      project_id: document.project_id,
      project_name: document.project_name,
      document_name: document.document_name,
      text: document.text,
      meta: document.meta,
    };
  }

  function trimDocumentWindow(items: DocumentListItem[], selectedId: string | null) {
    if (items.length <= DOCUMENT_WINDOW_SIZE) {
      return items;
    }
    let overflow = items.length - DOCUMENT_WINDOW_SIZE;
    return items.filter((item) => {
      if (overflow > 0 && item.id !== selectedId) {
        overflow -= 1;
        return false;
      }
      return true;
    });
  }

  function mergeDocumentWindow(existing: DocumentListItem[], incoming: DocumentListItem[], selectedId: string | null) {
    const merged = [...existing];
    incoming.forEach((item) => {
      const index = merged.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) {
        merged[index] = item;
      } else {
        merged.push(item);
      }
    });
    return trimDocumentWindow(merged, selectedId);
  }

  async function loadBundle() {
    setLoading(true);
    const requestId = ++documentListRequestIdRef.current;
    try {
      const [project, { labels }, documentsResponse] = await Promise.all([
        api.getProject(token, projectId),
        api.listLabels(token, projectId),
        api.listDocuments(token, projectId, {
          offset: 0,
          limit: DOCUMENT_PAGE_SIZE,
          search: searchQuery,
          sort: sortMode,
        }),
      ]);
      if (requestId !== documentListRequestIdRef.current) {
        return;
      }
      const firstDocId = documentsResponse.documents[0]?.id ?? null;
      const loadedDocuments = firstDocId ? [await api.getDocument(token, projectId, firstDocId)] : [];
      if (requestId !== documentListRequestIdRef.current) {
        return;
      }
      const nextBundle = {
        project,
        labels,
        documents: loadedDocuments,
      } satisfies ProjectBundle;
      setBundle(nextBundle);
      setSettingsSnapshot({
        project: deepClone(project),
        labels: deepClone(labels),
      });
      setDocumentSnapshotsById(
        Object.fromEntries(loadedDocuments.map((document) => [document.id, deepClone(document)])),
      );
      setHistoryState({
        documentId: loadedDocuments[0]?.id ?? null,
        entries: loadedDocuments[0] ? [deepClone(loadedDocuments[0])] : [],
        index: loadedDocuments[0] ? 0 : -1,
      });
      setDocumentList(trimDocumentWindow(documentsResponse.documents, firstDocId));
      setDocumentTotal(documentsResponse.total);
      setPendingDocumentTotal(documentsResponse.pending_total);
      setDocumentNextOffset(documentsResponse.offset + documentsResponse.documents.length);
      initialDocumentListLoadedRef.current = true;
      setSelectedDocId(firstDocId);
      setFocusedLabelId(nextBundle.labels[0]?.id ?? null);
      setSelectedAnnotationId(null);
      setSelectionPreview(null);
      setRightTab("examples");
      setAnnotationEditCollapsed(true);
      setAccordionOpen(Object.fromEntries(nextBundle.labels.map((label) => [label.id, true])));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Workspace の読み込みに失敗した", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBundle();
  }, [projectId, token]);

  useEffect(() => {
    if (!bundle || !selectedDocId || bundle.documents.some((document) => document.id === selectedDocId)) {
      return;
    }
    let active = true;
    void api
      .getDocument(token, projectId, selectedDocId)
      .then((document) => {
        if (!active) {
          return;
        }
        setBundle((current) =>
          current
            ? {
                ...current,
                documents: [...current.documents.filter((item) => item.id !== document.id), document],
              }
            : current,
        );
        setDocumentSnapshotsById((current) => ({
          ...current,
          [document.id]: deepClone(document),
        }));
      })
      .catch((error) => {
        if (active) {
          showToast(error instanceof Error ? error.message : "Document の取得に失敗した", "error");
        }
      });
    return () => {
      active = false;
    };
  }, [bundle, projectId, selectedDocId, token]);

  async function fetchDocumentPage(
    reset: boolean,
    selectedIdOverride?: string | null,
  ): Promise<DocumentListItem[]> {
    const requestId = ++documentListRequestIdRef.current;
    if (!reset) {
      setDocumentsLoadingMore(true);
    }
    try {
      const response = await api.listDocuments(token, projectId, {
        offset: reset ? 0 : documentNextOffset,
        limit: DOCUMENT_PAGE_SIZE,
        search: searchQuery,
        sort: sortMode,
      });
      if (requestId !== documentListRequestIdRef.current) {
        return [];
      }
      setDocumentTotal(response.total);
      setPendingDocumentTotal(response.pending_total);
      setDocumentNextOffset(response.offset + response.documents.length);
      setDocumentList((current) =>
        reset
          ? trimDocumentWindow(response.documents, selectedIdOverride ?? selectedDocId)
          : mergeDocumentWindow(current, response.documents, selectedIdOverride ?? selectedDocId),
      );
      return response.documents;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Document 一覧の取得に失敗した", "error");
      return [];
    } finally {
      setDocumentsLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!bundle || !initialDocumentListLoadedRef.current) {
      return;
    }
    void fetchDocumentPage(true);
  }, [searchQuery, sortMode]);

  useEffect(() => {
    if (!bundle) {
      return;
    }
    setDocumentList((current) =>
      current.map((item) => {
        const loaded = bundle.documents.find((document) => document.id === item.id);
        return loaded ? toDocumentListItem(loaded) : item;
      }),
    );
  }, [bundle]);

  const currentDocument = useMemo(
    () => bundle?.documents.find((document) => document.id === selectedDocId) ?? bundle?.documents[0] ?? null,
    [bundle, selectedDocId],
  );
  const currentDocumentSnapshot = currentDocument ? documentSnapshotsById[currentDocument.id] ?? null : null;

  const focusedLabel = useMemo(
    () => bundle?.labels.find((label) => label.id === focusedLabelId) ?? bundle?.labels[0] ?? null,
    [bundle, focusedLabelId],
  );

  const selectedAnnotation = useMemo(
    () => currentDocument?.annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null,
    [currentDocument, selectedAnnotationId],
  );
  const settingsDirty = useMemo(() => {
    if (!bundle || !settingsSnapshot) {
      return false;
    }
    return (
      JSON.stringify(bundle.project) !== JSON.stringify(settingsSnapshot.project) ||
      JSON.stringify(bundle.labels) !== JSON.stringify(settingsSnapshot.labels)
    );
  }, [bundle, settingsSnapshot]);
  const currentDocumentDirty = useMemo(() => {
    if (!currentDocument || !currentDocumentSnapshot) {
      return false;
    }
    return JSON.stringify(currentDocument) !== JSON.stringify(currentDocumentSnapshot);
  }, [currentDocument, currentDocumentSnapshot]);
  const dirty = view === "workspace" ? currentDocumentDirty : settingsDirty;
  const canUndo =
    view === "workspace" &&
    historyState.documentId === currentDocument?.id &&
    historyState.index > 0;
  const canRedo =
    view === "workspace" &&
    historyState.documentId === currentDocument?.id &&
    historyState.index >= 0 &&
    historyState.index < historyState.entries.length - 1;

  const currentHiddenBySearch = Boolean(
    currentDocument && searchQuery.trim() && !documentMatchesSearch(currentDocument, searchQuery),
  );

  const pinnedCurrentDocument = useMemo(() => {
    if (!currentDocument) {
      return null;
    }
    if (documentList.some((document) => document.id === currentDocument.id)) {
      return null;
    }
    if (searchQuery.trim() && !documentMatchesSearch(currentDocument, searchQuery)) {
      return null;
    }
    return toDocumentListItem(currentDocument);
  }, [currentDocument, documentList, searchQuery]);

  const visibleDocuments = useMemo(
    () => (pinnedCurrentDocument ? [pinnedCurrentDocument, ...documentList] : documentList),
    [documentList, pinnedCurrentDocument],
  );

  useEffect(() => {
    if (!currentDocument || historyState.documentId === currentDocument.id) {
      return;
    }
    setHistoryState({
      documentId: currentDocument.id,
      entries: [deepClone(currentDocumentSnapshot ?? currentDocument)],
      index: 0,
    });
  }, [currentDocument, currentDocumentSnapshot, historyState.documentId]);

  function handleShortcutPanelToggle() {
    setShortcutOpen((current) => !current);
  }

  function handleShortcutDragStart(event: React.PointerEvent<HTMLDivElement>) {
    shortcutDragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: shortcutPanelOffset.x,
      originY: shortcutPanelOffset.y,
    };
    setShortcutDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleShortcutDragMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!shortcutDragStateRef.current) {
      return;
    }
    const nextX = shortcutDragStateRef.current.originX + (event.clientX - shortcutDragStateRef.current.startX);
    const nextY = shortcutDragStateRef.current.originY + (event.clientY - shortcutDragStateRef.current.startY);
    setShortcutPanelOffset({ x: nextX, y: nextY });
  }

  function handleShortcutDragEnd(event: React.PointerEvent<HTMLDivElement>) {
    shortcutDragStateRef.current = null;
    setShortcutDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const keyLower = event.key.toLowerCase();
      const shortcutBlocked = isShortcutBlockedTarget(event.target);
      if (shortcutBlocked) {
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        handleShortcutPanelToggle();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && keyLower === "s") {
        event.preventDefault();
        void handleSave();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSubmit();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && keyLower === "z" && !event.shiftKey) {
        event.preventDefault();
        undoBundle();
        return;
      }
      if (
        (((event.metaKey || event.ctrlKey) && keyLower === "y") ||
          ((event.metaKey || event.ctrlKey) && keyLower === "z" && event.shiftKey))
      ) {
        event.preventDefault();
        redoBundle();
        return;
      }
      if (!bundle || !currentDocument) {
        return;
      }
      if (keyLower === "j") {
        event.preventDefault();
        void moveDocumentByDirection(1, event.shiftKey);
        return;
      }
      if (keyLower === "k") {
        event.preventDefault();
        void moveDocumentByDirection(-1, event.shiftKey);
        return;
      }
      if (keyLower === "h" || event.key === "ArrowLeft") {
        event.preventDefault();
        moveLabelByDirection(-1);
        return;
      }
      if (keyLower === "l" || event.key === "ArrowRight") {
        event.preventDefault();
        moveLabelByDirection(1);
        return;
      }
      if (event.key === "[") {
        event.preventDefault();
        moveRightPanelTabByDirection(-1);
        return;
      }
      if (event.key === "]") {
        event.preventDefault();
        moveRightPanelTabByDirection(1);
        return;
      }
      if (keyLower === "n") {
        event.preventDefault();
        moveAnnotationByDirection(1, false);
        return;
      }
      if (keyLower === "p") {
        event.preventDefault();
        moveAnnotationByDirection(-1, false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveAnnotationByDirection(1, true);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveAnnotationByDirection(-1, true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedAnnotationId(null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedAnnotationId) {
        event.preventDefault();
        deleteSelectedAnnotation();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bundle, canRedo, canUndo, currentDocument, focusedLabelId, rightTab, selectedAnnotationId, searchQuery, sortMode, view, currentDocumentDirty, settingsDirty]);

  useEffect(() => {
    if (!pendingAction) {
      return;
    }
    const focusTimer = requestAnimationFrame(() => {
      pendingActionConfirmButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(focusTimer);
  }, [pendingAction]);

  const sameSurfaceTarget = useMemo(() => {
    return (
      selectionPreview && selectionPreview.text.trim()
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
          : null
    );
  }, [focusedLabel?.id, selectedAnnotation, selectionPreview]);

  async function loadSameLabelExamples(reset: boolean) {
    if (!focusedLabel || !bundle) {
      setSameLabelExamples([]);
      setSameLabelExamplesTotal(0);
      setSameLabelExamplesOffset(0);
      return;
    }
    setSameLabelExamplesLoadingMore(true);
    try {
      const response = await api.listLabelSurfaceGroups(token, bundle.project.id, focusedLabel.id, {
        offset: reset ? 0 : sameLabelExamplesOffset,
        limit: EXAMPLES_BATCH_SIZE,
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
    if (!sameSurfaceTarget || !bundle) {
      setSameSurfaceExamples([]);
      setSameSurfaceExamplesTotal(0);
      setSameSurfaceExamplesOffset(0);
      return;
    }
    setSameSurfaceExamplesLoadingMore(true);
    try {
      const response = await api.searchAnnotations(token, bundle.project.id, {
        text: sameSurfaceTarget.text,
        status: "all",
        labelId: sameSurfaceTarget.labelId ?? null,
        excludeAnnotationId: sameSurfaceTarget.annotationId ?? null,
        offset: reset ? 0 : sameSurfaceExamplesOffset,
        limit: EXAMPLES_BATCH_SIZE,
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
    if (!bundle || !focusedLabel || sameLabelExampleDetails[surfaceKey]) {
      return;
    }
    try {
      const response = await api.searchAnnotations(token, bundle.project.id, {
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
  }, [bundle?.project.id, focusedLabel?.id, selectedAnnotation?.id]);

  useEffect(() => {
    void loadSameSurfaceExamples(true);
  }, [bundle?.project.id, sameSurfaceTarget?.text, sameSurfaceTarget?.annotationId, sameSurfaceTarget?.labelId]);

  function mutateCurrentDocument(mutator: (draft: DocumentRecord) => void) {
    if (!bundle || !currentDocument) {
      return;
    }
    const draft = deepClone(currentDocument);
    mutator(draft);
    if (JSON.stringify(draft) === JSON.stringify(currentDocument)) {
      return;
    }
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((document) => (document.id === draft.id ? draft : document)),
          }
        : current,
    );
    setHistoryState((current) => {
      const nextEntries =
        current.documentId === draft.id ? current.entries.slice(0, current.index + 1) : [];
      nextEntries.push(deepClone(draft));
      const cappedEntries = nextEntries.length > 50 ? nextEntries.slice(nextEntries.length - 50) : nextEntries;
      return {
        documentId: draft.id,
        entries: cappedEntries,
        index: cappedEntries.length - 1,
      };
    });
  }

  function mutateSettingsBundle(mutator: (draft: ProjectBundle) => void) {
    if (!bundle) {
      return;
    }
    const draft = deepClone(bundle);
    mutator(draft);
    const currentState = JSON.stringify({ project: bundle.project, labels: bundle.labels });
    const nextState = JSON.stringify({ project: draft.project, labels: draft.labels });
    if (currentState === nextState) {
      return;
    }
    setBundle((current) =>
      current
        ? {
            ...current,
            project: draft.project,
            labels: draft.labels,
          }
        : current,
    );
  }

  function undoBundle() {
    if (!canUndo || !currentDocument) {
      return;
    }
    const nextIndex = historyState.index - 1;
    const nextDocument = historyState.entries[nextIndex];
    if (!nextDocument) {
      return;
    }
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((document) => (document.id === nextDocument.id ? deepClone(nextDocument) : document)),
          }
        : current,
    );
    setHistoryState((current) => ({ ...current, index: nextIndex }));
  }

  function redoBundle() {
    if (!canRedo || !currentDocument) {
      return;
    }
    const nextIndex = historyState.index + 1;
    const nextDocument = historyState.entries[nextIndex];
    if (!nextDocument) {
      return;
    }
    setBundle((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((document) => (document.id === nextDocument.id ? deepClone(nextDocument) : document)),
          }
        : current,
    );
    setHistoryState((current) => ({ ...current, index: nextIndex }));
  }

  function buildDocumentBundlePayload(document: DocumentRecord, forceVerified: boolean) {
    return document.annotations.map((annotation) => ({
      id: isLocalId(annotation.id) ? null : annotation.id,
      label_id: annotation.label_id,
      start: annotation.start,
      end: annotation.end,
      span_text: annotation.span_text,
      comment: annotation.comment,
      status: forceVerified ? "verified" : annotation.status,
      meta: annotation.meta ?? {},
    }));
  }

  async function saveCurrentDocument(successMessage: string | null = "保存した", forceVerified = false) {
    if (!bundle || !currentDocument) {
      return null;
    }
    setSaving(true);
    try {
      const payload = buildDocumentBundlePayload(currentDocument, forceVerified);
      const savedDocument = forceVerified
        ? await api.submitDocumentBundle(token, bundle.project.id, currentDocument.id, payload)
        : await api.saveDocumentBundle(token, bundle.project.id, currentDocument.id, payload);
      setBundle((current) =>
        current
          ? {
              ...current,
              documents: current.documents.map((document) => (document.id === savedDocument.id ? savedDocument : document)),
            }
          : current,
      );
      setDocumentSnapshotsById((current) => ({
        ...current,
        [savedDocument.id]: deepClone(savedDocument),
      }));
      setHistoryState({
        documentId: savedDocument.id,
        entries: [deepClone(savedDocument)],
        index: 0,
      });
      setSelectedAnnotationId(null);
      if (successMessage) {
        showToast(successMessage, "success");
      }
      return savedDocument;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存に失敗した", "error");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings(successMessage: string | null = "保存した") {
    if (!bundle || !settingsSnapshot) {
      return null;
    }
    setSaving(true);
    try {
      const saved = await api.saveProjectBundle(
        token,
        {
          project: deepClone(settingsSnapshot.project),
          labels: deepClone(settingsSnapshot.labels),
          documents: deepClone(bundle.documents),
        },
        bundle,
      );
      const refreshedCurrentDocument = selectedDocId
        ? await api.getDocument(token, bundle.project.id, selectedDocId).catch(() => null)
        : null;
      setBundle((current) =>
        current
          ? {
              ...current,
              project: saved.project,
              labels: saved.labels,
              documents: refreshedCurrentDocument ? [refreshedCurrentDocument] : current.documents,
            }
          : current,
      );
      setSettingsSnapshot({
        project: deepClone(saved.project),
        labels: deepClone(saved.labels),
      });
      setDocumentSnapshotsById(
        refreshedCurrentDocument
          ? {
              [refreshedCurrentDocument.id]: deepClone(refreshedCurrentDocument),
            }
          : {},
      );
      if (refreshedCurrentDocument) {
        setHistoryState({
          documentId: refreshedCurrentDocument.id,
          entries: [deepClone(refreshedCurrentDocument)],
          index: 0,
        });
      }
      if (successMessage) {
        showToast(successMessage, "success");
      }
      return saved;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存に失敗した", "error");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function moveDocumentByDirection(direction: number, pendingOnly: boolean) {
    if (!bundle || visibleDocuments.length === 0 || !currentDocument) {
      return;
    }
    const currentIndex = visibleDocuments.findIndex((document) => document.id === currentDocument.id);
    if (currentIndex < 0) {
      requestAction({
        type: "doc",
        docId: direction > 0 ? visibleDocuments[0].id : visibleDocuments[visibleDocuments.length - 1].id,
      });
      return;
    }
    let index = currentIndex + direction;
    while (index >= 0 && index < visibleDocuments.length) {
      const candidate = visibleDocuments[index];
      if (!pendingOnly || getDocumentStatus(candidate) === "pending") {
        requestAction({ type: "doc", docId: candidate.id });
        return;
      }
      index += direction;
    }
    if (direction > 0 && documentNextOffset < documentTotal) {
      const appendedDocuments = await fetchDocumentPage(false);
      const nextCandidate = appendedDocuments.find((document) => !pendingOnly || getDocumentStatus(document) === "pending");
      if (nextCandidate) {
        requestAction({ type: "doc", docId: nextCandidate.id });
        return;
      }
    }
    showToast(pendingOnly ? "移動先の pending doc がない" : "移動先の doc がない", "info");
  }

  function moveLabelByDirection(direction: number) {
    if (!bundle || bundle.labels.length === 0) {
      return;
    }
    const currentIndex = bundle.labels.findIndex((label) => label.id === focusedLabelId);
    const nextIndex = (currentIndex >= 0 ? currentIndex : 0) + direction;
    if (nextIndex < 0 || nextIndex >= bundle.labels.length) {
      return;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setFocusedLabelId(bundle.labels[nextIndex].id);
    setSelectedAnnotationId(null);
    setSelectionPreview(null);
  }

  function moveRightPanelTabByDirection(direction: number) {
    const tabs: Array<"examples" | "annotations"> = ["examples", "annotations"];
    const currentIndex = tabs.indexOf(rightTab);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= tabs.length) {
      return;
    }
    setRightTab(tabs[nextIndex]);
  }

  function moveAnnotationByDirection(direction: number, allowCrossGroup: boolean) {
    if (!currentDocument || currentDocument.annotations.length === 0 || !bundle) {
      return;
    }
    const orderedAll = sortAnnotationsInPanelOrder(currentDocument, bundle.labels);
    const ordered = orderedAll.filter((annotation) => annotation.label_id === focusedLabelId);
    if (!allowCrossGroup && ordered.length === 0) {
      showToast("現在 Label に Annotation がない", "info");
      return;
    }
    const current = currentDocument.annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null;
    let next: AnnotationRecord | null = null;
    if (allowCrossGroup) {
      const currentIndex = current ? orderedAll.findIndex((annotation) => annotation.id === current.id) : -1;
      if (currentIndex >= 0) {
        next = orderedAll[currentIndex + direction] ?? null;
      } else if (ordered.length > 0) {
        next = direction > 0 ? ordered[0] : ordered[ordered.length - 1];
      } else {
        next = direction > 0 ? orderedAll[0] : orderedAll[orderedAll.length - 1];
      }
    } else {
      const sameLabelSelection = current?.label_id === focusedLabelId;
      const currentIndex = sameLabelSelection ? ordered.findIndex((annotation) => annotation.id === current?.id) : -1;
      const nextIndex = currentIndex < 0 ? (direction > 0 ? 0 : ordered.length - 1) : currentIndex + direction;
      next = ordered[nextIndex] ?? null;
    }
    if (!next) {
      return;
    }
    setSelectedAnnotationId(next.id);
    setSelectionPreview(null);
    setFocusedLabelId(next.label_id);
  }

  function deleteSelectedAnnotation() {
    if (!currentDocument || !selectedAnnotationId) {
      return;
    }
    mutateCurrentDocument((draft) => {
      draft.annotations = draft.annotations.filter((annotation) => annotation.id !== selectedAnnotationId);
    });
    setSelectedAnnotationId(null);
    setSelectionPreview(null);
  }

  async function handleSave() {
    if (view === "settings") {
      return saveSettings();
    }
    const savedDocument = await saveCurrentDocument();
    if (!savedDocument) {
      return null;
    }
    await fetchDocumentPage(true, savedDocument.id);
    return savedDocument;
  }

  async function handleSubmit() {
    if (!bundle || !currentDocument || view !== "workspace") {
      return;
    }
    const savedDocument = await saveCurrentDocument(null, true);
    if (!savedDocument) {
      return;
    }
    const refreshedDocuments = await fetchDocumentPage(true, savedDocument.id);
    const currentIndex = refreshedDocuments.findIndex((document) => document.id === savedDocument.id);
    const forwardPending =
      currentIndex >= 0
        ? refreshedDocuments.slice(currentIndex + 1).find((document) => getDocumentStatus(document) === "pending")
        : null;
    const fallbackPending = refreshedDocuments.find((document) => getDocumentStatus(document) === "pending") ?? null;
    const nextId = forwardPending?.id ?? fallbackPending?.id ?? null;
    if (nextId) {
      setSelectedDocId(nextId);
      setSelectedAnnotationId(null);
      setSelectionPreview(null);
      setRightTab("examples");
      setAnnotationEditCollapsed(true);
    }
    showToast("Document を submit した", "success");
  }

  function executePendingAction(action: PendingAction) {
    if (action.type === "doc") {
      setSelectedDocId(action.docId);
      setSelectedAnnotationId(null);
      setSelectionPreview(null);
      setRightTab("examples");
      setAnnotationEditCollapsed(true);
      return;
    }
    if (action.type === "settings") {
      navigate(`/projects/${projectId}/settings`);
      return;
    }
    if (action.type === "workspace") {
      navigate(`/projects/${projectId}`);
      return;
    }
    navigate("/projects");
  }

  function requestAction(action: PendingAction) {
    if (dirty) {
      setPendingAction(action);
      return;
    }
    executePendingAction(action);
  }

  async function resolvePendingAction(mode: "save" | "discard") {
    if (!pendingAction) {
      return;
    }
    const action = pendingAction;
    if (mode === "save") {
      const saved = await handleSave();
      if (!saved) {
        return;
      }
      setPendingAction(null);
      executePendingAction(action);
      return;
    }
    setPendingAction(null);
    if (view === "workspace" && currentDocument && currentDocumentSnapshot) {
      const restoredDocument = deepClone(currentDocumentSnapshot);
      setBundle((current) =>
        current
          ? {
              ...current,
              documents: current.documents.map((document) => (document.id === restoredDocument.id ? restoredDocument : document)),
            }
          : current,
      );
      setHistoryState({
        documentId: restoredDocument.id,
        entries: [deepClone(restoredDocument)],
        index: 0,
      });
      setSelectedAnnotationId(null);
      setSelectionPreview(null);
    } else if (view === "settings" && bundle && settingsSnapshot) {
      setBundle((current) =>
        current
          ? {
              ...current,
              project: deepClone(settingsSnapshot.project),
              labels: deepClone(settingsSnapshot.labels),
            }
          : current,
      );
    }
    executePendingAction(action);
  }

  function handleCreateAnnotation(start: number, end: number, text: string) {
    if (!bundle || !currentDocument || !focusedLabel) {
      return;
    }
    const hasOverlap = currentDocument.annotations.some(
      (annotation) =>
        annotation.label_id === focusedLabel.id &&
        annotation.start < end &&
        annotation.end > start,
    );
    if (hasOverlap) {
      showToast("同一ラベル内で重複する span は作成できない", "warning");
      return;
    }
    const nextAnnotation: AnnotationRecord = {
      id: makeLocalId("annotation"),
      document_id: currentDocument.id,
      document_name: currentDocument.document_name,
      label_id: focusedLabel.id,
      label_name: focusedLabel.name,
      start,
      end,
      span_text: text,
      comment: "",
      status: "pending",
      meta: {},
    };
    mutateCurrentDocument((draft) => {
      draft.annotations.push(nextAnnotation);
    });
    setSelectionPreview(null);
    setSelectedAnnotationId(nextAnnotation.id);
    setRightTab("annotations");
  }

  async function handleSettingsImport() {
    if (!settingsImportFile || !bundle) {
      return;
    }
    try {
      const payload = await readJsonFile(settingsImportFile);
      await api.importProject(token, bundle.project.id, payload);
      showToast("現在の project に import した", "success");
      setSettingsImportFile(null);
      await loadBundle();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Import に失敗した", "error");
    }
  }

  async function handleExport() {
    if (!bundle) {
      return;
    }
    try {
      const payload = await api.exportProject(token, bundle.project.id, exportPending, exportVerified);
      downloadJson(buildExportFilename(bundle.project), payload);
      showToast("Export を開始した", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Export に失敗した", "error");
    }
  }

  if (loading || !bundle) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  const groupedAnnotations = currentDocument ? groupAnnotationsByLabel(currentDocument, bundle.labels) : [];

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: "blur(10px)", borderBottom: "1px solid #d7e2f0" }}>
        <Toolbar sx={{ gap: 2 }}>
          <Button color="inherit" startIcon={<ArrowBackRoundedIcon />} onClick={() => requestAction({ type: "projects" })}>
            Projects
          </Button>
          <Stack sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="h6" noWrap>
              {bundle.project.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {bundle.project.description || "説明なし"} / {user.username}
            </Typography>
          </Stack>
          <Tabs value={view} onChange={(_event, value) => requestAction({ type: value })} sx={{ minHeight: 0 }}>
            <Tab value="workspace" label="Workspace" icon={<WorkspacesRoundedIcon />} iconPosition="start" />
            <Tab value="settings" label="Project Settings" icon={<SettingsRoundedIcon />} iconPosition="start" />
          </Tabs>
          <Tooltip title="ショートカット一覧">
            <IconButton ref={shortcutButtonRef} onClick={handleShortcutPanelToggle}>
              <HelpOutlineRoundedIcon />
            </IconButton>
          </Tooltip>
          <Button onClick={onLogout} color="inherit" startIcon={<LogoutRoundedIcon />}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          p: 2,
          height: "calc(100vh - 81px)",
          boxSizing: "border-box",
          display: "grid",
          gap: 2,
          overflow: "hidden",
          gridTemplateColumns: view === "workspace" ? "320px minmax(540px,1fr) 380px" : "minmax(0,1fr)",
        }}
      >
        {view === "workspace" ? (
          <Paper sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box sx={{ p: 2, display: "grid", gap: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontWeight: 600, letterSpacing: "0.01em" }}
                  >
                    {pendingDocumentTotal} pending / {documentTotal} docs
                  </Typography>
                </Box>
                <Tooltip title="Create Document">
                  <IconButton onClick={() => setCreateDocOpen(true)}>
                    <AddRoundedIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
              <TextField
                placeholder="本文検索"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField select size="small" label="並び順" value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                <MenuItem value="created">作成順</MenuItem>
                <MenuItem value="pending">未完了優先</MenuItem>
                <MenuItem value="updated">最終更新順</MenuItem>
                <MenuItem value="name">document_name 順</MenuItem>
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
                  void fetchDocumentPage(false);
                }
              }}
              sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1, overflow: "auto" }}
            >
              {currentHiddenBySearch ? (
                <Alert severity="info">
                  <Typography variant="body2">現在表示中の Document は検索結果外である。</Typography>
                  <Button
                    size="small"
                    onClick={() => setSearchQuery("")}
                    sx={{ mt: 1, alignSelf: "flex-start", minWidth: "auto", px: 1 }}
                  >
                    検索クリア
                  </Button>
                </Alert>
              ) : null}
              {visibleDocuments.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 2.5 }}>
                  <Typography variant="subtitle2">一致する Document がない</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    検索条件を見直すか、新しい Document を作成する。
                  </Typography>
                </Paper>
              ) : null}
              {pinnedCurrentDocument ? (
                <Alert severity="info" sx={{ alignItems: "flex-start" }}>
                  <Typography variant="body2">
                    現在表示中の Document は一覧ウィンドウ外にあるため、先頭に固定表示している。
                  </Typography>
                </Alert>
              ) : null}
              {visibleDocuments.map((document) => (
                <Tooltip
                  key={document.id}
                  placement="right-start"
                  arrow
                  title={
                    <Box sx={{ maxWidth: 360, p: 0.5 }}>
                      <Typography variant="subtitle2">{document.document_name}</Typography>
                      <Typography variant="caption" sx={{ display: "block", color: "rgba(255,255,255,0.72)", mb: 1 }}>
                        Hover preview
                      </Typography>
                      <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                        {getDocumentHoverPreview(document, searchQuery)}
                      </Typography>
                    </Box>
                  }
                >
                  <ListItemButton
                    selected={document.id === currentDocument?.id}
                    onClick={() => requestAction({ type: "doc", docId: document.id })}
                    sx={{ alignItems: "flex-start", borderRadius: 3, border: "1px solid", borderColor: document.id === currentDocument?.id ? "primary.main" : "#dbe3ee" }}
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                          <Typography variant="subtitle2" noWrap>
                            {document.document_name}
                          </Typography>
                          <Chip size="small" label={getDocumentStatus(document)} color={getDocumentStatus(document) === "verified" ? "success" : "warning"} />
                        </Stack>
                      }
                      secondary={
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                          {getDocumentSnippetParts(document, searchQuery).map((part, index) =>
                            part.highlighted ? (
                              <Box
                                key={`${document.id}-snippet-${index}`}
                                component="mark"
                                sx={{
                                  px: 0.15,
                                  py: 0.02,
                                  borderRadius: 0.5,
                                  bgcolor: alpha("#fbbc04", 0.34),
                                  color: "inherit",
                                }}
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
                      }
                    />
                  </ListItemButton>
                </Tooltip>
              ))}
              {documentsLoadingMore ? (
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", py: 0.75 }}>
                  さらに読み込み中
                </Typography>
              ) : null}
              {!documentsLoadingMore && documentNextOffset >= documentTotal && visibleDocuments.length > 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", py: 0.75 }}>
                  以上で全て
                </Typography>
              ) : null}
            </Box>
          </Paper>
        ) : null}

        {view === "workspace" ? (
          <>
            <Box sx={{ display: "grid", gap: 2, height: "100%", minHeight: 0, gridTemplateRows: "auto minmax(0,1fr) auto" }}>
              <Paper sx={{ px: 1.5, py: 1.25, display: "flex", gap: 1, overflowX: "auto", minHeight: 58, alignItems: "center" }}>
                {bundle.labels.map((label) => {
                  const active = label.id === focusedLabel?.id;
                  return (
                    <Chip
                      key={label.id}
                      label={label.name}
                      onClick={(event) => {
                        setFocusedLabelId(label.id);
                        setSelectedAnnotationId(null);
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
                  onFocusLabel={setFocusedLabelId}
                  onSelectAnnotation={(annotationId) => {
                    setSelectionPreview(null);
                    setSelectedAnnotationId(annotationId);
                  }}
                  onCreateAnnotation={handleCreateAnnotation}
                  onClearSelection={() => {
                    setSelectionPreview(null);
                    setSelectedAnnotationId(null);
                  }}
                  onSelectionDraftChange={(selection) => {
                    setSelectionPreview(selection);
                    if (selection) {
                      setSelectedAnnotationId(null);
                      setRightTab("examples");
                    }
                  }}
                />
              ) : (
                <Paper sx={{ p: 4 }}>
                  <Typography variant="h6">Document がない</Typography>
                </Paper>
              )}

              <Stack
                direction="row"
                spacing={1}
                sx={{
                  ml: "auto",
                  alignItems: "center",
                  pb: 1,
                }}
              >
                <Button
                  variant="outlined"
                  startIcon={<SaveRoundedIcon />}
                  onClick={() => void handleSave()}
                  disabled={!dirty || saving}
                  sx={{ minWidth: 108, minHeight: 40, px: 2.25, borderRadius: 1.5 }}
                >
                  Save
                </Button>
                <Button
                  variant="contained"
                  endIcon={<TaskAltRoundedIcon />}
                  onClick={() => void handleSubmit()}
                  disabled={!currentDocument || saving}
                  sx={{ minWidth: 126, minHeight: 40, px: 2.5, borderRadius: 1.5 }}
                >
                  Submit
                </Button>
              </Stack>
            </Box>

            <Paper sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
              <Tabs value={rightTab} onChange={(_event, value) => setRightTab(value)} variant="fullWidth">
                <Tab value="examples" label="関連例" />
                <Tab value="annotations" label="注釈一覧" />
              </Tabs>
              <Divider />
              <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, overflow: "hidden" }}>
                {rightTab === "examples" ? (
                  <>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2">{focusedLabel?.name ?? "Label"} アノテーション基準</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2, whiteSpace: "pre-wrap" }}>
                        {focusedLabel?.description || "アノテーション基準未設定"}
                      </Typography>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
                      <Typography variant="subtitle2">同一ラベルの他アノテーション</Typography>
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
                            void loadSameLabelExamples(false);
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
                              slotProps={{
                                tooltip: {
                                  sx: {
                                    bgcolor: "#646872",
                                    color: "#fff",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    boxShadow: "0 14px 30px rgba(15, 23, 42, 0.18)",
                                  },
                                },
                                arrow: {
                                  sx: {
                                    color: "#646872",
                                  },
                                },
                              }}
                              onOpen={() =>
                                void ensureSameLabelDetails(item.surface_text, item.surface_text, item.duplicate_count)
                              }
                              title={
                                <Box sx={{ maxWidth: 460, p: 0.75 }}>
                                  <Typography variant="subtitle2">
                                    {item.surface_text} / {item.duplicate_count}件の事例
                                  </Typography>
                                  <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                                    {!detailItems ? (
                                      <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                        取得中
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
                              <Paper
                                variant="outlined"
                                sx={{ p: 1.5 }}
                              >
                                <Stack direction="row" justifyContent="space-between" spacing={1}>
                                  <Typography variant="caption" color="text.secondary">
                                    {representative.document_name}
                                  </Typography>
                                  <Chip
                                    size="small"
                                    label={representative.status}
                                    color={representative.status === "verified" ? "success" : "warning"}
                                  />
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                  {item.surface_text} / {item.duplicate_count}件の事例
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
                            さらに読み込み中
                          </Typography>
                        ) : sameLabelExamples.length > 0 &&
                          sameLabelExamplesOffset >= sameLabelExamplesTotal ? (
                          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", py: 0.5 }}>
                            以上で全て
                          </Typography>
                        ) : null}
                        {sameLabelExamples.length === 0 ? <Typography color="text.secondary">該当なし</Typography> : null}
                      </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
                      <Typography variant="subtitle2">同一表層の他アノテーション</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75 }}>
                        {selectionPreview?.text
                          ? `選択中: ${selectionPreview.text}`
                          : selectedAnnotation
                            ? `対象: ${selectedAnnotation.span_text}`
                            : "範囲選択または Annotation 選択で表示される"}
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
                            void loadSameSurfaceExamples(false);
                          }
                        }}
                        sx={{ mt: 1.5, overflow: "auto", minHeight: 0, pr: 0.5 }}
                      >
                        {sameSurfaceExamples.map((item) => {
                          const labelColor = item.label_color ?? "#1a73e8";
                          const highlightDifferentLabel =
                            Boolean(sameSurfaceTarget?.labelId) && item.label_id !== sameSurfaceTarget?.labelId;
                          return (
                            <Tooltip
                              key={item.annotation_id}
                              placement="left-start"
                              arrow
                              slotProps={{
                                tooltip: {
                                  sx: {
                                    bgcolor: "#646872",
                                    color: "#fff",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    boxShadow: "0 14px 30px rgba(15, 23, 42, 0.18)",
                                  },
                                },
                                arrow: {
                                  sx: {
                                    color: "#646872",
                                  },
                                },
                              }}
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
                                      boxShadow: highlightDifferentLabel
                                        ? `0 0 0 2px ${alpha(labelColor, 0.08)}`
                                        : "none",
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
                            さらに読み込み中
                          </Typography>
                        ) : sameSurfaceExamples.length > 0 &&
                          sameSurfaceExamplesOffset >= sameSurfaceExamplesTotal ? (
                          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", py: 0.5 }}>
                            以上で全て
                          </Typography>
                        ) : null}
                        {!selectionPreview && !selectedAnnotation ? (
                          <Typography color="text.secondary">範囲選択または Annotation を選択すると同一表層の事例が出る。</Typography>
                        ) : null}
                        {(selectionPreview || selectedAnnotation) && sameSurfaceExamples.length === 0 ? (
                          <Typography color="text.secondary">この表層に一致する他アノテーションはまだない。</Typography>
                        ) : null}
                      </Stack>
                    </Paper>
                  </>
                ) : (
                  <>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        id="annotation-edit-toggle"
                        sx={{ cursor: "pointer", width: "fit-content" }}
                        onClick={() => setAnnotationEditCollapsed((current) => !current)}
                      >
                        <Box sx={{ width: 18, display: "grid", placeItems: "center" }}>
                          <Typography variant="caption">{annotationEditCollapsed ? "▶" : "▼"}</Typography>
                        </Box>
                        <Typography variant="subtitle2">選択中 Annotation</Typography>
                      </Stack>
                      {selectedAnnotation && !annotationEditCollapsed ? (
                        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                          <Autocomplete
                            options={["pending", "verified"]}
                            value={selectedAnnotation.status}
                            renderInput={(params) => <TextField {...params} label="Status" size="small" />}
                            onChange={(_event, value) => {
                              if (!value || !currentDocument) {
                                return;
                              }
                              mutateCurrentDocument((draft) => {
                                const annotation = draft.annotations.find((item) => item.id === selectedAnnotation.id);
                                if (annotation) {
                                  annotation.status = value as StatusValue;
                                }
                              });
                            }}
                          />
                          <TextField
                            label="Comment"
                            multiline
                            minRows={3}
                            value={selectedAnnotation.comment}
                            onChange={(event) => {
                              if (!currentDocument) {
                                return;
                              }
                              const value = event.target.value;
                              mutateCurrentDocument((draft) => {
                                const annotation = draft.annotations.find((item) => item.id === selectedAnnotation.id);
                                if (annotation) {
                                  annotation.comment = value;
                                }
                              });
                            }}
                          />
                          <TextField
                            label="Meta (JSON)"
                            multiline
                            minRows={3}
                            value={JSON.stringify(selectedAnnotation.meta ?? {}, null, 2)}
                            onChange={(event) => {
                              if (!currentDocument) {
                                return;
                              }
                              try {
                                const parsed = JSON.parse(event.target.value) as JsonObject;
                                mutateCurrentDocument((draft) => {
                                  const annotation = draft.annotations.find((item) => item.id === selectedAnnotation.id);
                                  if (annotation) {
                                    annotation.meta = parsed;
                                  }
                                });
                              } catch {
                                // 編集途中の不正JSONは保持せず無視する
                              }
                            }}
                          />
                          <Button
                            color="error"
                            variant="outlined"
                            startIcon={<DeleteOutlineRoundedIcon />}
                            onClick={() => deleteSelectedAnnotation()}
                          >
                            Delete annotation
                          </Button>
                        </Stack>
                      ) : selectedAnnotation ? (
                        <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                          折りたたみ中である。展開すると status / comment / meta を編集できる。
                        </Typography>
                      ) : (
                        <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                          Annotation を選択すると comment / status / meta を編集できる。
                        </Typography>
                      )}
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
                      <Typography variant="subtitle2">Doc アノテーション一覧</Typography>
                      <Stack spacing={1.5} sx={{ mt: 1.5, overflow: "auto", minHeight: 0, pr: 0.5 }}>
                        {groupedAnnotations.map(({ label, annotations }) => (
                          <Paper key={label.id} variant="outlined" sx={{ p: 1.5 }}>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              sx={{ cursor: "pointer", width: "fit-content" }}
                              onClick={() =>
                                setAccordionOpen((current) => ({
                                  ...current,
                                  [label.id]: !(current[label.id] ?? true),
                                }))
                              }
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
                                    variant="outlined"
                                    sx={{
                                      p: 1.25,
                                      cursor: "pointer",
                                      borderColor: annotation.id === selectedAnnotationId ? "primary.main" : undefined,
                                    }}
                                    onClick={() => {
                                      setFocusedLabelId(annotation.label_id);
                                      setSelectedAnnotationId(annotation.id);
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
                              {annotations.length === 0 ? <Typography color="text.secondary">Annotation なし</Typography> : null}
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
        ) : (
          <Paper sx={{ height: "100%", minHeight: 0, p: 3, display: "grid", gap: 3, alignContent: "start", overflow: "auto" }}>
            <Box>
              <Typography variant="h5">Project Settings</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Label 定義、ガイドライン、Import / Export をここで管理する。
              </Typography>
            </Box>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="subtitle1">Project</Typography>
              <Stack spacing={2} sx={{ mt: 2 }}>
                <TextField
                  label="Project name"
                  value={bundle.project.name}
                  onChange={(event) =>
                    mutateSettingsBundle((draft) => {
                      draft.project.name = event.target.value;
                    })
                  }
                />
                <TextField
                  label="Description"
                  multiline
                  minRows={2}
                  value={bundle.project.description ?? ""}
                  onChange={(event) =>
                    mutateSettingsBundle((draft) => {
                      draft.project.description = event.target.value;
                    })
                  }
                />
                <TextField
                  label="Guideline"
                  multiline
                  minRows={4}
                  value={getProjectGuideline(bundle.project)}
                  onChange={(event) =>
                    mutateSettingsBundle((draft) => {
                      setProjectGuideline(draft.project, event.target.value);
                    })
                  }
                />
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="subtitle1">Labels</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2, alignItems: "flex-start" }}>
                <Stack spacing={1.5} sx={{ minWidth: 320, flex: 1 }}>
                  <TextField label="Name" value={labelDraft.name} onChange={(event) => setLabelDraft((current) => ({ ...current, name: event.target.value }))} />
                  <TextField label="Color" value={labelDraft.color} onChange={(event) => setLabelDraft((current) => ({ ...current, color: event.target.value }))} />
                  <TextField label="Description" multiline minRows={3} value={labelDraft.description} onChange={(event) => setLabelDraft((current) => ({ ...current, description: event.target.value }))} />
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      startIcon={<AddRoundedIcon />}
                      onClick={() => {
                        if (!labelDraft.name.trim() || !bundle) {
                          return;
                        }
                        const existing = bundle.labels.find((label) => label.name === labelDraft.name.trim());
                        const editingLabel = bundle.labels.find((label) => label.id === labelDraft.id);
                        if (existing && !labelDraft.id) {
                          showToast("同名 label は追加できない", "warning");
                          return;
                        }
                        mutateSettingsBundle((draft) => {
                          const nextLabel: LabelRecord = {
                            id: labelDraft.id || makeLocalId("label"),
                            project_id: draft.project.id,
                            project_name: draft.project.name,
                            name: labelDraft.name.trim(),
                            color: labelDraft.color,
                            description: labelDraft.description,
                            shortcut: editingLabel?.shortcut ?? null,
                            meta: {},
                          };
                          const index = draft.labels.findIndex((label) => label.id === nextLabel.id);
                          if (index >= 0) {
                            draft.labels[index] = nextLabel;
                          } else {
                            draft.labels.push(nextLabel);
                          }
                        });
                        setLabelDraft({ id: "", name: "", color: "#1a73e8", description: "" });
                      }}
                    >
                      {labelDraft.id ? "Update label" : "Add label"}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => setLabelDraft({ id: "", name: "", color: "#1a73e8", description: "" })}
                    >
                      Clear
                    </Button>
                  </Stack>
                </Stack>
                <List sx={{ flex: 1, width: "100%", border: "1px solid #d7e2f0", borderRadius: 3, bgcolor: "#fff" }}>
                  {bundle.labels.map((label) => (
                    <ListItemButton
                      key={label.id}
                      onClick={() =>
                        setLabelDraft({
                          id: label.id,
                          name: label.name,
                          color: label.color,
                          description: label.description,
                        })
                      }
                    >
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: label.color }} />
                            <Typography variant="subtitle2">{label.name}</Typography>
                          </Stack>
                        }
                        secondary={label.description}
                      />
                      <IconButton
                        edge="end"
                        color="error"
                        onClick={(event) => {
                          event.stopPropagation();
                          mutateSettingsBundle((draft) => {
                            draft.labels = draft.labels.filter((item) => item.id !== label.id);
                          });
                          if (focusedLabelId === label.id) {
                            setFocusedLabelId(bundle.labels.find((item) => item.id !== label.id)?.id ?? null);
                          }
                        }}
                      >
                        <DeleteOutlineRoundedIcon />
                      </IconButton>
                    </ListItemButton>
                  ))}
                </List>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="subtitle1">Import / Export</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2 }}>
                <Stack spacing={1.5} sx={{ flex: 1 }}>
                  <Typography variant="subtitle2">現在 project への追記 import</Typography>
                  <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />}>
                    {settingsImportFile?.name ?? "Select JSON"}
                    <input hidden type="file" accept=".json,application/json" onChange={(event) => setSettingsImportFile(event.target.files?.[0] ?? null)} />
                  </Button>
                  <Button variant="contained" onClick={() => void handleSettingsImport()} disabled={!settingsImportFile}>
                    Import
                  </Button>
                </Stack>
                <Stack spacing={1.5} sx={{ flex: 1 }}>
                  <Typography variant="subtitle2">Export</Typography>
                  <FormControlLabel control={<Switch checked={exportPending} onChange={(event) => setExportPending(event.target.checked)} />} label="Include pending" />
                  <FormControlLabel control={<Switch checked={exportVerified} onChange={(event) => setExportVerified(event.target.checked)} />} label="Include verified" />
                  <Button variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={() => void handleExport()}>
                    Export JSON
                  </Button>
                </Stack>
              </Stack>
            </Paper>

            <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
              <Button variant="outlined" startIcon={<SaveRoundedIcon />} onClick={() => void handleSave()} disabled={!dirty || saving}>
                Save changes
              </Button>
            </Stack>
          </Paper>
        )}
      </Box>

      <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)}>
        <DialogTitle>未保存の変更がある</DialogTitle>
        <DialogContent>
          <Typography>保存して移動するか、変更を破棄して移動するかを選ぶ。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingAction(null)}>キャンセル</Button>
          <Button onClick={() => void resolvePendingAction("discard")}>破棄して移動</Button>
          <Button
            ref={pendingActionConfirmButtonRef}
            variant="outlined"
            onClick={() => void resolvePendingAction("save")}
          >
            保存して移動 ↵
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createDocOpen} onClose={() => setCreateDocOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create Document</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField label="Document name" value={newDocName} onChange={(event) => setNewDocName(event.target.value)} />
          <TextField label="Text" multiline minRows={8} value={newDocText} onChange={(event) => setNewDocText(event.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDocOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void (async () => {
              if (!bundle) {
                return;
              }
              if (!newDocName.trim() || !newDocText.trim()) {
                return;
              }
              setSaving(true);
              try {
                const created = await api.createDocument(token, bundle.project.id, {
                  id: "",
                  project_id: bundle.project.id,
                  project_name: bundle.project.name,
                  document_name: newDocName.trim(),
                  text: newDocText,
                  annotations: [],
                  meta: {},
                });
                const createdDocument = await api.getDocument(token, bundle.project.id, created.id);
                setBundle((current) =>
                  current
                    ? {
                        ...current,
                        documents: [...current.documents.filter((document) => document.id !== createdDocument.id), createdDocument],
                      }
                    : current,
                );
                setDocumentSnapshotsById((current) => ({
                  ...current,
                  [createdDocument.id]: deepClone(createdDocument),
                }));
                setDocumentList((current) =>
                  trimDocumentWindow(
                    [toDocumentListItem(createdDocument), ...current.filter((document) => document.id !== createdDocument.id)],
                    createdDocument.id,
                  ),
                );
                setDocumentTotal((current) => current + 1);
                setPendingDocumentTotal((current) => current + 1);
                setAnnotationEditCollapsed(true);
                setCreateDocOpen(false);
                setNewDocName("");
                setNewDocText("");
                requestAction({ type: "doc", docId: createdDocument.id });
              } catch (error) {
                showToast(error instanceof Error ? error.message : "Document の作成に失敗した", "error");
              } finally {
                setSaving(false);
              }
            })()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Popper
        open={shortcutOpen}
        anchorEl={shortcutButtonRef.current}
        placement="bottom-end"
        transition
        sx={{ zIndex: (theme) => theme.zIndex.appBar + 2 }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={120}>
            <Box
              sx={{
                pt: 1.25,
                transform: `translate(${shortcutPanelOffset.x}px, ${shortcutPanelOffset.y}px)`,
              }}
            >
              <ClickAwayListener onClickAway={() => (!shortcutDragging ? setShortcutOpen(false) : undefined)}>
                <Paper
                  elevation={8}
                  sx={{
                    width: 380,
                    maxWidth: "calc(100vw - 32px)",
                    maxHeight: "min(72vh, 640px)",
                    overflow: "auto",
                    borderRadius: 3,
                    border: "1px solid #d7e2f0",
                    p: 2.25,
                    display: "grid",
                    gap: 2,
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                    <Box
                      onPointerDown={handleShortcutDragStart}
                      onPointerMove={handleShortcutDragMove}
                      onPointerUp={handleShortcutDragEnd}
                      onPointerCancel={handleShortcutDragEnd}
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        cursor: shortcutDragging ? "grabbing" : "grab",
                        userSelect: "none",
                      }}
                    >
                      <Typography variant="subtitle1">Keyboard Shortcuts</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
                        この画面を開いたまま操作可能。ドラッグで移動可能。
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      aria-label="ショートカット一覧を閉じる"
                      onClick={() => setShortcutOpen(false)}
                      sx={{ mt: -0.5, mr: -0.5 }}
                    >
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  {[
                    {
                      title: "保存と補助",
                      items: [
                        ["Cmd+S", "Save"],
                        ["Cmd+Enter", "Submit"],
                        ["Cmd+Z", "Undo"],
                        ["Cmd+Y / Cmd+Shift+Z", "Redo"],
                        ["?", "Shortcut確認のトグル"],
                      ],
                    },
                    {
                      title: "移動",
                      items: [
                        ["J / K", "Doc 移動"],
                        ["Shift+J / Shift+K", "pending Doc 移動"],
                        ["H / L / ← / →", "Label 移動"],
                        ["N / P", "現在 Label 内で Annotation 移動"],
                        ["↑ / ↓", "一覧順で Annotation 移動"],
                        ["[ / ]", "右ペインタブ切り替え"],
                      ],
                    },
                    {
                      title: "選択と編集",
                      items: [
                        ["Enter", "範囲選択中なら annotation 追加"],
                        ["Esc", "選択中 annotation を解除"],
                        ["Delete / Backspace", "選択中 annotation を削除"],
                      ],
                    },
                  ].map((section) => (
                    <Box key={section.title}>
                      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: 0.4 }}>
                        {section.title}
                      </Typography>
                      <Stack spacing={1} sx={{ mt: 1 }}>
                        {section.items.map(([key, description]) => (
                          <Stack key={key} direction="row" spacing={1.25} alignItems="center">
                            <Box
                              component="span"
                              sx={{
                                minWidth: 132,
                                px: 1,
                                py: 0.5,
                                borderRadius: 1.25,
                                border: "1px solid #d7e2f0",
                                bgcolor: "#f8fbff",
                                fontSize: 12,
                                fontWeight: 700,
                                lineHeight: 1.4,
                                color: "text.primary",
                                textAlign: "center",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {key}
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {description}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Paper>
              </ClickAwayListener>
            </Box>
          </Fade>
        )}
      </Popper>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={closeToast}>
        <Alert onClose={closeToast} severity={toast.severity} variant="filled">
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void api
      .getMe(token)
      .then((response) => {
        if (!active) {
          return;
        }
        setUser(response);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        if (!active) {
          return;
        }
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function handleLogin(username: string, password: string) {
    setError("");
    setLoading(true);
    try {
      const response = await api.login(username, password);
      localStorage.setItem(TOKEN_KEY, response.access_token);
      setToken(response.access_token);
      const me = await api.getMe(response.access_token);
      setUser(me);
      navigate("/projects");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "ログインに失敗した");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    if (location.pathname !== "/login") {
      navigate("/login");
    }
  }

  if (loading && token && !user) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Routes>
      {!token || !user ? (
        <>
          <Route path="/login" element={<LoginPage loading={loading} error={error} onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : (
        <>
          <Route path="/login" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage token={token} user={user} onLogout={handleLogout} />} />
          <Route path="/projects/:projectId" element={<ProjectShell token={token} user={user} onLogout={handleLogout} />} />
          <Route path="/projects/:projectId/settings" element={<ProjectShell token={token} user={user} onLogout={handleLogout} />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </>
      )}
    </Routes>
  );
}
