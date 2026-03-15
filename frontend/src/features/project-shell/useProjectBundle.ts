import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { DocumentRecord, DocumentListItem, ProjectBundle } from "../../types";
import { deepClone } from "../../utils";
import { DOCUMENT_PAGE_SIZE } from "./projectShellConstants";
import { mergeDocumentWindow, toDocumentListItem, trimDocumentWindow } from "./projectShellUtils";

type ToastSeverity = "success" | "info" | "warning" | "error";
type ToastHandler = (message: string, severity?: ToastSeverity) => void;

export type UseProjectBundleResult = {
  loading: boolean;
  bundle: ProjectBundle | null;
  setBundle: React.Dispatch<React.SetStateAction<ProjectBundle | null>>;
  settingsSnapshot: Pick<ProjectBundle, "project" | "labels"> | null;
  setSettingsSnapshot: React.Dispatch<React.SetStateAction<Pick<ProjectBundle, "project" | "labels"> | null>>;
  selectedDocId: string | null;
  setSelectedDocId: React.Dispatch<React.SetStateAction<string | null>>;
  focusedLabelId: string | null;
  setFocusedLabelId: React.Dispatch<React.SetStateAction<string | null>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  sortMode: string;
  setSortMode: React.Dispatch<React.SetStateAction<string>>;
  documentList: DocumentListItem[];
  setDocumentList: React.Dispatch<React.SetStateAction<DocumentListItem[]>>;
  documentTotal: number;
  setDocumentTotal: React.Dispatch<React.SetStateAction<number>>;
  pendingDocumentTotal: number;
  setPendingDocumentTotal: React.Dispatch<React.SetStateAction<number>>;
  documentNextOffset: number;
  setDocumentNextOffset: React.Dispatch<React.SetStateAction<number>>;
  documentsLoadingMore: boolean;
  setDocumentsLoadingMore: React.Dispatch<React.SetStateAction<boolean>>;
  currentDocument: DocumentRecord | null;
  currentDocumentLoading: boolean;
  loadBundle: () => Promise<void>;
  fetchDocumentPage: (reset: boolean, selectedIdOverride?: string | null) => Promise<DocumentListItem[]>;
};

export function useProjectBundle({
  token,
  projectId,
  showToast,
  onBundleLoaded = () => {},
}: {
  token: string;
  projectId: string;
  showToast: ToastHandler;
  onBundleLoaded?: (payload: {
    bundle: ProjectBundle;
    firstDocument: DocumentRecord | null;
    firstDocId: string | null;
  }) => void;
}): UseProjectBundleResult {
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = useState<Pick<ProjectBundle, "project" | "labels"> | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [focusedLabelId, setFocusedLabelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("created");
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

  const loadBundle = useCallback(async () => {
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
      setDocumentList(trimDocumentWindow(documentsResponse.documents, firstDocId));
      setDocumentTotal(documentsResponse.total);
      setPendingDocumentTotal(documentsResponse.pending_total);
      setDocumentNextOffset(documentsResponse.offset + documentsResponse.documents.length);
      initialDocumentListLoadedRef.current = true;
      activateDocument(firstDocId);
      onBundleLoaded({
        bundle: nextBundle,
        firstDocument: loadedDocuments[0] ?? null,
        firstDocId,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Workspace の読み込みに失敗した", "error");
    } finally {
      setLoading(false);
    }
  }, [token, projectId, searchQuery, sortMode, onBundleLoaded, showToast, activateDocument]);

  const fetchDocumentPage = useCallback(
    async (reset: boolean, selectedIdOverride?: string | null): Promise<DocumentListItem[]> => {
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
    },
    [token, projectId, documentNextOffset, searchQuery, sortMode, selectedDocId, showToast],
  );

  useEffect(() => {
    void loadBundle();
  }, [projectId, token, loadBundle]);

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

  const currentDocument =
    !bundle ? null : selectedDocId ? bundle.documents.find((document) => document.id === selectedDocId) ?? null : bundle.documents[0] ?? null;
  const currentDocumentLoading = Boolean(selectedDocId && !currentDocument);

  return {
    loading,
    bundle,
    setBundle,
    settingsSnapshot,
    setSettingsSnapshot,
    selectedDocId,
    setSelectedDocId,
    focusedLabelId,
    setFocusedLabelId,
    searchQuery,
    setSearchQuery,
    sortMode,
    setSortMode,
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
    currentDocument,
    currentDocumentLoading,
    loadBundle,
    fetchDocumentPage,
  };
}
