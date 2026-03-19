import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectShellHeader } from "../features/project-shell/ProjectShellHeader";
import type { UserRecord } from "../api-contract";
import type { ProjectBundle } from "../types";

const longProjectName =
  "スクリーンショット撮影向けの長文医療記録ダミー。重なりのある複数ラベルを確認しやすくするためにあえて極端に長くした project 名";
const longProjectDescription =
  "スクリーンショット撮影向けの長文医療記録ダミー。重なりのある複数ラベルを確認しやすくするためにあえて極端に長くした説明文で、header の横幅制御を崩さないことを確認する";

const bundle: ProjectBundle = {
  project: {
    id: "project-1",
    name: longProjectName,
    description: longProjectDescription,
    meta: {},
    created_at: "2026-03-01T00:00:00Z",
  },
  labels: [],
  documents: [],
};

const user: UserRecord = {
  id: "user-1",
  username: "demo_login_user",
  meta: {},
};

describe("ProjectShellHeader", () => {
  it("keeps the project metadata area shrinkable and truncates long text inside the header", () => {
    render(
      <ProjectShellHeader
        bundle={bundle}
        user={user}
        view="settings"
        shortcutButtonRef={createRef<HTMLButtonElement>()}
        onBackToProjects={vi.fn()}
        onChangeView={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    const projectsButton = screen.getByRole("button", { name: "Projects" });
    const toolbar = projectsButton.parentElement;
    const title = screen.getByText(longProjectName);
    const description = screen.getByText(longProjectDescription);
    const metadataStack = title.parentElement;

    if (!(toolbar instanceof HTMLElement)) {
      throw new Error("Toolbar element not found");
    }
    if (!(metadataStack instanceof HTMLElement)) {
      throw new Error("Metadata stack element not found");
    }

    expect(toolbar).toHaveStyle({ minWidth: "0px", overflow: "hidden" });
    expect(metadataStack).toHaveStyle({
      minWidth: "0px",
      width: "0px",
      maxWidth: "100%",
      overflow: "hidden",
      flexGrow: "1",
      flexShrink: "1",
      flexBasis: "0px",
    });
    expect(title).toHaveStyle({
      minWidth: "0px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    expect(description).toHaveStyle({
      minWidth: "0px",
      display: "block",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    expect(screen.queryByText(`${longProjectDescription} / ${user.username}`)).not.toBeInTheDocument();
    expect(screen.getByText(user.username)).toBeVisible();
    expect(screen.getByRole("tab", { name: "Workspace" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Project Settings" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ショートカット一覧" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Logout" })).toBeVisible();
  });
});
