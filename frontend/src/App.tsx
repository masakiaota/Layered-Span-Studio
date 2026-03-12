import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Snackbar,
} from "@mui/material";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import { CreateDocumentDialog } from "./features/project-shell/CreateDocumentDialog";
import { PendingChangesDialog } from "./features/project-shell/PendingChangesDialog";
import { ProjectShellHeader } from "./features/project-shell/ProjectShellHeader";
import { SettingsView } from "./features/project-shell/SettingsView";
import {
  DEFAULT_LABEL_COLOR,
  DOCUMENT_PAGE_SIZE,
} from "./features/project-shell/projectShellConstants";
import type { LabelDraft, PendingAction, RightTab, SelectionPreview } from "./features/project-shell/projectShellTypes";
import {
  collectDocumentNames,
  createEmptyLabelDraft,
  findConflictingLabelName,
  isHexColor,
  mergeDocumentWindow,
  normalizeHexColor,
  toLabelDraft,
  toDocumentListItem,
  trimDocumentWindow,
} from "./features/project-shell/projectShellUtils";
import { ShortcutPopover } from "./features/project-shell/ShortcutPopover";
import { useBodyScrollLock } from "./features/project-shell/useBodyScrollLock";
import { useProjectExamples } from "./features/project-shell/useProjectExamples";
import { useProjectShortcuts } from "./features/project-shell/useProjectShortcuts";
import { sortAnnotationsInPanelOrder } from "./features/workspace/workspaceUtils";
import { WorkspaceView } from "./features/project-shell/WorkspaceView";
import { useAuthSession } from "./hooks/useAuthSession";
import { useToast } from "./hooks/useToast";
import {
  buildImportValidationMessage,
  describeImportSummary,
  validateImportPayload,
} from "./importValidation";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import type {
  AnnotationRecord,
  DocumentRecord,
  DocumentListItem,
  ProjectBundle,
  UserRecord,
} from "./types";
import {
  buildExportFilename,
  deepClone,
  documentMatchesSearch,
  downloadJson,
  formatAnnotationMetaDraft,
  getDocumentStatus,
  isLocalId,
  makeLocalId,
  parseAnnotationMetaDraft,
  readJsonFile,
  setProjectGuideline,
} from "./utils";

