import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { DOCUMENT_PAGE_SIZE } from "../features/project-shell/projectShellConstants";
import { useImportExport } from "../features/project-shell/useImportExport";
import type { ProjectBundle } from "../types";
import * as utils from "../utils";

const bundle: ProjectBundle = {
  project: {
    id: "project-1",
    name: "Test Project",
    description: "",
    meta: {},
  },
  labels: [],
  documents: [],
};

function makeShowToast() {
  return vi.fn();
}

const validImportPayload = {
  project: {
    name: "Imported Project",
  },
  labels: [
    {
      name: "Imported Label",
      color: "#123456",
      description: "",
    },
  ],
  documents: [
    {
      document_name: "Imported Doc",
      text: "Hello import",
      status: "pending",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      annotations: [],
    },
  ],
};

describe("useImportExport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with default state", () => {
    const { result } = renderHook(() =>
      useImportExport({
        bundle,
        loadBundle: vi.fn(),
        showToast: makeShowToast(),
      }),
    );

    expect(result.current.settingsImportFile).toBeNull();
    expect(result.current.settingsImportFeedback).toBeNull();
    expect(result.current.settingsImporting).toBe(false);
    expect(result.current.exportPending).toBe(true);
    expect(result.current.exportVerified).toBe(true);
  });

  it("setSettingsImportFile updates the file state", () => {
    const { result } = renderHook(() =>
      useImportExport({
        bundle,
        loadBundle: vi.fn(),
        showToast: makeShowToast(),
      }),
    );

    const mockFile = new File(["{}"], "test.json", { type: "application/json" });

    act(() => {
      result.current.setSettingsImportFile(mockFile);
    });

    expect(result.current.settingsImportFile).toBe(mockFile);
  });

  it("handleExport calls api and shows success toast", async () => {
    const exportPayload = {
      project: bundle.project,
      labels: [],
      documents: [],
      meta: {},
    };
    vi.spyOn(api, "exportProject").mockResolvedValue(exportPayload);
    vi.spyOn(utils, "downloadJson").mockImplementation(() => {});

    const showToast = makeShowToast();
    const { result } = renderHook(() =>
      useImportExport({
        bundle,
        loadBundle: vi.fn(),
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleExport();
    });

    expect(api.exportProject).toHaveBeenCalledWith("project-1", true, true);
    expect(utils.downloadJson).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Export を開始した", "success");
  });

  it("handleExport shows error toast on failure", async () => {
    vi.spyOn(api, "exportProject").mockRejectedValue(new Error("Export failed"));

    const showToast = makeShowToast();
    const { result } = renderHook(() =>
      useImportExport({
        bundle,
        loadBundle: vi.fn(),
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleExport();
    });

    expect(showToast).toHaveBeenCalledWith("Export failed", "error");
  });

  it("handleExport does nothing when bundle is null", async () => {
    vi.spyOn(api, "exportProject").mockResolvedValue({
      project: bundle.project,
      labels: [],
      documents: [],
      meta: {},
    });

    const showToast = makeShowToast();
    const { result } = renderHook(() =>
      useImportExport({
        bundle: null,
        loadBundle: vi.fn(),
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleExport();
    });

    expect(api.exportProject).not.toHaveBeenCalled();
  });

  it("setExportPending and setExportVerified update filter state", () => {
    const { result } = renderHook(() =>
      useImportExport({
        bundle,
        loadBundle: vi.fn(),
        showToast: makeShowToast(),
      }),
    );

    act(() => {
      result.current.setExportPending(false);
      result.current.setExportVerified(false);
    });

    expect(result.current.exportPending).toBe(false);
    expect(result.current.exportVerified).toBe(false);
  });

  it("handleSettingsImport does nothing when no file is set", async () => {
    vi.spyOn(api, "importProject").mockResolvedValue({ imported: {}, errors: [] });
    const showToast = makeShowToast();

    const { result } = renderHook(() =>
      useImportExport({
        bundle,
        loadBundle: vi.fn(),
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleSettingsImport();
    });

    expect(api.importProject).not.toHaveBeenCalled();
  });

  it("handleSettingsImport surfaces validation failures after checking existing resources", async () => {
    const importFile = new File(
      [JSON.stringify(validImportPayload)],
      "import.json",
      { type: "application/json" },
    );
    const conflictingPayload = {
      ...validImportPayload,
      labels: [
        {
          name: "Entity",
          color: "#123456",
          description: "",
        },
      ],
    };
    vi.spyOn(utils, "readJsonFile").mockResolvedValue(conflictingPayload);
    vi.spyOn(api, "listLabels").mockResolvedValue({
      labels: [
        {
          id: "label-1",
          project_id: "project-1",
          project_name: "Test Project",
          name: "Entity",
          color: "#e74c3c",
          description: "",
          shortcut: null,
          meta: {},
        },
      ],
    });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [],
      total: 0,
      pending_total: 0,
      offset: 0,
      limit: DOCUMENT_PAGE_SIZE,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "importProject").mockResolvedValue({ imported: {}, errors: [] });

    const showToast = makeShowToast();
    const { result } = renderHook(() =>
      useImportExport({
        bundle,
        loadBundle: vi.fn(),
        showToast,
      }),
    );

    act(() => {
      result.current.setSettingsImportFile(importFile);
    });

    await act(async () => {
      await result.current.handleSettingsImport();
    });

    expect(api.listLabels).toHaveBeenCalledWith("project-1");
    expect(api.listDocuments).toHaveBeenCalledWith("project-1", {
      offset: 0,
      limit: DOCUMENT_PAGE_SIZE,
      sort: "created",
      search: "",
    });
    expect(api.importProject).not.toHaveBeenCalled();
    expect(result.current.settingsImportFeedback).toEqual({
      severity: "error",
      message: "既存 label と重複している: Entity",
    });
    expect(result.current.settingsImporting).toBe(false);
    expect(showToast).toHaveBeenCalledWith("Import 前チェックで問題を検出した", "error");
  });

  it("handleSettingsImport imports successfully, resets state, and reloads the bundle", async () => {
    const importFile = new File(
      [JSON.stringify(validImportPayload)],
      "import.json",
      { type: "application/json" },
    );
    vi.spyOn(utils, "readJsonFile").mockResolvedValue(validImportPayload);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [] });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [],
      total: 0,
      pending_total: 0,
      offset: 0,
      limit: DOCUMENT_PAGE_SIZE,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "importProject").mockResolvedValue({ imported: {}, errors: [] });

    const loadBundle = vi.fn().mockResolvedValue(undefined);
    const showToast = makeShowToast();
    const { result } = renderHook(() =>
      useImportExport({
        bundle,
        loadBundle,
        showToast,
      }),
    );

    act(() => {
      result.current.setSettingsImportFile(importFile);
    });

    await act(async () => {
      await result.current.handleSettingsImport();
    });

    expect(api.importProject).toHaveBeenCalledWith("project-1", validImportPayload);
    expect(loadBundle).toHaveBeenCalledTimes(1);
    expect(result.current.settingsImportFile).toBeNull();
    expect(result.current.settingsImporting).toBe(false);
    expect(result.current.settingsImportFeedback).toEqual({
      severity: "success",
      message: "Import 完了: Label 1 件 / Document 1 件 / Annotation 0 件",
    });
    expect(showToast).toHaveBeenCalledWith("現在の project に import した", "success");
  });

  it("handleSettingsImport reports API errors and keeps the selected file", async () => {
    const importFile = new File(
      [JSON.stringify(validImportPayload)],
      "import.json",
      { type: "application/json" },
    );
    vi.spyOn(utils, "readJsonFile").mockResolvedValue(validImportPayload);
    vi.spyOn(api, "listLabels").mockResolvedValue({ labels: [] });
    vi.spyOn(api, "listDocuments").mockResolvedValue({
      documents: [],
      total: 0,
      pending_total: 0,
      offset: 0,
      limit: DOCUMENT_PAGE_SIZE,
      search: "",
      sort: "created",
    });
    vi.spyOn(api, "importProject").mockRejectedValue(new Error("Import failed"));

    const loadBundle = vi.fn().mockResolvedValue(undefined);
    const showToast = makeShowToast();
    const { result } = renderHook(() =>
      useImportExport({
        bundle,
        loadBundle,
        showToast,
      }),
    );

    act(() => {
      result.current.setSettingsImportFile(importFile);
    });

    await act(async () => {
      await result.current.handleSettingsImport();
    });

    expect(loadBundle).not.toHaveBeenCalled();
    expect(result.current.settingsImportFile).toBe(importFile);
    expect(result.current.settingsImporting).toBe(false);
    expect(result.current.settingsImportFeedback).toEqual({
      severity: "error",
      message: "Import failed",
    });
    expect(showToast).toHaveBeenCalledWith("Import failed", "error");
  });
});
