import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ProjectShellHeader } from "../features/project-shell/ProjectShellHeader";
import {
  I18nProvider,
  resolveInitialLocale,
  translateMessage,
} from "../i18n/I18nProvider";
import { enMessages } from "../i18n/messages/en";
import { jaMessages } from "../i18n/messages/ja";
import { LoginPage } from "../pages/LoginPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import type { UserRecord } from "../api-contract";
import type { ProjectBundle } from "../types";

const user: UserRecord = {
  id: "user-1",
  username: "demo_login_user",
  meta: {},
};

const bundle: ProjectBundle = {
  project: {
    id: "project-1",
    name: "Medical NER",
    description: "",
    meta: {},
    created_at: "2026-03-01T00:00:00Z",
  },
  labels: [],
  documents: [],
};

function renderWithI18n(ui: ReactElement, locale: "ja" | "en" = "ja") {
  return render(<I18nProvider initialLocale={locale}>{ui}</I18nProvider>);
}

function renderProjectsPage(locale: "ja" | "en") {
  return renderWithI18n(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage user={user} onLogout={vi.fn()} />} />
        <Route path="/projects/:projectId" element={<div>Project Workspace Route</div>} />
        <Route path="/projects/:projectId/settings" element={<div>Project Settings Route</div>} />
      </Routes>
    </MemoryRouter>,
    locale,
  );
}

describe("i18n locale layer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("detects the initial locale from browser language and persisted selection", () => {
    expect(resolveInitialLocale(null, "ja-JP")).toBe("ja");
    expect(resolveInitialLocale(null, "en-US")).toBe("en");
    expect(resolveInitialLocale("ja", "en-US")).toBe("ja");
    expect(resolveInitialLocale("en", "ja-JP")).toBe("en");
  });

  it("falls back to ja when an en key is missing", () => {
    const partialEn = structuredClone(enMessages) as typeof jaMessages;
    delete (partialEn.projectShell.header as { logout?: string }).logout;

    expect(
      translateMessage("en", "projectShell.header.logout", undefined, {
        ja: jaMessages,
        en: partialEn,
      }),
    ).toBe(jaMessages.projectShell.header.logout);
  });

  it("keeps raw error strings unchanged in en", () => {
    renderWithI18n(<LoginPage loading={false} error="ログインに失敗した" onLogin={vi.fn()} />, "en");
    expect(screen.getByText("ログインに失敗した")).toBeInTheDocument();
  });

  it("switches LoginPage copy between ja and en", async () => {
    const userEventSetup = userEvent.setup();
    renderWithI18n(<LoginPage loading={false} error="" onLogin={vi.fn()} />, "en");

    expect(screen.getByText("A tool for annotating text and reviewing it while organizing labels. Sign in here to continue to the project list.")).toBeInTheDocument();
    await userEventSetup.click(screen.getByRole("button", { name: "Language switcher" }));
    await userEventSetup.click(screen.getByRole("menuitem", { name: "日本語" }));
    expect(screen.getByText("テキストに注釈を付け、ラベルごとに整理しながら確認するためのツールである。ここではアカウントでサインインして、Project 一覧へ進む。")).toBeInTheDocument();
  });

  it("switches ProjectsPage copy between ja and en", async () => {
    const userEventSetup = userEvent.setup();
    vi.spyOn(api, "listProjects").mockResolvedValue({ projects: [] });

    renderProjectsPage("en");

    await screen.findByText("No project yet");
    await userEventSetup.click(screen.getByRole("button", { name: "Language switcher" }));
    await userEventSetup.click(screen.getByRole("menuitem", { name: "日本語" }));
    expect(await screen.findByText("Project がまだない")).toBeInTheDocument();
  });

  it("switches ProjectShellHeader copy between ja and en", async () => {
    const userEventSetup = userEvent.setup();
    renderWithI18n(
      <ProjectShellHeader
        bundle={bundle}
        user={user}
        view="settings"
        shortcutButtonRef={{ current: null }}
        onBackToProjects={vi.fn()}
        onChangeView={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onLogout={vi.fn()}
      />,
      "en",
    );

    expect(screen.getByText("No description")).toBeInTheDocument();
    await userEventSetup.click(screen.getByRole("button", { name: "Language switcher" }));
    await userEventSetup.click(screen.getByRole("menuitem", { name: "日本語" }));
    expect(screen.getByText("説明なし")).toBeInTheDocument();
  });
});
