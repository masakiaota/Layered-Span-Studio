import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
  alpha,
  type ButtonProps,
} from "@mui/material";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import LabelRoundedIcon from "@mui/icons-material/LabelRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import WorkspacesRoundedIcon from "@mui/icons-material/WorkspacesRounded";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { CreateProjectDialog } from "../features/projects/CreateProjectDialog";
import { useToast } from "../hooks/useToast";
import {
  buildImportValidationMessage,
  describeImportSummary,
  validateImportPayload,
} from "../importValidation";
import type { ProjectListItemRecord, UserRecord } from "../api-contract";
import { normalizeSearchText, readJsonFile } from "../utils";

type ProjectSortKey = "created" | "name" | "documents" | "pendingDocuments";
type ProjectSortDirection = "asc" | "desc";

const PROJECT_SORT_OPTIONS: Array<{ value: ProjectSortKey; label: string }> = [
  { value: "created", label: "作成順" },
  { value: "name", label: "名前順" },
  { value: "documents", label: "ドキュメント数順" },
  { value: "pendingDocuments", label: "未確定ドキュメント数順" },
];

function compareText(left: string, right: string) {
  return left.localeCompare(right, "ja");
}

function parseSortableTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function compareNullableTimestamp(
  left: string | null | undefined,
  right: string | null | undefined,
  sortDirection: ProjectSortDirection,
) {
  const leftTimestamp = parseSortableTimestamp(left);
  const rightTimestamp = parseSortableTimestamp(right);
  if (leftTimestamp === null && rightTimestamp === null) {
    return 0;
  }
  if (leftTimestamp === null) {
    return 1;
  }
  if (rightTimestamp === null) {
    return -1;
  }
  const comparison = leftTimestamp - rightTimestamp;
  return sortDirection === "asc" ? comparison : -comparison;
}

function compareProjects(
  left: ProjectListItemRecord,
  right: ProjectListItemRecord,
  sortKey: ProjectSortKey,
  sortDirection: ProjectSortDirection,
) {
  let comparison = 0;
  switch (sortKey) {
    case "created":
      comparison = compareNullableTimestamp(left.created_at, right.created_at, sortDirection);
      break;
    case "name":
      comparison = compareText(left.name, right.name);
      break;
    case "documents":
      comparison = left.summary.documents_count - right.summary.documents_count;
      break;
    case "pendingDocuments":
      comparison = left.summary.pending_documents_count - right.summary.pending_documents_count;
      break;
  }
  if (comparison !== 0) {
    return sortKey === "created" ? comparison : sortDirection === "asc" ? comparison : -comparison;
  }
  const nameComparison = compareText(left.name, right.name);
  if (nameComparison !== 0) {
    return nameComparison;
  }
  return left.id.localeCompare(right.id);
}

function formatRelativeDate(value: string | null | undefined) {
  if (!value) {
    return "更新情報なし";
  }
  const date = new Date(value);
  const deltaHours = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60));
  if (deltaHours < 24) {
    return `${Math.max(deltaHours, 0)}時間前に更新`;
  }
  if (deltaHours < 24 * 7) {
    return `${Math.floor(deltaHours / 24)}日前に更新`;
  }
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function buildProjectSearchText(project: ProjectListItemRecord) {
  return normalizeSearchText(
    [
      project.name,
      project.description ?? "",
      `${project.summary.labels_count} labels`,
      `${project.summary.documents_count} docs`,
      `${project.summary.pending_documents_count} pending`,
    ].join(" "),
  );
}

