import { useState } from "react";
import { api } from "../../api";
import {
  buildImportValidationMessage,
  describeImportSummary,
  validateImportPayload,
} from "../../importValidation";
import type { ProjectBundle } from "../../types";
import {
  buildExportFilename,
  downloadJson,
  readJsonFile,
} from "../../utils";
import { DOCUMENT_PAGE_SIZE } from "./projectShellConstants";
import { collectDocumentNames } from "./projectShellUtils";

type ShowToast = (message: string, severity: "success" | "info" | "warning" | "error") => void;

export function useImportExport({
  bundle,
  token,
  loadBundle,
  showToast,
}: {
  bundle: ProjectBundle | null;
  token: string;
  loadBundle: () => Promise<void>;
  showToast: ShowToast;
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
      showToast(
        error instanceof Error ? error.message : "Import に失敗した",
        "error",
      );
    } finally {
      setSettingsImporting(false);
    }
  }

  async function handleExport() {
    if (!bundle) {
      return;
    }
    try {
      const payload = await api.exportProject(
        token,
        bundle.project.id,
        exportPending,
        exportVerified,
      );
      downloadJson(buildExportFilename(bundle.project), payload);
      showToast("Export を開始した", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Export に失敗した",
        "error",
      );
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
