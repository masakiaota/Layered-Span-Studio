import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectShellHeader } from "../features/project-shell/ProjectShellHeader";
import type { ProjectBundle, UserRecord } from "../types";

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

    const toolbar = screen.getByRole("button", { name: "Projects" }).closest(".MuiToolbar-root");
    const title = screen.getByText(longProjectName);
    const description = screen.getByText(`${longProjectDescription} / ${user.username}`);
    const metadataStack = title.parentElement;

    expect(toolbar).toBeInTheDocument();
    expect(toolbar).toHaveStyle({ minWidth: "0", overflow: "hidden" });
    expect(metadataStack).toBeInTheDocument();
    expect(metadataStack).toHaveStyle({ minWidth: "0", overflow: "hidden", flex: "1 1 0" });
    expect(title).toHaveStyle({
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    expect(description).toHaveStyle({
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    expect(screen.getByRole("tab", { name: "Workspace" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Project Settings" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ショートカット一覧" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Logout" })).toBeVisible();
  });
});
