import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Snackbar,
} from "@mui/material";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "./api";
import { CreateDocumentDialog } from "./features/project-shell/CreateDocumentDialog";
import { DeleteDocumentDialog } from "./features/project-shell/DeleteDocumentDialog";
import { DeleteProjectDialog } from "./features/project-shell/DeleteProjectDialog";
import { PendingChangesDialog } from "./features/project-shell/PendingChangesDialog";
import { ProjectShellHeader } from "./features/project-shell/ProjectShellHeader";
import { SettingsView } from "./features/project-shell/SettingsView";
import {
  DEFAULT_LABEL_COLOR,
} from "./features/project-shell/projectShellConstants";
import type { LabelDraft, PendingAction, RightTab, SelectionPreview } from "./features/project-shell/projectShellTypes";
import {
  createEmptyLabelDraft,
  findConflictingLabelName,
  isHexColor,
  normalizeHexColor,
  toLabelDraft,
  toDocumentListItem,
  trimDocumentWindow,
} from "./features/project-shell/projectShellUtils";
import { ShortcutPopover } from "./features/project-shell/ShortcutPopover";
import { useBodyScrollLock } from "./features/project-shell/useBodyScrollLock";
import { useDocumentHistory } from "./features/project-shell/useDocumentHistory";
import { useImportExport } from "./features/project-shell/useImportExport";
import { useProjectBundle } from "./features/project-shell/useProjectBundle";
import { useProjectExamples } from "./features/project-shell/useProjectExamples";
import { useProjectShortcuts } from "./features/project-shell/useProjectShortcuts";
import { sortAnnotationsInPanelOrder } from "./features/workspace/workspaceUtils";
import { WorkspaceView } from "./features/project-shell/WorkspaceView";
import { useAuthSession } from "./hooks/useAuthSession";
import { useToast } from "./hooks/useToast";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import type {
  AnnotationRecord,
  DocumentRecord,
  UserRecord,
} from "./api-contract";
import type {
  DocumentListItem,
  ProjectBundle,
} from "./types";
import {
  deepClone,
  documentMatchesSearch,
  formatAnnotationMetaDraft,
  getDocumentStatus,
  isLocalId,
  makeLocalId,
  parseAnnotationMetaDraft,
  setProjectGuideline,
  sortDocumentItems,
} from "./utils";

const WORKSPACE_LAYOUT = {
  leftPaneWidth: 320,
  centerPaneMinWidth: 540,
  rightPaneWidth: 380,
  gap: 2,
} as const;

const WORKSPACE_LAYOUT_COLUMNS = `${WORKSPACE_LAYOUT.leftPaneWidth}px minmax(${WORKSPACE_LAYOUT.centerPaneMinWidth}px,1fr) ${WORKSPACE_LAYOUT.rightPaneWidth}px`;

