import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useImportExport } from "../features/project-shell/useImportExport";
import { api } from "../api";
import * as utils from "../utils";
import type { DocumentListItem, DocumentRecord, ProjectBundle, LabelRecord, ProjectRecord } from "../types";

type UseImportExportResult = ReturnType<typeof useImportExport>;

function createProject(): ProjectRecord {
  return {
    id: "project-1",
    name: "Medical NER",
    description: "",
    meta: {},
  };
}

function createBundle(project = createProject()): ProjectBundle {
  return {
    project,
    labels: [
      {
        id: "label-1",
        project_id: "project-1",
        project_name: project.name,
        name: "主訴",
        color: "#ff0000",
        description: "",
        shortcut: null,
        meta: {},
      },
    ],
    documents: [],
  };
}

function createDocumentRecord(): DocumentRecord {
  return {
    id: "doc-1",
    project_id: "project-1",
    project_name: "Medical NER",
    document_name: "Doc 1",
    text: "text",
    status: "pending",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    annotations: [],
    meta: {},
  };
}

function createImportPayload() {
  return {
    project: { name: "Imported Project" },
    labels: [{ name: "Imported", color: "#00aa00", description: "imported", shortcut: null, meta: {} }],
    documents: [
      {
        document_name: "Imported Doc",
        text: "text",
        status: "pending",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        annotations: [],
      },
    ],
  } as const;
}

function renderImportExportHook({
  view = "workspace",
  dirty = false,
  isBusy = false,
  saveCurrentDocument = vi.fn().mockResolvedValue(createDocumentRecord()),
  saveSettings = vi.fn().mockResolvedValue({ project: createProject(), labels: [] as LabelRecord[] }),
  submitCurrentDocument = vi.fn(),
  fetchDocumentPage = vi.fn().mockResolvedValue([] as DocumentListItem[]),
  bundle = createBundle(),
  discardCurrent = vi.fn(),
  discardSettings = vi.fn(),
  executeAction = vi.fn(),
  loadBundle = vi.fn().mockResolvedValue(undefined),
  showToast = vi.fn(),
}: {
  view?: "workspace" | "settings";
  dirty?: boolean;
  isBusy?: boolean;
  saveCurrentDocument?: () => Promise<DocumentRecord | null> | null;
  saveSettings?: () => Promise<{ project: ProjectRecord; labels: LabelRecord[] } | null> | null;
  submitCurrentDocument?: () => Promise<unknown> | void;
  fetchDocumentPage?: (reset: boolean, selectedIdOverride?: string | null) => Promise<DocumentListItem[]>;
  bundle?: ProjectBundle;
  discardCurrent?: () => void;
  discardSettings?: () => void;
  executeAction?: (action: { type: "doc"; docId: string } | { type: "settings" } | { type: "workspace" } | { type: "projects" }) => void;
  loadBundle?: () => Promise<void>;
  showToast?: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
}) {
  const stateRef: { current: UseImportExportResult | null } = { current: null };

  function Harness() {
    const state = useImportExport({
      token: "token",
      projectId: "project-1",
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
    });
    stateRef.current = state;
    return null;
  }

  render(<Harness />);

  return { stateRef, executeAction, discardCurrent, discardSettings, saveCurrentDocument, fetchDocumentPage, loadBundle };
}

