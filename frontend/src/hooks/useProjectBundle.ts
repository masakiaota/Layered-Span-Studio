import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { DOCUMENT_PAGE_SIZE } from "../features/project-shell/projectShellConstants";
import {
  mergeDocumentWindow,
  trimDocumentWindow,
  toDocumentListItem,
} from "../features/project-shell/projectShellUtils";
import { deepClone } from "../utils";
import type { ProjectBundle, DocumentRecord, DocumentListItem } from "../types";

type ToastSeverity = "success" | "info" | "warning" | "error";

type BundleDocumentLoadResult = {
  bundle: ProjectBundle;
  firstDocumentId: string | null;
};

export function useProjectBundle({
  token,
  projectId,
  searchQuery,
  sortMode,
  showToast,
}: {
  token: string;
  projectId: string;
  searchQuery: string;
  sortMode: string;
  showToast: (message: string, severity: ToastSeverity) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = useState<Pick<ProjectBundle, "project" | "labels"> | null>(null);
  const [documentSnapshotsById, setDocumentSnapshotsById] = useState<Record<string, DocumentRecord>>({});
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [documentList, setDocumentList] = useState<DocumentListItem[]>([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [pendingDocumentTotal, setPendingDocumentTotal] = useState(0);
  const [documentNextOffset, setDocumentNextOffset] = useState(0);
  const [documentsLoadingMore, setDocumentsLoadingMore] = useState(false);
  const documentListRequestIdRef = useRef(0);
  const initialDocumentListLoadedRef = useRef(false);

  const activateDocument = useCallback((documentId: string | null) => {
    setSelectedDocId(documentId);
  }, []);

  const loadBundle = useCallback(
    async (
      nextSearchQuery: string = searchQuery,
      nextSortMode: string = sortMode,
    ): Promise<BundleDocumentLoadResult | null> => {
      setLoading(true);
      const requestId = ++documentListRequestIdRef.current;
      initialDocumentListLoadedRef.current = false;
      try {
        if (!projectId) {
          return null;
        }
        const [project, { labels }, documentsResponse] = await Promise.all([
          api.getProject(token, projectId),
          api.listLabels(token, projectId),
          api.listDocuments(token, projectId, {
            offset: 0,
            limit: DOCUMENT_PAGE_SIZE,
            search: nextSearchQuery,
            sort: nextSortMode,
          }),
        ]);

        if (requestId !== documentListRequestIdRef.current) {
          return null;
        }

        const firstDocId = documentsResponse.documents[0]?.id ?? null;
        const loadedDocuments = firstDocId ? [await api.getDocument(token, projectId, firstDocId)] : [];

        if (requestId !== documentListRequestIdRef.current) {
          return null;
        }

        const nextBundle: ProjectBundle = {
          project,
          labels,
          documents: loadedDocuments,
        };
        setBundle(nextBundle);
        setSettingsSnapshot({
          project: deepClone(project),
          labels: deepClone(labels),
        });
        setDocumentSnapshotsById(
          Object.fromEntries(loadedDocuments.map((document) => [document.id, deepClone(document)])),
        );
        setDocumentList(trimDocumentWindow(documentsResponse.documents, firstDocId));
        setDocumentTotal(documentsResponse.total);
        setPendingDocumentTotal(documentsResponse.pending_total);
        setDocumentNextOffset(documentsResponse.offset + documentsResponse.documents.length);
        initialDocumentListLoadedRef.current = true;

        return {
          bundle: nextBundle,
          firstDocumentId: firstDocId,
        };
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Workspace の読み込みに失敗した", "error");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [projectId, token, searchQuery, sortMode, showToast],
  );

  const fetchDocumentPage = useCallback(
    async (reset: boolean, selectedIdOverride?: string | null): Promise<DocumentListItem[]> => {
      if (!projectId) {
        return [];
      }
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
        if (!reset) {
          setDocumentsLoadingMore(false);
        }
      }
    },
    [documentNextOffset, projectId, searchQuery, selectedDocId, showToast, sortMode, token],
  );

  useEffect(() => {
    if (!projectId || !token) {
      setLoading(false);
      return;
    }
    void loadBundle();
  }, [projectId, token, loadBundle]);

  useEffect(() => {
    if (!bundle || !initialDocumentListLoadedRef.current) {
      return;
    }
    void fetchDocumentPage(true);
  }, [searchQuery, sortMode, bundle, fetchDocumentPage]);

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
  }, [bundle, projectId, selectedDocId, token, showToast]);

  return {
    loading,
    bundle,
    setBundle,
    settingsSnapshot,
    setSettingsSnapshot,
    documentSnapshotsById,
    setDocumentSnapshotsById,
    selectedDocId,
    activateDocument,
    documentList,
    setDocumentList,
    documentTotal,
    setDocumentTotal,
    pendingDocumentTotal,
    setPendingDocumentTotal,
    documentNextOffset,
    setDocumentNextOffset,
    documentsLoadingMore,
    setDocumentsLoadingMore,
    loadBundle,
    fetchDocumentPage,
    setSelectedDocId,
  };
}