export function ProjectShell({
  user,
  onLogout,
}: {
  user: UserRecord;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId = "" } = useParams();
  const view: "workspace" | "settings" = location.pathname.endsWith("/settings") ? "settings" : "workspace";
  const isWorkspaceView = view === "workspace";
  const { toast, showToast, closeToast } = useToast();
  const [saving, setSaving] = useState(false);
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; documentName: string; isCurrent: boolean } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState(false);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const shortcutButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingActionConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteDocumentConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const documentListScrollRef = useRef<HTMLDivElement | null>(null);
  const sameLabelExamplesScrollRef = useRef<HTMLDivElement | null>(null);
  const sameSurfaceExamplesScrollRef = useRef<HTMLDivElement | null>(null);
  const shortcutDragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const labelColorInputRef = useRef<HTMLInputElement | null>(null);
  const [shortcutPanelOffset, setShortcutPanelOffset] = useState({ x: 0, y: 0 });
  const [shortcutDragging, setShortcutDragging] = useState(false);
  const normalizedLabelColor = normalizeHexColor(labelDraft.color);
  const labelColorValid = isHexColor(labelDraft.color);
  const labelColorPreview = labelColorValid ? normalizedLabelColor : DEFAULT_LABEL_COLOR;

  useBodyScrollLock();

  const {
    loading,
    bundle,
    setBundle,
    settingsSnapshot,
    setSettingsSnapshot,
    documentSnapshotsById,
    setDocumentSnapshotsById,
    documentList,
    setDocumentList,
    documentTotal,
    setDocumentTotal,
    pendingDocumentTotal,
    setPendingDocumentTotal,
    documentNextOffset,
    documentsLoadingMore,
    loadBundle,
    fetchDocumentPage,
    mutateSettingsBundle,
    removeDocumentFromLocalState,
  } = useProjectBundle({
    projectId,
    searchQuery,
    sortMode,
    selectedDocId,
    showToast,
  });

  const currentDocument = useMemo(() => {
    if (!bundle) {
      return null;
    }
    if (selectedDocId) {
      return bundle.documents.find((document) => document.id === selectedDocId) ?? null;
    }
    return bundle.documents[0] ?? null;
  }, [bundle, selectedDocId]);
  const currentDocumentLoading = Boolean(selectedDocId && !currentDocument);
  const currentDocumentSnapshot = currentDocument ? documentSnapshotsById[currentDocument.id] ?? null : null;
  const workspaceBusy = saving || deletingDocument;

  const {
    historyState,
    setHistoryState,
    canUndo,
    canRedo,
    mutateCurrentDocument,
    undoBundle,
    redoBundle,
    clearDocumentHistory,
  } = useDocumentHistory({
    bundle,
    setBundle,
    currentDocument,
    currentDocumentSnapshot,
    view,
  });

  function handleBundleLoaded(nextBundle: ProjectBundle, firstDocId: string | null) {
    setHistoryState({
      documentId: firstDocId,
      entries: nextBundle.documents[0] ? [deepClone(nextBundle.documents[0])] : [],
      index: nextBundle.documents[0] ? 0 : -1,
    });
    activateDocument(firstDocId);
    setFocusedLabelId(nextBundle.labels[0]?.id ?? null);
    setSelectedSettingsLabelId(null);
    setLabelDraft(createEmptyLabelDraft());
    setAccordionOpen(Object.fromEntries(nextBundle.labels.map((label) => [label.id, true])));
  }

  const {
    settingsImportFile,
    setSettingsImportFile,
    settingsImportFeedback,
    setSettingsImportFeedback,
    settingsImporting,
    exportPending,
    setExportPending,
    exportVerified,
    setExportVerified,
    handleSettingsImport,
    handleExport,
  } = useImportExport({
    bundle,
    loadBundle: () => loadBundle(handleBundleLoaded),
    showToast,
  });
  const settingsBusy = saving || settingsImporting || deletingProject;

  useEffect(() => {
    void loadBundle(handleBundleLoaded);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const getDisplayDocumentStatus = (document: DocumentListItem) => {
    if (currentDocument?.id === document.id && currentDocumentDirty && currentDocument?.status === "verified") {
      return "pending";
    }
    return getDocumentStatus(document);
  };
  const currentHiddenBySearch = Boolean(
    currentDocument && searchQuery.trim() && !documentMatchesSearch(currentDocument, searchQuery),
  );
  const displayedPendingDocumentTotal = useMemo(() => {
    const localOffset =
      currentDocument?.status === "verified" && currentDocumentDirty && !currentHiddenBySearch ? 1 : 0;
    return pendingDocumentTotal + localOffset;
  }, [currentDocument?.status, currentDocumentDirty, currentHiddenBySearch, pendingDocumentTotal]);

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
    enabled: Boolean(bundle && currentDocument && !workspaceBusy),
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

  useEffect(() => {
    if (!deleteDialogOpen || !deleteTarget) {
      return;
    }
    const focusTimer = requestAnimationFrame(() => {
      deleteDocumentConfirmButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(focusTimer);
  }, [deleteDialogOpen, deleteTarget]);

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
      const savedDocument = await api.saveDocumentBundle(bundle.project.id, currentDocument.id, payload, forceVerified);
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
        savedProject = await api.saveProjectSettings(bundle.project);
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
          if (!settingsSnapshot.labelsRevision) {
            throw new Error("Labels revision が取得できなかったため保存を続行できない");
          }
          const labelsResponse = await api.saveProjectLabels(
            bundle.project.id,
            bundle.labels.map((label) => ({
              id: isLocalId(label.id) ? null : label.id,
              name: label.name,
              color: label.color,
              description: label.description,
              shortcut: label.shortcut ?? null,
              meta: label.meta ?? {},
            })),
            settingsSnapshot.labelsRevision,
          );
          savedLabels = labelsResponse.labels;
          const refreshedCurrentDocument = selectedDocId
            ? await api.getDocument(bundle.project.id, selectedDocId).catch(() => null)
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
                  labelsRevision: labelsResponse.revision,
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
    if (!bundle || visibleDocuments.length === 0 || !currentDocument || workspaceBusy) {
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
      if (!pendingOnly || getDisplayDocumentStatus(candidate) === "pending") {
        requestAction({ type: "doc", docId: candidate.id });
        return;
      }
      index += direction;
    }
    if (direction > 0 && documentNextOffset < documentTotal) {
      const appendedDocuments = await fetchDocumentPage(false);
      const nextCandidate = appendedDocuments.find((document) => {
        const status = getDisplayDocumentStatus(document);
        return !pendingOnly || status === "pending";
      });
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
    if (workspaceBusy) {
      return null;
    }
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
    if (!bundle || !currentDocument || view !== "workspace" || workspaceBusy) {
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
    if (action.type === "logout") {
      onLogout();
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

  function closeDeleteDialog() {
    if (deletingDocument) {
      return;
    }
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  }

  function requestDeleteDocument(document: DocumentListItem | DocumentRecord) {
    if (!bundle || workspaceBusy) {
      return;
    }
    setDeleteTarget({
      id: document.id,
      documentName: document.document_name,
      isCurrent: document.id === selectedDocId,
    });
    setDeleteDialogOpen(true);
  }

  function getNextDocumentIdAfterDeletion(deletedId: string): string | null {
    const currentIndex = visibleDocuments.findIndex((document) => document.id === deletedId);
    if (currentIndex < 0) {
      return null;
    }
    return visibleDocuments[currentIndex + 1]?.id ?? visibleDocuments[currentIndex - 1]?.id ?? null;
  }

  function applyDeletionResult({
    deletedId,
    nextSelectedId,
    deletingCurrent,
    nextDocument,
  }: {
    deletedId: string;
    nextSelectedId: string | null;
    deletingCurrent: boolean;
    nextDocument: DocumentRecord | null;
  }) {
    removeDocumentFromLocalState(deletedId);
    clearDocumentHistory(deletedId);

    if (deletingCurrent) {
      if (nextDocument) {
        setBundle((current) =>
          current
            ? {
                ...current,
                documents: [...current.documents.filter((document) => document.id !== nextDocument.id), nextDocument],
              }
            : current,
        );
        setDocumentSnapshotsById((current) => ({
          ...current,
          [nextDocument.id]: deepClone(nextDocument),
        }));
        setHistoryState({
          documentId: nextDocument.id,
          entries: [deepClone(nextDocument)],
          index: 0,
        });
      }
      activateDocument(nextSelectedId);
    }

    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  }

  async function confirmDeleteDocument() {
    if (!bundle || !deleteTarget || workspaceBusy) {
      return;
    }

    const deletedId = deleteTarget.id;
    const deletingCurrent = deleteTarget.isCurrent;
    const nextSelectedId = deletingCurrent ? getNextDocumentIdAfterDeletion(deletedId) : selectedDocId;
    const existingNextDocument = nextSelectedId
      ? bundle.documents.find((document) => document.id === nextSelectedId) ?? null
      : null;

    setDeletingDocument(true);
    try {
      await api.deleteDocument(bundle.project.id, deletedId);

      let nextDocument = existingNextDocument;
      if (deletingCurrent && nextSelectedId && !nextDocument) {
        nextDocument = await api.getDocument(bundle.project.id, nextSelectedId);
      }

      applyDeletionResult({ deletedId, nextSelectedId, deletingCurrent, nextDocument });
      await fetchDocumentPage(true, nextSelectedId);
      showToast("Document を削除した", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document の削除に失敗した";
      if (error instanceof ApiError && error.status === 404) {
        let nextDocument = existingNextDocument;
        if (deletingCurrent && nextSelectedId && !nextDocument) {
          nextDocument = await api.getDocument(bundle.project.id, nextSelectedId).catch(() => null);
        }
        applyDeletionResult({ deletedId, nextSelectedId, deletingCurrent, nextDocument });
        await fetchDocumentPage(true, nextSelectedId);
        showToast("Document は既に削除されている", "info");
      } else {
        showToast(message, "error");
      }
    } finally {
      setDeletingDocument(false);
    }
  }

  async function confirmDeleteProject() {
    if (!bundle || settingsBusy) {
      return;
    }
    setDeletingProject(true);
    try {
      await api.deleteProject(bundle.project.id);
      navigate("/projects", { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        navigate("/projects", { replace: true });
        return;
      }
      showToast(error instanceof Error ? error.message : "Project の削除に失敗した", "error");
    } finally {
      setDeletingProject(false);
      setDeleteProjectDialogOpen(false);
    }
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
    if (!bundle || workspaceBusy) {
      return;
    }
    if (!newDocName.trim() || !newDocText.trim()) {
      return;
    }
    setSaving(true);
    try {
      const created = await api.createDocument(bundle.project.id, {
        document_name: newDocName.trim(),
        text: newDocText,
        meta: {},
      });
      const createdDocument = await api.getDocument(bundle.project.id, created.id);
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
        onLogout={() => requestAction({ type: "logout" })}
      />

      <Box
        sx={{
          p: 2,
          boxSizing: "border-box",
          overflowX: isWorkspaceView ? "auto" : "hidden",
          overflowY: "hidden",
          minHeight: 0,
        }}
      >
        <Box
          sx={(theme) => ({
            display: "grid",
            gap: WORKSPACE_LAYOUT.gap,
            minHeight: "100%",
            width: "100%",
            minWidth: isWorkspaceView
              ? `calc(${WORKSPACE_LAYOUT.leftPaneWidth}px + ${WORKSPACE_LAYOUT.centerPaneMinWidth}px + ${WORKSPACE_LAYOUT.rightPaneWidth}px + ${theme.spacing(WORKSPACE_LAYOUT.gap * 2)})`
              : 0,
            gridTemplateColumns: isWorkspaceView ? WORKSPACE_LAYOUT_COLUMNS : "minmax(0,1fr)",
          })}
        >
          {isWorkspaceView ? (
            <WorkspaceView
              bundle={bundle}
              currentDocument={currentDocument}
              selectedDocumentId={selectedDocId}
              currentDocumentLoading={currentDocumentLoading}
              currentHiddenBySearch={currentHiddenBySearch}
              visibleDocuments={visibleDocuments}
              pinnedCurrentDocument={pinnedCurrentDocument}
              pendingDocumentTotal={displayedPendingDocumentTotal}
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
            getDisplayDocumentStatus={getDisplayDocumentStatus}
            dirty={dirty}
            saving={workspaceBusy}
            onOpenCreateDocument={() => setCreateDocOpen(true)}
            onSearchQueryChange={setSearchQuery}
            onSortModeChange={setSortMode}
              onLoadMoreDocuments={() => void fetchDocumentPage(false)}
              onSelectDocument={(docId) => {
                if (workspaceBusy) {
                  return;
                }
                requestAction({ type: "doc", docId });
              }}
              onRequestDeleteDocument={(documentId) => {
                const target =
                  visibleDocuments.find((document) => document.id === documentId) ??
                  bundle.documents.find((document) => document.id === documentId);
                if (!target) {
                  return;
                }
                requestDeleteDocument(target);
              }}
              deleteDisabled={workspaceBusy}
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
              onRequestDeleteProject={() => setDeleteProjectDialogOpen(true)}
              deletingProject={deletingProject}
            />
          )}
        </Box>
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
        saving={workspaceBusy}
        documentName={newDocName}
        documentText={newDocText}
        onNameChange={setNewDocName}
        onTextChange={setNewDocText}
        onClose={() => {
          if (workspaceBusy) {
            return;
          }
          setCreateDocOpen(false);
        }}
        onCreate={() => void handleCreateDocument()}
      />

      <DeleteDocumentDialog
        open={deleteDialogOpen && Boolean(deleteTarget)}
        busy={workspaceBusy}
        documentName={deleteTarget?.documentName ?? ""}
        currentDocumentDirty={Boolean(deleteTarget?.isCurrent && currentDocumentDirty)}
        confirmButtonRef={deleteDocumentConfirmButtonRef}
        onClose={closeDeleteDialog}
        onDelete={() => void confirmDeleteDocument()}
      />

      <DeleteProjectDialog
        open={deleteProjectDialogOpen}
        busy={deletingProject}
        projectName={bundle.project.name}
        dirty={dirty}
        onClose={() => {
          if (deletingProject) {
            return;
          }
          setDeleteProjectDialogOpen(false);
        }}
        onDelete={() => void confirmDeleteProject()}
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
  const { user, loading, error, login, logout } = useAuthSession();

  async function handleLogin(username: string, password: string) {
    const loggedIn = await login(username, password);
    if (loggedIn) {
      navigate("/projects");
    }
  }

  async function handleLogout() {
    await logout();
    if (location.pathname !== "/login") {
      navigate("/login");
    }
  }

  if (loading && !user) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Routes>
      {!user ? (
        <>
          <Route path="/login" element={<LoginPage loading={loading} error={error} onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : (
        <>
          <Route path="/login" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage user={user} onLogout={() => void handleLogout()} />} />
          <Route path="/projects/:projectId" element={<ProjectShell user={user} onLogout={() => void handleLogout()} />} />
          <Route path="/projects/:projectId/settings" element={<ProjectShell user={user} onLogout={() => void handleLogout()} />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </>
      )}
    </Routes>
  );
}
