import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type {
  DocumentSortValue,
  DocumentRecord,
} from "../../api-contract";
import type { DocumentListItem, ProjectBundle } from "../../types";
import { deepClone } from "../../utils";
import {
  DOCUMENT_DETAIL_CACHE_RECENT_SIZE,
  DOCUMENT_LIST_SYNC_INTERVAL_MS,
  DOCUMENT_PAGE_SIZE,
  DOCUMENT_WINDOW_SIZE,
} from "./projectShellConstants";
import {
  mergeDocumentListRefresh,
  mergeDocumentScrollWindow,
  toDocumentListItem,
  trimDocumentScrollWindow,
} from "./projectShellUtils";

type ShowToast = (message: string, severity: "success" | "info" | "warning" | "error") => void;
type DocumentPageRequest = boolean | "reset" | "next" | "previous";

export type OnBundleLoaded = (bundle: ProjectBundle, firstDocId: string | null) => void;
type SettingsSnapshot = Pick<ProjectBundle, "project" | "labels"> & { labelsRevision: string };
type SettingsBundleDraft = Pick<ProjectBundle, "project" | "labels">;

function isDocumentDirty(
  document: DocumentRecord,
  snapshotsById: Record<string, DocumentRecord>,
) {
  const snapshot = snapshotsById[document.id];
  return Boolean(snapshot) && JSON.stringify(document) !== JSON.stringify(snapshot);
}

function moveDocumentToRecent(documentIds: string[], documentId: string) {
  return [
    documentId,
    ...documentIds.filter((id) => id !== documentId),
  ];
}

function buildDocumentDetailCacheIds({
  documents,
  snapshotsById,
  selectedDocId,
  recentDocumentIds,
}: {
  documents: DocumentRecord[];
  snapshotsById: Record<string, DocumentRecord>;
  selectedDocId: string | null;
  recentDocumentIds: string[];
}) {
  const loadedIds = new Set(documents.map((document) => document.id));
  const keepIds = new Set<string>();
  if (selectedDocId && loadedIds.has(selectedDocId)) {
    keepIds.add(selectedDocId);
  }
  for (const document of documents) {
    if (isDocumentDirty(document, snapshotsById)) {
      keepIds.add(document.id);
    }
  }
  const recentDocumentIdSet = new Set(recentDocumentIds);
  const orderedRecentIds = [
    ...recentDocumentIds,
    ...documents
      .map((document) => document.id)
      .filter((documentId) => !recentDocumentIdSet.has(documentId)),
  ];
  let recentCount = 0;
  for (const documentId of orderedRecentIds) {
    if (loadedIds.has(documentId)) {
      keepIds.add(documentId);
      recentCount += 1;
    }
    if (recentCount >= DOCUMENT_DETAIL_CACHE_RECENT_SIZE) {
      break;
    }
  }
  return keepIds;
}

function buildDocumentWindowLookupOffsets(startOffset: number, total: number) {
  const maxOffset = Math.max(0, total - DOCUMENT_PAGE_SIZE);
  const clampedStartOffset = Math.min(Math.max(0, startOffset), maxOffset);
  const offsets: number[] = [];
  const seen = new Set<number>();
  const addOffset = (offset: number) => {
    const clampedOffset = Math.min(Math.max(0, offset), maxOffset);
    if (seen.has(clampedOffset)) {
      return;
    }
    seen.add(clampedOffset);
    offsets.push(clampedOffset);
  };

  addOffset(clampedStartOffset);
  for (
    let distance = DOCUMENT_PAGE_SIZE;
    seen.size * DOCUMENT_PAGE_SIZE <= total + DOCUMENT_PAGE_SIZE;
    distance += DOCUMENT_PAGE_SIZE
  ) {
    addOffset(clampedStartOffset - distance);
    addOffset(clampedStartOffset + distance);
    if (seen.has(0) && seen.has(maxOffset)) {
      break;
    }
  }
  return offsets;
}