describe("useImportExport", () => {
  it("executes action immediately when not dirty", async () => {
    const executeAction = vi.fn();
    const { stateRef } = renderImportExportHook({ dirty: false, executeAction });

    await waitFor(() => expect(stateRef.current).not.toBeNull());
    act(() => {
      stateRef.current?.requestAction({ type: "doc", docId: "doc-2" });
    });

    expect(executeAction).toHaveBeenCalledWith({ type: "doc", docId: "doc-2" });
    expect(stateRef.current?.pendingAction).toBeNull();
  });

  it("stores pending action while dirty and resolves via discard", async () => {
    const executeAction = vi.fn();
    const discardCurrent = vi.fn();
    const { stateRef } = renderImportExportHook({ dirty: true, executeAction, discardCurrent });

    await waitFor(() => expect(stateRef.current).not.toBeNull());
    act(() => {
      stateRef.current?.requestAction({ type: "doc", docId: "doc-2" });
    });

    expect(stateRef.current?.pendingAction).toEqual({ type: "doc", docId: "doc-2" });

    act(() => {
      stateRef.current?.resolvePendingAction("discard");
    });

    expect(discardCurrent).toHaveBeenCalledTimes(1);
    expect(executeAction).toHaveBeenCalledWith({ type: "doc", docId: "doc-2" });
    expect(stateRef.current?.pendingAction).toBeNull();
  });

  it("stores pending action while dirty and resolves via save", async () => {
    const executeAction = vi.fn();
    const fetchDocumentPage = vi.fn().mockResolvedValue([]);
    const saveCurrentDocument = vi.fn().mockResolvedValue(createDocumentRecord());
    const { stateRef } = renderImportExportHook({
      dirty: true,
      executeAction,
      saveCurrentDocument,
      fetchDocumentPage,
    });

    await waitFor(() => expect(stateRef.current).not.toBeNull());
    act(() => {
      stateRef.current?.requestAction({ type: "doc", docId: "doc-1" });
    });
    await act(async () => {
      await stateRef.current?.resolvePendingAction("save");
    });

    expect(saveCurrentDocument).toHaveBeenCalledTimes(1);
    expect(fetchDocumentPage).toHaveBeenCalledWith(true, "doc-1");
    expect(executeAction).toHaveBeenCalledWith({ type: "doc", docId: "doc-1" });
  });

  it("imports valid settings payload and updates feedback", async () => {
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [] });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [],
      total: 0,
      pending_total: 0,
      offset: 0,
      limit: 40,
      search: "",
      sort: "created",
    });
    const importProject = vi
      .spyOn(api, "importProject")
      .mockResolvedValue({ imported: { labels: 1, documents: 1, annotations: 0 }, errors: [] });
    const loadBundle = vi.fn().mockResolvedValue(undefined);

    const { stateRef } = renderImportExportHook({ view: "settings", loadBundle });
    const file = new File([JSON.stringify(createImportPayload())], "import.json", { type: "application/json" });

    await waitFor(() => expect(stateRef.current).not.toBeNull());
    act(() => {
      stateRef.current?.setSettingsImportFile(file);
    });

    await act(async () => {
      await stateRef.current?.handleSettingsImport();
    });

    expect(importProject).toHaveBeenCalledTimes(1);
    expect(loadBundle).toHaveBeenCalledTimes(1);
    expect(stateRef.current?.settingsImportFeedback?.severity).toBe("success");
  });

  it("blocks import on validation failure", async () => {
    const importProject = vi.spyOn(api, "importProject");
    const { stateRef } = renderImportExportHook({ view: "settings" });
    const file = new File([JSON.stringify({})], "invalid.json", { type: "application/json" });

    await waitFor(() => expect(stateRef.current).not.toBeNull());
    act(() => {
      stateRef.current?.setSettingsImportFile(file);
    });
    await act(async () => {
      await stateRef.current?.handleSettingsImport();
    });

    expect(importProject).not.toHaveBeenCalled();
    expect(stateRef.current?.settingsImportFeedback?.severity).toBe("error");
  });

  it("exports bundle with current options", async () => {
    vi.spyOn(api, "exportProject").mockResolvedValue({
      project: createProject(),
      labels: [],
      documents: [],
      meta: {},
    });
    const downloadSpy = vi.spyOn(utils, "downloadJson").mockImplementation(() => {});
    const { stateRef } = renderImportExportHook({});

    await waitFor(() => expect(stateRef.current).not.toBeNull());
    await act(async () => {
      await stateRef.current?.handleExport();
    });

    expect(api.exportProject).toHaveBeenCalledWith("token", "project-1", true, true);
    expect(downloadSpy).toHaveBeenCalledTimes(1);
  });
});
