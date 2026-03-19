import { AppBar, Button, IconButton, Stack, Tab, Tabs, Toolbar, Tooltip, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import WorkspacesRoundedIcon from "@mui/icons-material/WorkspacesRounded";
import type { UserRecord } from "../../api-contract";
import type { ProjectBundle } from "../../types";

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
      <Toolbar sx={{ gap: 2, minWidth: 0, overflow: "hidden" }}>
        <Button color="inherit" startIcon={<ArrowBackRoundedIcon />} onClick={onBackToProjects} sx={{ flexShrink: 0 }}>
          Projects
        </Button>
        <Stack sx={{ minWidth: 0, width: 0, maxWidth: "100%", flexGrow: 1, flexShrink: 1, flexBasis: 0, overflow: "hidden" }}>
          <Typography variant="h6" noWrap sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {bundle.project.name}
          </Typography>
          <Typography
            variant="body2"
            component="div"
            color="text.secondary"
            noWrap
            sx={{ minWidth: 0, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {bundle.project.description || "説明なし"}
          </Typography>
        </Stack>
        <Tabs value={view} onChange={(_event, nextView) => onChangeView(nextView)} sx={{ minHeight: 0, flexShrink: 0 }}>
          <Tab value="workspace" label="Workspace" icon={<WorkspacesRoundedIcon />} iconPosition="start" />
          <Tab value="settings" label="Project Settings" icon={<SettingsRoundedIcon />} iconPosition="start" />
        </Tabs>
        <Tooltip title="ショートカット一覧">
          <IconButton ref={shortcutButtonRef} onClick={onOpenShortcuts} sx={{ flexShrink: 0 }}>
            <HelpOutlineRoundedIcon />
          </IconButton>
        </Tooltip>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            flexShrink: 0,
            px: 1.25,
            py: 0.5,
            borderRadius: 999,
            border: "1px solid #d7e2f0",
            bgcolor: "rgba(22, 50, 79, 0.04)",
          }}
        >
          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 160, fontWeight: 700, lineHeight: 1 }}>
            {user.username}
          </Typography>
          <Button
            onClick={onLogout}
            color="inherit"
            startIcon={<LogoutRoundedIcon />}
            sx={{ flexShrink: 0, minWidth: "auto", px: 1, py: 0.5, borderRadius: 999, lineHeight: 1 }}
          >
            Logout
          </Button>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
