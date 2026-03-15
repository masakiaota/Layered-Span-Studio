import { useState } from "react";
import { api } from "../api";
import { DOCUMENT_PAGE_SIZE } from "../features/project-shell/projectShellConstants";
import { buildImportValidationMessage, describeImportSummary, validateImportPayload } from "../importValidation";
import { collectDocumentNames } from "../features/project-shell/projectShellUtils";
import { buildExportFilename, downloadJson, readJsonFile } from "../utils";
import type { ProjectRecord } from "../types";

type ToastSeverity = "success" | "info" | "warning" | "error";

export function useImportExport({
  token,
  projectId,
  project,
  showToast,
  onImported,
}: {
  token: string;
  projectId: string | null;
  project: ProjectRecord | null;
  showToast: (message: string, severity: ToastSeverity) => void;
  onImported: () => Promise<void> | void;
}) {
  const [settingsImportFile, setSettingsImportFile] = useState<File | null>(null);
  const [settingsImportFeedback, setSettingsImportFeedback] = useState<{
    severity: "success" | "info" | "warning" | "error";
    message: string;
  } | null>(null);
  const [settingsImporting, setSettingsImporting] = useState(false);
  const [exportPending, setExportPending] = useState(true);
  const [exportVerified, setExportVerified] = useState(true);

  async function handleSettingsImport() {
    if (!settingsImportFile || !projectId || settingsImporting) {
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

      const [{ labels: persistedLabels }, firstPageResponse] = await Promise.all([
        api.listLabels(token, projectId),
        api.listDocuments(token, projectId, {
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
          return api.listDocuments(token, projectId, {
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

      await api.importProject(token, projectId, payload);
      setSettingsImportFeedback({
        severity: "success",
        message: `Import 完了: ${describeImportSummary(
          validation.summary ?? { labelCount: 0, documentCount: 0, annotationCount: 0 },
        )}`,
      });
      showToast("現在の project に import した", "success");
      setSettingsImportFile(null);
      await onImported();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import に失敗した";
      setSettingsImportFeedback({
        severity: "error",
        message,
      });
      showToast(message, "error");
    } finally {
      setSettingsImporting(false);
    }
  }

  async function handleExport() {
    if (!project || !project.id) {
      return;
    }
    try {
      const payload = await api.exportProject(token, project.id, exportPending, exportVerified);
      downloadJson(buildExportFilename(project), payload);
      showToast("Export を開始した", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Export に失敗した", "error");
    }
  }

  return {
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
  };
}