export function ProjectsPage({
  user,
  onLogout,
}: {
  user: UserRecord;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const { toast, showToast, closeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectListItemRecord[]>([]);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<ProjectSortKey>("created");
  const [sortDirection, setSortDirection] = useState<ProjectSortDirection>("desc");
  const mutationBusy = importing || creating;
  const [importFeedback, setImportFeedback] = useState<{
    severity: "success" | "info" | "warning" | "error";
    message: string;
  } | null>(null);

  async function refreshProjects() {
    setLoading(true);
    try {
      const response = await api.listProjects();
      setProjects(response.projects);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Project 一覧の取得に失敗した", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshProjects();
  }, []);

  async function handleProjectImport(file: File | null, input?: HTMLInputElement | null) {
    if (!file) {
      if (input) {
        input.value = "";
      }
      return;
    }
    if (creating) {
      if (input) {
        input.value = "";
      }
      return;
    }
    setImportFeedback(null);
    setImporting(true);
    try {
      const payload = await readJsonFile(file);
      const validation = validateImportPayload(payload);
      if (validation.issues.length > 0) {
        const message = buildImportValidationMessage(validation.issues);
        setImportFeedback({ severity: "error", message });
        showToast("Import 前チェックで問題を検出した", "error");
        return;
      }
      const response = await api.importProjectAsNew(payload);
      setImportFeedback({
        severity: "success",
        message: `Import 完了: ${describeImportSummary(
          validation.summary ?? { labelCount: 0, documentCount: 0, annotationCount: 0 },
        )}`,
      });
      showToast("Project を import した", "success");
      navigate(`/projects/${response.project.id}`);
    } catch (error) {
      setImportFeedback({
        severity: "error",
        message: error instanceof Error ? error.message : "Import に失敗した",
      });
      showToast(error instanceof Error ? error.message : "Import に失敗した", "error");
    } finally {
      setImporting(false);
      if (input) {
        input.value = "";
      }
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim() || importing) {
      return;
    }
    setCreating(true);
    try {
      const created = await api.createProject({
        name: newProjectName.trim(),
        description: newProjectDescription,
        meta: {},
      });
      showToast("Project を作成した", "success");
      setCreateDialogOpen(false);
      setNewProjectName("");
      setNewProjectDescription("");
      navigate(`/projects/${created.id}/settings`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Project の作成に失敗した", "error");
    } finally {
      setCreating(false);
    }
  }

  function renderImportButton(label: string, variant: "contained" | "outlined", sx?: ButtonProps["sx"]) {
    return (
      <Button component="label" variant={variant} startIcon={<UploadFileRoundedIcon />} disabled={mutationBusy} sx={sx}>
        {label}
        <input
          hidden
          accept=".json,application/json"
          type="file"
          onChange={(event) => {
            void handleProjectImport(event.target.files?.[0] ?? null, event.currentTarget);
          }}
        />
      </Button>
    );
  }

  const visibleProjects = useMemo(() => {
    const normalized = normalizeSearchText(searchQuery);
    const filtered = !searchQuery.trim()
      ? projects
      : projects.filter((project) => buildProjectSearchText(project).includes(normalized));
    return [...filtered].sort((left, right) => compareProjects(left, right, sortKey, sortDirection));
  }, [projects, searchQuery, sortDirection, sortKey]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f6f8fc" }}>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ backdropFilter: "blur(10px)", borderBottom: "1px solid #d7e2f0", bgcolor: alpha("#f6f8fc", 0.88) }}
      >
        <Toolbar sx={{ gap: 2, minHeight: 76 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexGrow: 1, minWidth: 0 }}>
            <Avatar sx={{ bgcolor: "primary.main", width: 44, height: 44 }}>
              <WorkspacesRoundedIcon />
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" noWrap>
                Layered Span Studio
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                Signed in as {user.username}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1.25}>
            <Button
              variant="outlined"
              startIcon={<WorkspacesRoundedIcon />}
              onClick={() => setCreateDialogOpen(true)}
              disabled={mutationBusy}
            >
              New Project
            </Button>
            {renderImportButton("Import Project", "contained")}
          </Stack>
          <Button color="inherit" startIcon={<LogoutRoundedIcon />} onClick={onLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={3}>
          {importFeedback ? <Alert severity={importFeedback.severity}>{importFeedback.message}</Alert> : null}
          <Box sx={{ pt: { xs: 0.5, md: 1.5 } }}>
            <Box
              sx={{
                width: "100%",
                display: "grid",
                gap: 1.5,
                alignItems: "center",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "minmax(0, 1fr) 220px 180px",
                },
              }}
            >
              <TextField
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Project 名や説明で検索"
                size="small"
                sx={{
                  width: "100%",
                  "& .MuiInputBase-root": {
                    height: 58,
                    borderRadius: 4,
                    fontSize: 18,
                    bgcolor: "#fff",
                    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon />
                    </InputAdornment>
                  ),
                }}
              />
              <FormControl size="small" sx={{ minWidth: 0 }}>
                <InputLabel id="project-sort-label">並び順</InputLabel>
                <Select
                  labelId="project-sort-label"
                  value={sortKey}
                  label="並び順"
                  onChange={(event) => setSortKey(event.target.value as ProjectSortKey)}
                  sx={{
                    height: 58,
                    borderRadius: 4,
                    bgcolor: "#fff",
                    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                  }}
                >
                  {PROJECT_SORT_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <ToggleButtonGroup
                exclusive
                value={sortDirection}
                onChange={(_event, value: ProjectSortDirection | null) => {
                  if (value) {
                    setSortDirection(value);
                  }
                }}
                aria-label="並び方向"
                size="small"
                sx={{
                  height: 58,
                  bgcolor: "#fff",
                  borderRadius: 4,
                  overflow: "hidden",
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                  "& .MuiToggleButton-root": {
                    flex: 1,
                    border: "none",
                    px: 2,
                  },
                  "& .MuiToggleButtonGroup-grouped:first-of-type": {
                    borderTopLeftRadius: 16,
                    borderBottomLeftRadius: 16,
                  },
                  "& .MuiToggleButtonGroup-grouped:last-of-type": {
                    borderTopRightRadius: 16,
                    borderBottomRightRadius: 16,
                  },
                }}
              >
                <ToggleButton value="desc" aria-label="降順">
                  降順
                </ToggleButton>
                <ToggleButton value="asc" aria-label="昇順">
                  昇順
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>

          {loading ? (
            <Paper sx={{ p: 8, textAlign: "center", borderRadius: 4 }}>
              <CircularProgress />
            </Paper>
          ) : projects.length === 0 ? (
            <Paper
              sx={{
                p: 8,
                textAlign: "center",
                borderRadius: 4,
                border: "1px dashed #c6d5ea",
                bgcolor: "#fff",
              }}
            >
              <Avatar sx={{ mx: "auto", mb: 2, width: 56, height: 56, bgcolor: alpha("#1a73e8", 0.12), color: "primary.main" }}>
                <UploadFileRoundedIcon />
              </Avatar>
              <Typography variant="h5">Project がまだない</Typography>
              <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 520, mx: "auto" }}>
                空の project を作成するか、export JSON を import して注釈対象の project を追加する。
              </Typography>
              <Alert severity="info" sx={{ mt: 3, textAlign: "left" }}>
                top-level に `project` / `labels` / `documents` を持つ export JSON を受け付ける。
              </Alert>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="center" sx={{ mt: 3 }}>
                <Button
                  variant="outlined"
                  startIcon={<WorkspacesRoundedIcon />}
                  onClick={() => setCreateDialogOpen(true)}
                  disabled={mutationBusy}
                >
                  New Project
                </Button>
                {renderImportButton("Import Project", "contained")}
              </Stack>
            </Paper>
          ) : visibleProjects.length === 0 ? (
            <Paper sx={{ p: 6, borderRadius: 4, textAlign: "center" }}>
              <Typography variant="h6">一致する project がない</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                検索語を見直すか、Import して新しい project を追加する。
              </Typography>
              <Button sx={{ mt: 2 }} onClick={() => setSearchQuery("")}>
                検索をクリア
              </Button>
            </Paper>
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                  xl: "repeat(3, minmax(0, 1fr))",
                },
              }}
            >
              {visibleProjects.map((project, index) => {
                return (
                  <Card
                    key={project.id}
                    sx={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      borderRadius: 4,
                      border: "1px solid #d9e3f1",
                      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                      transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
                      "&:hover": {
                        transform: "translateY(-2px)",
                        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
                        borderColor: alpha("#1a73e8", 0.28),
                      },
                    }}
                  >
                    <CardContent sx={{ p: 2.5, display: "grid", gap: 2.5 }}>
                      <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between">
                        <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
                          <Avatar
                            sx={{
                              bgcolor: alpha("#1a73e8", 0.12),
                              color: "primary.main",
                              fontWeight: 700,
                              fontSize: 18,
                            }}
                          >
                            {index + 1}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography data-testid="project-card-title" variant="h6" sx={{ lineHeight: 1.25 }}>
                              {project.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              {formatRelativeDate(project.summary.updated_at)}
                            </Typography>
                          </Box>
                        </Stack>
                      </Stack>

                      <Typography color="text.secondary" sx={{ minHeight: 66, lineHeight: 1.6 }}>
                        {project.description || "説明が未設定の project である。Project Settings から補足説明を追加できる。"}
                      </Typography>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          icon={<LabelRoundedIcon />}
                          label={`${project.summary.labels_count} labels`}
                          variant="outlined"
                          sx={{ borderColor: "#d9e3f1" }}
                        />
                        <Chip
                          icon={<DescriptionRoundedIcon />}
                          label={`${project.summary.documents_count} docs`}
                          variant="outlined"
                          sx={{ borderColor: "#d9e3f1" }}
                        />
                        <Chip
                          icon={<PendingActionsRoundedIcon />}
                          label={`${project.summary.pending_documents_count} pending`}
                          variant="outlined"
                          sx={{ borderColor: "#d9e3f1" }}
                        />
                      </Stack>
                    </CardContent>

                    <CardActions sx={{ px: 2.5, pb: 2.5, pt: 0, mt: "auto", justifyContent: "space-between" }}>
                      <Button
                        variant="contained"
                        startIcon={<WorkspacesRoundedIcon />}
                        onClick={() => navigate(`/projects/${project.id}`)}
                      >
                        Open Workspace
                      </Button>
                      <Button
                        variant="text"
                        startIcon={<SettingsRoundedIcon />}
                        onClick={() => navigate(`/projects/${project.id}/settings`)}
                      >
                        Settings
                      </Button>
                    </CardActions>
                  </Card>
                );
              })}
            </Box>
          )}
        </Stack>
      </Container>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={closeToast}>
        <Alert onClose={closeToast} severity={toast.severity} variant="filled">
          {toast.message}
        </Alert>
      </Snackbar>

      <CreateProjectDialog
        open={createDialogOpen}
        saving={creating}
        projectName={newProjectName}
        projectDescription={newProjectDescription}
        onNameChange={setNewProjectName}
        onDescriptionChange={setNewProjectDescription}
        onClose={() => {
          if (creating) {
            return;
          }
          setNewProjectName("");
          setNewProjectDescription("");
          setCreateDialogOpen(false);
        }}
        onCreate={() => void handleCreateProject()}
      />
    </Box>
  );
}
