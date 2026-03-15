import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
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
        token: "test-token",
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
        token: "test-token",
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
        token: "test-token",
        loadBundle: vi.fn(),
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleExport();
    });

    expect(api.exportProject).toHaveBeenCalledWith("test-token", "project-1", true, true);
    expect(utils.downloadJson).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Export を開始した", "success");
  });

  it("handleExport shows error toast on failure", async () => {
    vi.spyOn(api, "exportProject").mockRejectedValue(new Error("Export failed"));

    const showToast = makeShowToast();
    const { result } = renderHook(() =>
      useImportExport({
        bundle,
        token: "test-token",
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
        token: "test-token",
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
        token: "test-token",
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
        token: "test-token",
        loadBundle: vi.fn(),
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleSettingsImport();
    });

    expect(api.importProject).not.toHaveBeenCalled();
  });
});
