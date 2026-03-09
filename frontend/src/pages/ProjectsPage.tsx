import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Paper,
  Snackbar,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import WorkspacesRoundedIcon from "@mui/icons-material/WorkspacesRounded";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../hooks/useToast";
import type { ProjectRecord, UserRecord } from "../types";
import { readJsonFile } from "../utils";

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
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  async function refreshProjects() {
    setLoading(true);
    try {
      const response = await api.listProjects(token);
      setProjects(response.projects);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Project 一覧の取得に失敗した", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshProjects();
  }, [token]);

  async function handleProjectImport(file: File | null) {
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
      if (importRef.current) {
        importRef.current.value = "";
      }
    }
  }

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: "blur(10px)", borderBottom: "1px solid #d7e2f0" }}>
        <Toolbar sx={{ gap: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexGrow: 1 }}>
            <Avatar sx={{ bgcolor: "primary.main" }}>
              <WorkspacesRoundedIcon />
            </Avatar>
            <Box>
              <Typography variant="h6">Layered Span Studio</Typography>
              <Typography variant="body2" color="text.secondary">
                Signed in as {user.username}
              </Typography>
            </Box>
          </Stack>
          <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />} disabled={importing}>
            Import Project
            <input hidden accept=".json,application/json" ref={importRef} type="file" onChange={(event) => void handleProjectImport(event.target.files?.[0] ?? null)} />
          </Button>
          <Button color="inherit" startIcon={<LogoutRoundedIcon />} onClick={onLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4">Projects</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              export JSON から新規 project を import し、Workspace と Settings を行き来しながら注釈作業を進める。
            </Typography>
          </Box>

          {loading ? (
            <Paper sx={{ p: 6, textAlign: "center" }}>
              <CircularProgress />
            </Paper>
          ) : projects.length === 0 ? (
            <Paper sx={{ p: 6, textAlign: "center" }}>
              <Typography variant="h6">Project がまだない</Typography>
              <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                まずは export JSON を import して workspace を作成する。
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {projects.map((project) => (
                <Card key={project.id} sx={{ borderRadius: 4 }}>
                  <CardContent sx={{ display: "grid", gap: 2.5 }}>
                    <Box>
                      <Typography variant="h6">{project.name}</Typography>
                      <Typography color="text.secondary" sx={{ mt: 1, minHeight: 64 }}>
                        {project.description || "説明なし"}
                      </Typography>
                    </Box>
                    <Button variant="contained" onClick={() => navigate(`/projects/${project.id}`)}>
                      Open Workspace
                    </Button>
                  </CardContent>
                </Card>
              ))}
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