export function useProjectBundle({
  projectId,
  searchQuery,
  sortMode,
  selectedDocId,
  showToast,
}: {
  projectId: string;
  searchQuery: string;
  sortMode: DocumentSortValue;
  selectedDocId: string | null;
  showToast: ShowToast;
}) {
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [documentSnapshotsById, setDocumentSnapshotsById] = useState<Record<string, DocumentRecord>>({});
  const [documentList, setDocumentList] = useState<DocumentListItem[]>([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [pendingDocumentTotal, setPendingDocumentTotal] = useState(0);
  const [documentWindowStartOffset, setDocumentWindowStartOffset] = useState(0);
  const [documentNextOffset, setDocumentNextOffset] = useState(0);
  const [documentsLoadingMore, setDocumentsLoadingMore] = useState(false);

  const documentListRequestIdRef = useRef(0);
  const documentListRefreshRequestIdRef = useRef(0);
  const bundleLoadRequestIdRef = useRef(0);
  const documentLoadMoreRequestIdRef = useRef(0);
  const initialDocumentListLoadedRef = useRef(false);
  const recentDocumentDetailIdsRef = useRef<string[]>([]);
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncContextRef = useRef({
    bundle,
    projectId,
    searchQuery,
    sortMode,
    selectedDocId,
    documentWindowStartOffset,
  });
  syncContextRef.current = {
    bundle,
    projectId,
    searchQuery,
    sortMode,
    selectedDocId,
    documentWindowStartOffset,
  };

  function clearSearchDebounceTimer() {
    if (searchDebounceTimerRef.current === null) {
      return;
    }
    clearTimeout(searchDebounceTimerRef.current);
    searchDebounceTimerRef.current = null;
  }

  function isDocumentListRefreshContextStale(context: {
    projectId: string;
    searchQuery: string;
    sortMode: DocumentSortValue;
    bundleProjectId: string;
  }) {
    const current = syncContextRef.current;
    return (
      !current.bundle ||
      !initialDocumentListLoadedRef.current ||
      current.bundle.project.id !== current.projectId ||
      current.projectId !== context.projectId ||
      current.searchQuery !== context.searchQuery ||
      current.sortMode !== context.sortMode ||
      current.bundle.project.id !== context.bundleProjectId
    );
  }

  async function loadBundle(onLoaded?: OnBundleLoaded) {
    clearSearchDebounceTimer();
    initialDocumentListLoadedRef.current = false;
    documentListRefreshRequestIdRef.current += 1;
    setLoading(true);
    documentListRequestIdRef.current += 1;
    documentLoadMoreRequestIdRef.current += 1;
    setDocumentsLoadingMore(false);
    const loadRequestId = ++bundleLoadRequestIdRef.current;
    try {
      const [project, labelsResponse, documentsResponse] = await Promise.all([
        api.getProject(projectId),
        api.listLabels(projectId),
        api.listDocuments(projectId, {
          offset: 0,
          limit: DOCUMENT_PAGE_SIZE,
          search: searchQuery,
          sort: sortMode,
        }),
      ]);
      if (loadRequestId !== bundleLoadRequestIdRef.current) {
        return;
      }
      const firstDocId = documentsResponse.documents[0]?.id ?? null;
      const loadedDocuments = firstDocId
        ? [await api.getDocument(projectId, firstDocId)]
        : [];
      if (loadRequestId !== bundleLoadRequestIdRef.current) {
        return;
      }
      const nextBundle = {
        project,
        labels: labelsResponse.labels,
        documents: loadedDocuments,
      } satisfies ProjectBundle;
      setBundle(nextBundle);
      setSettingsSnapshot({
        project: deepClone(project),
        labels: deepClone(labelsResponse.labels),
        labelsRevision: labelsResponse.revision,
      });
      setDocumentSnapshotsById(
        Object.fromEntries(
          loadedDocuments.map((document) => [document.id, deepClone(document)]),
        ),
      );
      recentDocumentDetailIdsRef.current = loadedDocuments.map((document) => document.id);
      setDocumentList(trimDocumentScrollWindow(documentsResponse.documents, "start"));
      setDocumentTotal(documentsResponse.total);
      setPendingDocumentTotal(documentsResponse.pending_total);
      setDocumentWindowStartOffset(documentsResponse.offset);
      setDocumentNextOffset(
        documentsResponse.offset + documentsResponse.documents.length,
      );
      initialDocumentListLoadedRef.current = true;
      onLoaded?.(nextBundle, firstDocId);
    } catch (error) {
      if (loadRequestId === bundleLoadRequestIdRef.current) {
        showToast(
          error instanceof Error ? error.message : "Workspace の読み込みに失敗した",
          "error",
        );
      }
    } finally {
      if (loadRequestId === bundleLoadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (
      !bundle ||
      !selectedDocId ||
      bundle.documents.some((document) => document.id === selectedDocId)
    ) {
      return;
    }
    let active = true;
    void api
      .getDocument(projectId, selectedDocId)
      .then((document) => {
        if (!active) {
          return;
        }
        setBundle((current) =>
          current
            ? {
                ...current,
                documents: [
                  ...current.documents.filter((item) => item.id !== document.id),
                  document,
                ],
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
          showToast(
            error instanceof Error ? error.message : "Document の取得に失敗した",
            "error",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [bundle, projectId, selectedDocId]);

  useEffect(() => {
    if (!bundle || !selectedDocId) {
      return;
    }
    if (!bundle.documents.some((document) => document.id === selectedDocId)) {
      return;
    }
    recentDocumentDetailIdsRef.current = moveDocumentToRecent(
      recentDocumentDetailIdsRef.current,
      selectedDocId,
    );
  }, [bundle, selectedDocId]);

  useEffect(() => {
    if (!bundle) {
      return;
    }
    const keepIds = buildDocumentDetailCacheIds({
      documents: bundle.documents,
      snapshotsById: documentSnapshotsById,
      selectedDocId,
      recentDocumentIds: recentDocumentDetailIdsRef.current,
    });
    const nextDocuments = bundle.documents.filter((document) => keepIds.has(document.id));
    const documentCacheChanged = nextDocuments.length !== bundle.documents.length;
    const nextSnapshots = Object.fromEntries(
      Object.entries(documentSnapshotsById).filter(([documentId]) => keepIds.has(documentId)),
    );
    const snapshotsChanged = Object.keys(nextSnapshots).length !== Object.keys(documentSnapshotsById).length;
    recentDocumentDetailIdsRef.current = recentDocumentDetailIdsRef.current.filter((documentId) =>
      keepIds.has(documentId),
    );
    if (documentCacheChanged) {
      setBundle((current) =>
        current
          ? {
              ...current,
              documents: current.documents.filter((document) => keepIds.has(document.id)),
            }
          : current,
      );
    }
    if (snapshotsChanged) {
      setDocumentSnapshotsById(nextSnapshots);
    }
  }, [bundle, documentSnapshotsById, selectedDocId]);

  const refreshDocumentList = useCallback(async () => {
    const {
      bundle: currentBundle,
      projectId: currentProjectId,
      searchQuery: currentSearchQuery,
      sortMode: currentSortMode,
    } = syncContextRef.current;
    if (
      !currentBundle ||
      !initialDocumentListLoadedRef.current ||
      currentBundle.project.id !== currentProjectId
    ) {
      return;
    }
    const refreshContext = {
      projectId: currentProjectId,
      searchQuery: currentSearchQuery,
      sortMode: currentSortMode,
      bundleProjectId: currentBundle.project.id,
    };
    const requestId = ++documentListRefreshRequestIdRef.current;
    try {
      const response = await api.listDocuments(currentProjectId, {
        offset: 0,
        limit: DOCUMENT_PAGE_SIZE,
        search: currentSearchQuery,
        sort: currentSortMode,
      });
      if (requestId !== documentListRefreshRequestIdRef.current) {
        return;
      }
      if (isDocumentListRefreshContextStale(refreshContext)) {
        return;
      }
      const {
        selectedDocId: latestSelectedDocId,
        documentWindowStartOffset: latestDocumentWindowStartOffset,
      } = syncContextRef.current;
      setDocumentTotal(response.total);
      setPendingDocumentTotal(response.pending_total);
      if (latestDocumentWindowStartOffset === 0) {
        setDocumentList((current) =>
          mergeDocumentListRefresh(
            current,
            response.documents,
            response.offset,
            latestSelectedDocId,
          ),
        );
      }
    } catch {
      // Background sync failures should not interrupt annotation work.
    }
  }, []);

  async function fetchDocumentPage(
    request: DocumentPageRequest,
    selectedIdOverride?: string | null,
  ): Promise<DocumentListItem[]> {
    const direction = request === true || request === "reset" ? "reset" : request === "previous" ? "previous" : "next";
    if (direction === "previous" && documentWindowStartOffset <= 0) {
      return [];
    }
    const requestId = ++documentListRequestIdRef.current;
    const loadMoreRequestId = direction !== "reset"
      ? ++documentLoadMoreRequestIdRef.current
      : null;
    if (direction === "reset") {
      documentListRefreshRequestIdRef.current += 1;
    }
    if (direction !== "reset") {
      setDocumentsLoadingMore(true);
    } else {
      setDocumentsLoadingMore(false);
    }
    const requestOffset =
      direction === "reset"
        ? 0
        : direction === "previous"
          ? Math.max(0, documentWindowStartOffset - DOCUMENT_PAGE_SIZE)
          : documentNextOffset;
    const requestLimit =
      direction === "previous"
        ? Math.min(DOCUMENT_PAGE_SIZE, documentWindowStartOffset)
        : DOCUMENT_PAGE_SIZE;
    try {
      const response = await api.listDocuments(projectId, {
        offset: requestOffset,
        limit: requestLimit,
        search: searchQuery,
        sort: sortMode,
      });
      if (requestId !== documentListRequestIdRef.current) {
        return [];
      }
      setDocumentTotal(response.total);
      setPendingDocumentTotal(response.pending_total);
      const responseEndOffset = response.offset + response.documents.length;
      if (direction === "reset") {
        setDocumentWindowStartOffset(response.offset);
        setDocumentNextOffset(responseEndOffset);
      } else if (direction === "previous") {
        setDocumentWindowStartOffset(response.offset);
        setDocumentNextOffset(Math.min(documentNextOffset, response.offset + DOCUMENT_WINDOW_SIZE));
      } else {
        setDocumentWindowStartOffset(Math.max(documentWindowStartOffset, responseEndOffset - DOCUMENT_WINDOW_SIZE));
        setDocumentNextOffset(responseEndOffset);
      }
      setDocumentList((current) =>
        direction === "reset"
          ? trimDocumentScrollWindow(response.documents, "start")
          : mergeDocumentScrollWindow(current, response.documents, direction),
      );
      return response.documents;
    } catch (error) {
      if (requestId === documentListRequestIdRef.current) {
        showToast(
          error instanceof Error ? error.message : "Document 一覧の取得に失敗した",
          "error",
        );
      }
      return [];
    } finally {
      if (
        loadMoreRequestId !== null &&
        loadMoreRequestId === documentLoadMoreRequestIdRef.current
      ) {
        setDocumentsLoadingMore(false);
      }
    }
  }

  async function focusDocumentListWindow(documentId: string | null): Promise<DocumentListItem[]> {
    if (!documentId) {
      return [];
    }
    if (documentList.some((document) => document.id === documentId)) {
      return documentList;
    }
    const requestId = ++documentListRequestIdRef.current;
    const loadMoreRequestId = ++documentLoadMoreRequestIdRef.current;
    setDocumentsLoadingMore(true);
    try {
      for (const offset of buildDocumentWindowLookupOffsets(documentWindowStartOffset, documentTotal)) {
        const response = await api.listDocuments(projectId, {
          offset,
          limit: DOCUMENT_PAGE_SIZE,
          search: searchQuery,
          sort: sortMode,
        });
        if (requestId !== documentListRequestIdRef.current) {
          return [];
        }
        const responseEndOffset = response.offset + response.documents.length;
        const found = response.documents.some((document) => document.id === documentId);
        if (found) {
          setDocumentTotal(response.total);
          setPendingDocumentTotal(response.pending_total);
          setDocumentWindowStartOffset(response.offset);
          setDocumentNextOffset(responseEndOffset);
          setDocumentList(trimDocumentScrollWindow(response.documents, "start"));
          return response.documents;
        }
        if (response.documents.length === 0) {
          break;
        }
      }
      showToast("選択中 Document は現在の一覧条件内に見つからなかった", "info");
      return [];
    } catch (error) {
      if (requestId === documentListRequestIdRef.current) {
        showToast(
          error instanceof Error ? error.message : "Document 一覧の取得に失敗した",
          "error",
        );
      }
      return [];
    } finally {
      if (loadMoreRequestId === documentLoadMoreRequestIdRef.current) {
        setDocumentsLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    return clearSearchDebounceTimer;
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!bundle || !initialDocumentListLoadedRef.current) {
      return;
    }
    clearSearchDebounceTimer();
    void fetchDocumentPage(true);
  }, [sortMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!bundle || !initialDocumentListLoadedRef.current) {
      return;
    }
    clearSearchDebounceTimer();
    searchDebounceTimerRef.current = setTimeout(() => {
      searchDebounceTimerRef.current = null;
      void fetchDocumentPage(true);
    }, 200);
    return clearSearchDebounceTimer;
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!bundle) {
      return;
    }
    setDocumentList((current) =>
      current.map((item) => {
        const loaded = bundle.documents.find(
          (document) => document.id === item.id,
        );
        return loaded ? toDocumentListItem(loaded) : item;
      }),
    );
  }, [bundle]);

  const bundleProjectId = bundle?.project.id ?? null;
  const bundleLoaded = bundleProjectId === projectId;

  useEffect(() => {
    if (!bundleLoaded || !initialDocumentListLoadedRef.current) {
      return;
    }
    const syncDocumentList = () => {
      if (document.hidden) {
        return;
      }
      void refreshDocumentList();
    };
    const intervalId = window.setInterval(syncDocumentList, DOCUMENT_LIST_SYNC_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) {
        void refreshDocumentList();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [bundleLoaded, projectId, searchQuery, sortMode, refreshDocumentList]);

  function mutateSettingsBundle(mutator: (draft: SettingsBundleDraft) => void) {
    if (!bundle) {
      return;
    }
    const draft: SettingsBundleDraft = {
      project: deepClone(bundle.project),
      labels: deepClone(bundle.labels),
    };
    mutator(draft);
    const currentState = JSON.stringify({
      project: bundle.project,
      labels: bundle.labels,
    });
    const nextState = JSON.stringify({
      project: draft.project,
      labels: draft.labels,
    });
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

  function removeDocumentFromLocalState(deletedId: string) {
    setBundle((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        documents: current.documents.filter(
          (document) => document.id !== deletedId,
        ),
      };
    });
    setDocumentList((current) =>
      current.filter((document) => document.id !== deletedId),
    );
    setDocumentSnapshotsById((current) => {
      const nextSnapshots = { ...current };
      delete nextSnapshots[deletedId];
      return nextSnapshots;
    });
  }

  return {
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
    documentWindowStartOffset,
    documentNextOffset,
    documentsLoadingMore,
    loadBundle,
    fetchDocumentPage,
    focusDocumentListWindow,
    mutateSettingsBundle,
    removeDocumentFromLocalState,
  };
}
