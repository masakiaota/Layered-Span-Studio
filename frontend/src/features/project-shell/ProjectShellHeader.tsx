import { AppBar, Box, Button, IconButton, Stack, Tab, Tabs, Toolbar, Tooltip, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import WorkspacesRoundedIcon from "@mui/icons-material/WorkspacesRounded";
import type { ProjectBundle, UserRecord } from "../../types";

export function ProjectShellHeader({
  bundle,
  user,
  view,
  shortcutButtonRef,
  onBackToProjects,
  onChangeView,
  onOpenShortcuts,
  onLogout,
}: {
  bundle: ProjectBundle;
  user: UserRecord;
  view: "workspace" | "settings";
  shortcutButtonRef: React.Ref<HTMLButtonElement>;
  onBackToProjects: () => void;
  onChangeView: (view: "workspace" | "settings") => void;
  onOpenShortcuts: () => void;
  onLogout: () => void;
}) {
  return (
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: "blur(10px)", borderBottom: "1px solid #d7e2f0" }}>
      <Toolbar sx={{ gap: 2 }}>
        <Button color="inherit" startIcon={<ArrowBackRoundedIcon />} onClick={onBackToProjects}>
          Projects
        </Button>
        <Stack sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h6" noWrap>
            {bundle.project.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {bundle.project.description || "説明なし"} / {user.username}
          </Typography>
        </Stack>
        <Tabs value={view} onChange={(_event, nextView) => onChangeView(nextView)} sx={{ minHeight: 0 }}>
          <Tab value="workspace" label="Workspace" icon={<WorkspacesRoundedIcon />} iconPosition="start" />
          <Tab value="settings" label="Project Settings" icon={<SettingsRoundedIcon />} iconPosition="start" />
        </Tabs>
        <Tooltip title="ショートカット一覧">
          <IconButton ref={shortcutButtonRef} onClick={onOpenShortcuts}>
            <HelpOutlineRoundedIcon />
          </IconButton>
        </Tooltip>
        <Button onClick={onLogout} color="inherit" startIcon={<LogoutRoundedIcon />}>
          Logout
        </Button>
      </Toolbar>
    </AppBar>
  );
}
