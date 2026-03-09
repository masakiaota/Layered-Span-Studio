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
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Typography,
  alpha,
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
import { useToast } from "../hooks/useToast";
import type { JsonObject, ProjectRecord, UserRecord } from "../types";
import { normalizeSearchText, readJsonFile, toJsonObject } from "../utils";

type ProjectSummary = {
  project: ProjectRecord;
  labelsCount: number;
  documentsCount: number;
  pendingDocumentsCount: number;
  updatedAt: string | null;
};

function getDocumentStatusFromMeta(meta: JsonObject | null) {
  return toJsonObject(meta).status === "verified" ? "verified" : "pending";
}

function getLatestTimestamp(meta: JsonObject | null) {
  const json = toJsonObject(meta);
  const value =
    typeof json.updated_at === "string"
      ? json.updated_at
      : typeof json.created_at === "string"
        ? json.created_at
        : null;
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : value;
}

function formatRelativeDate(value: string | null) {
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

function buildProjectSearchText(summary: ProjectSummary) {
  return normalizeSearchText(
    [
      summary.project.name,
      summary.project.description ?? "",
      `${summary.labelsCount} labels`,
      `${summary.documentsCount} docs`,
      `${summary.pendingDocumentsCount} pending`,
    ].join(" "),
  );
}

export function ProjectsPage({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: UserRecord;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const { toast, showToast, closeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  async function refreshProjects() {
    setLoading(true);
    try {
      const response = await api.listProjects(token);
      const summaries = await Promise.all(
        response.projects.map(async (project) => {
          const [labelsResponse, documentsResponse] = await Promise.all([
            api.listLabels(token, project.id),
            api.listDocuments(token, project.id),
          ]);
          const updatedAt = documentsResponse.documents.reduce<string | null>((latest, document) => {
            const candidate = getLatestTimestamp(document.meta);
            if (!candidate) {
              return latest;
            }
            if (!latest) {
              return candidate;
            }
            return Date.parse(candidate) > Date.parse(latest) ? candidate : latest;
          }, null);
          return {
            project,
            labelsCount: labelsResponse.labels.length,
            documentsCount: documentsResponse.total,
            pendingDocumentsCount: documentsResponse.documents.filter(
              (document) => getDocumentStatusFromMeta(document.meta) === "pending",
            ).length,
            updatedAt,
          } satisfies ProjectSummary;
        }),
      );
      summaries.sort((left, right) => {
        const pendingDiff = right.pendingDocumentsCount - left.pendingDocumentsCount;
        if (pendingDiff !== 0) {
          return pendingDiff;
        }
        if (left.updatedAt && right.updatedAt && left.updatedAt !== right.updatedAt) {
          return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        }
        if (left.updatedAt && !right.updatedAt) {
          return -1;
        }
        if (!left.updatedAt && right.updatedAt) {
          return 1;
        }
        return left.project.name.localeCompare(right.project.name, "ja");
      });
      setProjectSummaries(summaries);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Project 一覧の取得に失敗した", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshProjects();
  }, [token]);

  async function handleProjectImport(file: File | null, input?: HTMLInputElement | null) {
    if (!file) {
      return;
    }
    setImporting(true);
    try {
      const payload = await readJsonFile(file);
      const response = await api.importProjectAsNew(token, payload);
      showToast("Project を import した", "success");
      navigate(`/projects/${response.project.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Import に失敗した", "error");
    } finally {
      setImporting(false);
      if (input) {
        input.value = "";
      }
    }
  }

  function renderImportButton(label: string, variant: "contained" | "outlined", sx?: object) {
    return (
      <Button component="label" variant={variant} startIcon={<UploadFileRoundedIcon />} disabled={importing} sx={sx}>
        {label}
        <input
          hidden
          accept=".json,application/json"
          type="file"
          onChange={(event) => void handleProjectImport(event.target.files?.[0] ?? null, event.currentTarget)}
        />
      </Button>
    );
  }

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return projectSummaries;
    }
    const normalized = normalizeSearchText(searchQuery);
    return projectSummaries.filter((summary) => buildProjectSearchText(summary).includes(normalized));
  }, [projectSummaries, searchQuery]);

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
          {renderImportButton("Import Project", "contained")}
          <Button color="inherit" startIcon={<LogoutRoundedIcon />} onClick={onLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              pt: { xs: 0.5, md: 1.5 },
            }}
          >
            <Box sx={{ width: "100%", maxWidth: 640 }}>
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
            </Box>
          </Box>

          {loading ? (
            <Paper sx={{ p: 8, textAlign: "center", borderRadius: 4 }}>
              <CircularProgress />
            </Paper>
          ) : projectSummaries.length === 0 ? (
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
                まずは export JSON を import して、注釈対象の project を作成する。
              </Typography>
              {renderImportButton("Import Project", "contained", { mt: 3 })}
            </Paper>
          ) : filteredProjects.length === 0 ? (
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
              {filteredProjects.map((summary, index) => {
                const hasPending = summary.pendingDocumentsCount > 0;
                return (
                  <Card
                    key={summary.project.id}
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
                            <Typography variant="h6" sx={{ lineHeight: 1.25 }}>
                              {summary.project.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              {formatRelativeDate(summary.updatedAt)}
                            </Typography>
                          </Box>
                        </Stack>
                      </Stack>

                      <Typography color="text.secondary" sx={{ minHeight: 66, lineHeight: 1.6 }}>
                        {summary.project.description || "説明が未設定の project である。Project Settings から補足説明を追加できる。"}
                      </Typography>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          icon={<LabelRoundedIcon />}
                          label={`${summary.labelsCount} labels`}
                          variant="outlined"
                          sx={{ borderColor: "#d9e3f1" }}
                        />
                        <Chip
                          icon={<DescriptionRoundedIcon />}
                          label={`${summary.documentsCount} docs`}
                          variant="outlined"
                          sx={{ borderColor: "#d9e3f1" }}
                        />
                        <Chip
                          icon={<PendingActionsRoundedIcon />}
                          label={`${summary.pendingDocumentsCount} pending`}
                          variant="outlined"
                          sx={{ borderColor: "#d9e3f1" }}
                        />
                      </Stack>
                    </CardContent>

                    <CardActions sx={{ px: 2.5, pb: 2.5, pt: 0, mt: "auto", justifyContent: "space-between" }}>
                      <Button
                        variant="contained"
                        startIcon={<WorkspacesRoundedIcon />}
                        onClick={() => navigate(`/projects/${summary.project.id}`)}
                      >
                        Open Workspace
                      </Button>
                      <Button
                        variant="text"
                        startIcon={<SettingsRoundedIcon />}
                        onClick={() => navigate(`/projects/${summary.project.id}/settings`)}
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
    </Box>
  );
}
