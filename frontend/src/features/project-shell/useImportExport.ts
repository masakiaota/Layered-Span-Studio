import { useState } from "react";
import { api } from "../../api";
import { buildExportFilename, downloadJson, readJsonFile } from "../../utils";
import { buildImportValidationMessage, describeImportSummary, validateImportPayload } from "../../importValidation";
import { collectDocumentNames } from "./projectShellUtils";
import { DOCUMENT_PAGE_SIZE } from "./projectShellConstants";
import type { DocumentListItem, DocumentRecord, LabelRecord, ProjectBundle, ProjectRecord } from "../../types";
import type { PendingAction } from "./projectShellTypes";

type ToastHandler = (message: string, severity?: "success" | "info" | "warning" | "error") => void;

export type ImportExportSaveResult =
  | { kind: "document"; document: DocumentRecord }
  | { kind: "settings"; project: ProjectRecord; labels: LabelRecord[] }
  | { kind: "none" };

export type UseImportExportResult = {
  saving: boolean;
  pendingAction: PendingAction | null;
  setPendingAction: React.Dispatch<React.SetStateAction<PendingAction | null>>;
  settingsImportFile: File | null;
  setSettingsImportFile: React.Dispatch<React.SetStateAction<File | null>>;
  settingsImportFeedback: {
    severity: "success" | "info" | "warning" | "error";
    message: string;
  } | null;
  settingsImporting: boolean;
  exportPending: boolean;
  setExportPending: React.Dispatch<React.SetStateAction<boolean>>;
  exportVerified: boolean;
  setExportVerified: React.Dispatch<React.SetStateAction<boolean>>;
  requestAction: (action: PendingAction) => void;
  resolvePendingAction: (mode: "save" | "discard") => Promise<void>;
  handleSave: () => Promise<ImportExportSaveResult | null>;
  handleSubmit: () => Promise<void>;
  handleSettingsImport: () => Promise<void>;
  handleExport: () => Promise<void>;
};

type SaveCurrentDocument = (successMessage?: string | null, forceVerified?: boolean) => Promise<DocumentRecord | null> | null;
type SaveSettings = (
  successMessage?: string | null,
) => Promise<{ project: ProjectRecord; labels: LabelRecord[] } | null> | null;
type SubmitCurrentDocument = () => Promise<unknown> | void;

export function useImportExport({
  token,
  projectId,
  view,
  bundle,
  dirty,
  isBusy,
  saveCurrentDocument,
  saveSettings,
  submitCurrentDocument,
  discardCurrent,
  discardSettings,
  executeAction,
  fetchDocumentPage,
  showToast,
  loadBundle,
}: {
  token: string;
  projectId: string;
  view: "workspace" | "settings";
  bundle: ProjectBundle | null;
  dirty: boolean;
  isBusy: boolean;
  saveCurrentDocument: SaveCurrentDocument;
  saveSettings: SaveSettings;
  submitCurrentDocument: SubmitCurrentDocument;
  discardCurrent: () => void;
  discardSettings: () => void;
  executeAction: (action: PendingAction) => void;
  fetchDocumentPage: (reset: boolean, selectedIdOverride?: string | null) => Promise<DocumentListItem[]>;
  showToast: ToastHandler;
  loadBundle: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [settingsImportFile, setSettingsImportFile] = useState<File | null>(null);
  const [settingsImportFeedback, setSettingsImportFeedback] = useState<{
    severity: "success" | "info" | "warning" | "error";
    message: string;
  } | null>(null);
  const [settingsImporting, setSettingsImporting] = useState(false);
  const [exportPending, setExportPending] = useState(true);
  const [exportVerified, setExportVerified] = useState(true);

  function requestAction(action: PendingAction) {
    if (dirty) {
      setPendingAction(action);
      return;
    }
    executeAction(action);
  }

  async function handleSave(): Promise<ImportExportSaveResult | null> {
    if (isBusy) {
      return null;
    }

    setSaving(true);
    try {
      if (view === "settings") {
        const savedSettings = await saveSettings();
        if (!savedSettings) {
          return null;
        }
        return { kind: "settings", ...savedSettings };
      }

      const savedDocument = await saveCurrentDocument();
      if (!savedDocument) {
        return null;
      }
      await fetchDocumentPage(true, savedDocument.id);
      return { kind: "document", document: savedDocument };
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存に失敗した", "error");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (view !== "workspace" || isBusy) {
      return;
    }
    setSaving(true);
    try {
      await submitCurrentDocument();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "submit に失敗した", "error");
    } finally {
      setSaving(false);
    }
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
      executeAction(action);
      return;
    }

    if (view === "workspace") {
      discardCurrent();
    } else {
      discardSettings();
    }
    setPendingAction(null);
    executeAction(action);
  }

  async function handleSettingsImport() {
    if (!settingsImportFile || !bundle || settingsImporting) {
      return;
    }

    setSettingsImporting(true);
    setSettingsImportFeedback(null);
    try {
      const payload = await readJsonFile(settingsImportFile);
      const basicValidation = validateImportPayload(payload);
      if (basicValidation.issues.length > 0) {
        const message = buildImportValidationMessage(basicValidation.issues);
        setSettingsImportFeedback({ severity: "error", message });
        showToast("Import 前チェックで問題を検出した", "error");
        return;
      }

      const [{ labels: persistedLabels }, firstPageResponse] = await Promise.all([
        api.listLabels(token, bundle.project.id),
        api.listDocuments(token, bundle.project.id, {
          offset: 0,
          limit: DOCUMENT_PAGE_SIZE,
          sort: "created",
          search: "",
        }),
      ]);
      const existingDocumentNames = await collectDocumentNames(
        firstPageResponse.total,
        DOCUMENT_PAGE_SIZE,
        (offset, limit) => {
          if (offset === 0) {
            return Promise.resolve(firstPageResponse);
          }
          return api.listDocuments(token, bundle.project.id, {
            offset,
            limit,
            sort: "created",
            search: "",
          });
        },
      );
      const validation = validateImportPayload(payload, {
        existingLabelNames: persistedLabels.map((label) => label.name),
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

  return {
    saving,
    pendingAction,
    setPendingAction,
    settingsImportFile,
    setSettingsImportFile,
    settingsImportFeedback,
    settingsImporting,
    exportPending,
    setExportPending,
    exportVerified,
    setExportVerified,
    requestAction,
    resolvePendingAction,
    handleSave,
    handleSubmit,
    handleSettingsImport,
    handleExport,
  };
}