export function ProjectShell({
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
  const [selectedSettingsLabelId, setSelectedSettingsLabelId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedAnnotationMetaDraft, setSelectedAnnotationMetaDraft] = useState("");
  const [selectedAnnotationMetaError, setSelectedAnnotationMetaError] = useState<string | null>(null);
  const [selectionPreview, setSelectionPreview] = useState<SelectionPreview | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("examples");
  const [annotationEditCollapsed, setAnnotationEditCollapsed] = useState(true);
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("created");
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [createDocOpen, setCreateDocOpen] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocText, setNewDocText] = useState("");
  const [labelDraft, setLabelDraft] = useState<LabelDraft>(createEmptyLabelDraft);
  const [settingsImportFile, setSettingsImportFile] = useState<File | null>(null);
  const [settingsImportFeedback, setSettingsImportFeedback] = useState<{
    severity: "success" | "info" | "warning" | "error";
    message: string;
  } | null>(null);
  const [settingsImporting, setSettingsImporting] = useState(false);
  const [exportPending, setExportPending] = useState(true);
  const [exportVerified, setExportVerified] = useState(true);
  const [documentList, setDocumentList] = useState<DocumentListItem[]>([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [pendingDocumentTotal, setPendingDocumentTotal] = useState(0);
  const [documentNextOffset, setDocumentNextOffset] = useState(0);
  const [documentsLoadingMore, setDocumentsLoadingMore] = useState(false);
  const shortcutButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingActionConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const documentListScrollRef = useRef<HTMLDivElement | null>(null);
  const sameLabelExamplesScrollRef = useRef<HTMLDivElement | null>(null);
  const sameSurfaceExamplesScrollRef = useRef<HTMLDivElement | null>(null);
  const shortcutDragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const labelColorInputRef = useRef<HTMLInputElement | null>(null);
  const documentListRequestIdRef = useRef(0);
  const [shortcutPanelOffset, setShortcutPanelOffset] = useState({ x: 0, y: 0 });
  const [shortcutDragging, setShortcutDragging] = useState(false);
  const initialDocumentListLoadedRef = useRef(false);
  const normalizedLabelColor = normalizeHexColor(labelDraft.color);
  const labelColorValid = isHexColor(labelDraft.color);
  const labelColorPreview = labelColorValid ? normalizedLabelColor : DEFAULT_LABEL_COLOR;

  useBodyScrollLock();

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
      activateDocument(firstDocId);
      setFocusedLabelId(nextBundle.labels[0]?.id ?? null);
      setSelectedSettingsLabelId(null);
      setLabelDraft(createEmptyLabelDraft());
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
  useEffect(() => {
    if (!selectedAnnotation) {
      setSelectedAnnotationMetaDraft("");
      setSelectedAnnotationMetaError(null);
      return;
    }
    setSelectedAnnotationMetaDraft(formatAnnotationMetaDraft(selectedAnnotation.meta));
    setSelectedAnnotationMetaError(null);
  }, [currentDocument?.id, selectedAnnotation?.id]);
  const {
    sameLabelExamples,
    sameLabelExamplesTotal,
    sameLabelExamplesOffset,
    sameLabelExamplesLoadingMore,
    sameLabelExampleDetails,
    sameSurfaceExamples,
    sameSurfaceExamplesTotal,
    sameSurfaceExamplesOffset,
    sameSurfaceExamplesLoadingMore,
    sameSurfaceTargetLabelId,
    loadSameLabelExamples,
    loadSameSurfaceExamples,
    ensureSameLabelDetails,
  } = useProjectExamples({
    token,
    projectId: bundle?.project.id ?? null,
    focusedLabel,
    selectedAnnotation,
    selectionPreview,
    showToast,
  });
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

  function clearWorkspaceSelection() {
    setSelectedAnnotationId(null);
    setSelectionPreview(null);
  }

  function resetWorkspacePanels() {
    setRightTab("examples");
    setAnnotationEditCollapsed(true);
  }

  function activateDocument(documentId: string | null) {
    setSelectedDocId(documentId);
    clearWorkspaceSelection();
    resetWorkspacePanels();
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

  useProjectShortcuts({
    enabled: Boolean(bundle && currentDocument),
    selectedAnnotationId,
    onToggleShortcutPanel: handleShortcutPanelToggle,
    onSave: () => void handleSave(),
    onSubmit: () => void handleSubmit(),
    onUndo: undoBundle,
    onRedo: redoBundle,
    onMoveDocument: moveDocumentByDirection,
    onMoveLabel: moveLabelByDirection,
    onMoveRightTab: moveRightPanelTabByDirection,
    onMoveAnnotation: moveAnnotationByDirection,
    onClearSelectedAnnotation: () => setSelectedAnnotationId(null),
    onDeleteSelectedAnnotation: deleteSelectedAnnotation,
  });

  useEffect(() => {
    if (!pendingAction) {
      return;
    }
    const focusTimer = requestAnimationFrame(() => {
      pendingActionConfirmButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(focusTimer);
  }, [pendingAction]);

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
      const savedDocument = await api.saveDocumentBundle(token, bundle.project.id, currentDocument.id, payload);
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
      clearWorkspaceSelection();
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
      const projectDirty = JSON.stringify(bundle.project) !== JSON.stringify(settingsSnapshot.project);
      const labelsDirty = JSON.stringify(bundle.labels) !== JSON.stringify(settingsSnapshot.labels);
      const selectedSettingsLabel =
        selectedSettingsLabelId ? bundle.labels.find((label) => label.id === selectedSettingsLabelId) ?? null : null;
      let savedProject = bundle.project;
      let savedLabels = bundle.labels;

      if (projectDirty) {
        savedProject = await api.saveProjectSettings(token, bundle.project);
        setBundle((current) =>
          current
            ? {
                ...current,
                project: savedProject,
              }
            : current,
        );
        setSettingsSnapshot((current) =>
          current
              ? {
                  ...current,
                  project: deepClone(savedProject),
                }
              : current,
        );
      }

      if (labelsDirty) {
        try {
          const labelsResponse = await api.saveProjectLabels(
            token,
            bundle.project.id,
            bundle.labels.map((label) => ({
              id: isLocalId(label.id) ? null : label.id,
              name: label.name,
              color: label.color,
              description: label.description,
              shortcut: label.shortcut ?? null,
              meta: label.meta ?? {},
            })),
          );
          savedLabels = labelsResponse.labels;
          const refreshedCurrentDocument = selectedDocId
            ? await api.getDocument(token, bundle.project.id, selectedDocId).catch(() => null)
            : null;
          setBundle((current) =>
            current
              ? {
                  ...current,
                  project: savedProject,
                  labels: savedLabels,
                  documents: refreshedCurrentDocument ? [refreshedCurrentDocument] : [],
                }
              : current,
          );
          setSettingsSnapshot((current) =>
            current
              ? {
                  ...current,
                  labels: deepClone(savedLabels),
                }
              : current,
          );
          setDocumentSnapshotsById(
            refreshedCurrentDocument
              ? {
                  [refreshedCurrentDocument.id]: deepClone(refreshedCurrentDocument),
                }
              : {},
          );
          setHistoryState(
            refreshedCurrentDocument
              ? {
                  documentId: refreshedCurrentDocument.id,
                  entries: [deepClone(refreshedCurrentDocument)],
                  index: 0,
                }
              : {
                  documentId: null,
                  entries: [],
                  index: -1,
                },
          );
          if (selectedSettingsLabel) {
            const persistedSelectedLabel = savedLabels.find((label) => label.name === selectedSettingsLabel.name) ?? null;
            setSelectedSettingsLabelId(persistedSelectedLabel?.id ?? null);
            setLabelDraft(persistedSelectedLabel ? toLabelDraft(persistedSelectedLabel) : createEmptyLabelDraft());
          }
        } catch (error) {
          showToast(
            projectDirty
              ? "Project は保存したが Labels の保存に失敗した"
              : error instanceof Error
                ? error.message
                : "Labels の保存に失敗した",
            projectDirty ? "warning" : "error",
          );
          return null;
        }
      }

      if (successMessage && (projectDirty || labelsDirty)) {
        showToast(successMessage, "success");
      }
      return {
        project: savedProject,
        labels: savedLabels,
      };
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
    clearWorkspaceSelection();
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
    clearWorkspaceSelection();
    setSelectedAnnotationId(next.id);
    setFocusedLabelId(next.label_id);
  }

  function deleteSelectedAnnotation() {
    if (!currentDocument || !selectedAnnotationId) {
      return;
    }
    mutateCurrentDocument((draft) => {
      draft.annotations = draft.annotations.filter((annotation) => annotation.id !== selectedAnnotationId);
    });
    clearWorkspaceSelection();
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
      activateDocument(nextId);
    }
    showToast("Document を submit した", "success");
  }

  function executePendingAction(action: PendingAction) {
    if (action.type === "doc") {
      activateDocument(action.docId);
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
      clearWorkspaceSelection();
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

  async function handleCreateDocument() {
    if (!bundle) {
      return;
    }
    if (!newDocName.trim() || !newDocText.trim()) {
      return;
    }
    setSaving(true);
    try {
      const created = await api.createDocument(token, bundle.project.id, {
        document_name: newDocName.trim(),
        text: newDocText,
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
      setCreateDocOpen(false);
      setNewDocName("");
      setNewDocText("");
      requestAction({ type: "doc", docId: createdDocument.id });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Document の作成に失敗した", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSettingsImport() {
    if (!settingsImportFile || !bundle || settingsImporting) {
      return;
    }
    setSettingsImporting(true);
    try {
      const payload = await readJsonFile(settingsImportFile);
      const basicValidation = validateImportPayload(payload);
      if (basicValidation.issues.length > 0) {
        const message = buildImportValidationMessage(basicValidation.issues);
        setSettingsImportFeedback({ severity: "error", message });
        showToast("Import 前チェックで問題を検出した", "error");
        return;
      }

      const unfilteredTotalResponse = await api.listDocuments(token, bundle.project.id, {
        offset: 0,
        limit: 1,
        sort: "created",
        search: "",
      });
      const existingDocumentNames = await collectDocumentNames(
        unfilteredTotalResponse.total,
        DOCUMENT_PAGE_SIZE,
        (offset, limit) =>
          api.listDocuments(token, bundle.project.id, {
            offset,
            limit,
            sort: "created",
            search: "",
          }),
      );
      const validation = validateImportPayload(payload, {
        existingLabelNames: bundle.labels.map((label) => label.name),
        existingDocumentNames,
      });
      if (validation.issues.length > 0) {
        const message = buildImportValidationMessage(validation.issues);
        setSettingsImportFeedback({ severity: "error", message });
        showToast("Import 前チェックで問題を検出した", "error");
        return;
      }
      await api.importProject(token, bundle.project.id, payload);
      setSettingsImportFeedback({
        severity: "success",
        message: `Import 完了: ${describeImportSummary(
          validation.summary ?? { labelCount: 0, documentCount: 0, annotationCount: 0 },
        )}`,
      });
      showToast("現在の project に import した", "success");
      setSettingsImportFile(null);
      await loadBundle();
    } catch (error) {
      setSettingsImportFeedback({
        severity: "error",
        message: error instanceof Error ? error.message : "Import に失敗した",
      });
      showToast(error instanceof Error ? error.message : "Import に失敗した", "error");
    } finally {
      setSettingsImporting(false);
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

  function handleSelectedAnnotationStatusChange(status: "pending" | "verified") {
    if (!selectedAnnotation) {
      return;
    }
    mutateCurrentDocument((draft) => {
      const annotation = draft.annotations.find((item) => item.id === selectedAnnotation.id);
      if (annotation) {
        annotation.status = status;
      }
    });
  }

  function handleSelectedAnnotationCommentChange(comment: string) {
    if (!selectedAnnotation) {
      return;
    }
    mutateCurrentDocument((draft) => {
      const annotation = draft.annotations.find((item) => item.id === selectedAnnotation.id);
      if (annotation) {
        annotation.comment = comment;
      }
    });
  }

  function handleSelectedAnnotationMetaChange(value: string) {
    if (!selectedAnnotation) {
      return;
    }
    setSelectedAnnotationMetaDraft(value);
    const parsed = parseAnnotationMetaDraft(value);
    if (!parsed.valid) {
      setSelectedAnnotationMetaError(parsed.error);
      return;
    }
    setSelectedAnnotationMetaError(null);
    mutateCurrentDocument((draft) => {
      const annotation = draft.annotations.find((item) => item.id === selectedAnnotation.id);
      if (annotation) {
        annotation.meta = parsed.value;
      }
    });
  }

  function handleToggleAnnotationGroup(labelId: string) {
    setAccordionOpen((current) => ({
      ...current,
      [labelId]: !(current[labelId] ?? true),
    }));
  }

  function handleLabelDraftSubmit() {
    if (!labelDraft.name.trim() || !bundle) {
      return;
    }
    if (!labelColorValid) {
      showToast("Color は #RRGGBB 形式で入力する", "warning");
      return;
    }
    const existing = findConflictingLabelName(bundle.labels, labelDraft);
    const editingLabel = bundle.labels.find((label) => label.id === labelDraft.id);
    if (existing) {
      showToast("同名 label は保存できない", "warning");
      return;
    }
    const nextLabel = {
      id: labelDraft.id || makeLocalId("label"),
      project_id: bundle.project.id,
      project_name: bundle.project.name,
      name: labelDraft.name.trim(),
      color: normalizedLabelColor,
      description: labelDraft.description,
      shortcut: editingLabel?.shortcut ?? null,
      meta: {},
    };
    mutateSettingsBundle((draft) => {
      const index = draft.labels.findIndex((label) => label.id === nextLabel.id);
      if (index >= 0) {
        draft.labels[index] = nextLabel;
        return;
      }
      draft.labels.push(nextLabel);
    });
    setSelectedSettingsLabelId(nextLabel.id);
    setLabelDraft(toLabelDraft(nextLabel));
  }

  function handleDeleteLabel(labelId: string) {
    const deletingSelectedSettingsLabel = selectedSettingsLabelId === labelId;
    mutateSettingsBundle((draft) => {
      draft.labels = draft.labels.filter((item) => item.id !== labelId);
    });
    if (focusedLabelId === labelId) {
      setFocusedLabelId(bundle?.labels.find((item) => item.id !== labelId)?.id ?? null);
    }
    if (deletingSelectedSettingsLabel) {
      setSelectedSettingsLabelId(null);
      setLabelDraft(createEmptyLabelDraft());
    }
  }

  if (loading || !bundle) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100vh",
        bgcolor: "background.default",
        display: "grid",
        gridTemplateRows: "auto minmax(0,1fr)",
        overflow: "hidden",
      }}
    >
      <ProjectShellHeader
        bundle={bundle}
        user={user}
        view={view}
        shortcutButtonRef={shortcutButtonRef}
        onBackToProjects={() => requestAction({ type: "projects" })}
        onChangeView={(nextView) => requestAction({ type: nextView })}
        onOpenShortcuts={handleShortcutPanelToggle}
        onLogout={onLogout}
      />

      <Box
        sx={{
          p: 2,
          boxSizing: "border-box",
          display: "grid",
          gap: 2,
          overflow: "hidden",
          minHeight: 0,
          gridTemplateColumns: view === "workspace" ? "320px minmax(540px,1fr) 380px" : "minmax(0,1fr)",
        }}
      >
        {view === "workspace" ? (
          <WorkspaceView
            bundle={bundle}
            currentDocument={currentDocument}
            currentHiddenBySearch={currentHiddenBySearch}
            visibleDocuments={visibleDocuments}
            pinnedCurrentDocument={pinnedCurrentDocument}
            pendingDocumentTotal={pendingDocumentTotal}
            documentTotal={documentTotal}
            searchQuery={searchQuery}
            sortMode={sortMode}
            documentsLoadingMore={documentsLoadingMore}
            documentNextOffset={documentNextOffset}
            documentListScrollRef={documentListScrollRef}
            focusedLabel={focusedLabel}
            selectedAnnotationId={selectedAnnotationId}
            selectedAnnotation={selectedAnnotation}
            selectedAnnotationMetaDraft={selectedAnnotationMetaDraft}
            selectedAnnotationMetaError={selectedAnnotationMetaError}
            selectionPreview={selectionPreview}
            rightTab={rightTab}
            annotationEditCollapsed={annotationEditCollapsed}
            accordionOpen={accordionOpen}
            sameLabelExamples={sameLabelExamples}
            sameLabelExamplesTotal={sameLabelExamplesTotal}
            sameLabelExamplesOffset={sameLabelExamplesOffset}
            sameLabelExamplesLoadingMore={sameLabelExamplesLoadingMore}
            sameLabelExampleDetails={sameLabelExampleDetails}
            sameLabelExamplesScrollRef={sameLabelExamplesScrollRef}
            sameSurfaceExamples={sameSurfaceExamples}
            sameSurfaceExamplesTotal={sameSurfaceExamplesTotal}
            sameSurfaceExamplesOffset={sameSurfaceExamplesOffset}
            sameSurfaceExamplesLoadingMore={sameSurfaceExamplesLoadingMore}
            sameSurfaceExamplesScrollRef={sameSurfaceExamplesScrollRef}
            sameSurfaceTargetLabelId={sameSurfaceTargetLabelId}
            dirty={dirty}
            saving={saving}
            onOpenCreateDocument={() => setCreateDocOpen(true)}
            onSearchQueryChange={setSearchQuery}
            onSortModeChange={setSortMode}
            onLoadMoreDocuments={() => void fetchDocumentPage(false)}
            onSelectDocument={(docId) => requestAction({ type: "doc", docId })}
            onFocusLabel={setFocusedLabelId}
            onSelectAnnotation={setSelectedAnnotationId}
            onCreateAnnotation={handleCreateAnnotation}
            onClearSelection={() => {
              clearWorkspaceSelection();
            }}
            onSelectionDraftChange={setSelectionPreview}
            onSave={() => void handleSave()}
            onSubmit={() => void handleSubmit()}
            onRightTabChange={setRightTab}
            onLoadMoreSameLabelExamples={() => void loadSameLabelExamples(false)}
            onEnsureSameLabelDetails={(surfaceKey, surfaceText, duplicateCount) =>
              void ensureSameLabelDetails(surfaceKey, surfaceText, duplicateCount)
            }
            onLoadMoreSameSurfaceExamples={() => void loadSameSurfaceExamples(false)}
            onToggleAnnotationEditCollapsed={() => setAnnotationEditCollapsed((current) => !current)}
            onUpdateSelectedAnnotationStatus={handleSelectedAnnotationStatusChange}
            onUpdateSelectedAnnotationComment={handleSelectedAnnotationCommentChange}
            onUpdateSelectedAnnotationMeta={handleSelectedAnnotationMetaChange}
            onDeleteSelectedAnnotation={deleteSelectedAnnotation}
            onToggleAnnotationGroup={handleToggleAnnotationGroup}
          />
        ) : (
          <SettingsView
            bundle={bundle}
            selectedLabelId={selectedSettingsLabelId}
            labelDraft={labelDraft}
            normalizedLabelColor={normalizedLabelColor}
            labelColorValid={labelColorValid}
            labelColorPreview={labelColorPreview}
            labelColorInputRef={labelColorInputRef}
            settingsImportFile={settingsImportFile}
            exportPending={exportPending}
            exportVerified={exportVerified}
            dirty={dirty}
            saving={saving}
            importing={settingsImporting}
            importFeedback={settingsImportFeedback}
            onProjectNameChange={(value) =>
              mutateSettingsBundle((draft) => {
                draft.project.name = value;
              })
            }
            onProjectDescriptionChange={(value) =>
              mutateSettingsBundle((draft) => {
                draft.project.description = value;
              })
            }
            onProjectGuidelineChange={(value) =>
              mutateSettingsBundle((draft) => {
                setProjectGuideline(draft.project, value);
              })
            }
            onLabelDraftChange={setLabelDraft}
            onNormalizeLabelColor={() =>
              setLabelDraft((current) => {
                const nextColor = normalizeHexColor(current.color);
                return nextColor === current.color ? current : { ...current, color: nextColor };
              })
            }
            onOpenColorPicker={() => labelColorInputRef.current?.click()}
            onPickLabelColor={(value) => setLabelDraft((current) => ({ ...current, color: value }))}
            onSubmitLabelDraft={handleLabelDraftSubmit}
            onResetLabelDraft={() => {
              setSelectedSettingsLabelId(null);
              setLabelDraft(createEmptyLabelDraft());
            }}
            onSelectLabel={(labelId) => {
              const selectedLabel = bundle.labels.find((label) => label.id === labelId);
              if (!selectedLabel) {
                return;
              }
              setSelectedSettingsLabelId(labelId);
              setLabelDraft(toLabelDraft(selectedLabel));
            }}
            onDeleteLabel={handleDeleteLabel}
            onImportFileChange={(file) => {
              setSettingsImportFile(file);
              setSettingsImportFeedback(null);
            }}
            onImport={() => void handleSettingsImport()}
            onExportPendingChange={setExportPending}
            onExportVerifiedChange={setExportVerified}
            onExport={() => void handleExport()}
            onSave={() => void handleSave()}
          />
        )}
      </Box>

      <PendingChangesDialog
        open={Boolean(pendingAction)}
        confirmButtonRef={pendingActionConfirmButtonRef}
        onClose={() => setPendingAction(null)}
        onDiscard={() => void resolvePendingAction("discard")}
        onSave={() => void resolvePendingAction("save")}
      />

      <CreateDocumentDialog
        open={createDocOpen}
        saving={saving}
        documentName={newDocName}
        documentText={newDocText}
        onNameChange={setNewDocName}
        onTextChange={setNewDocText}
        onClose={() => setCreateDocOpen(false)}
        onCreate={() => void handleCreateDocument()}
      />

      <ShortcutPopover
        open={shortcutOpen}
        anchorEl={shortcutButtonRef.current}
        offset={shortcutPanelOffset}
        dragging={shortcutDragging}
        onClose={() => setShortcutOpen(false)}
        onDragStart={handleShortcutDragStart}
        onDragMove={handleShortcutDragMove}
        onDragEnd={handleShortcutDragEnd}
      />

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
  const { token, user, loading, error, login, logout } = useAuthSession();

  async function handleLogin(username: string, password: string) {
    const loggedIn = await login(username, password);
    if (loggedIn) {
      navigate("/projects");
    }
  }

  function handleLogout() {
    logout();
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
