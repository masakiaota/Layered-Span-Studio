import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import LabelRoundedIcon from "@mui/icons-material/LabelRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import WorkspacesRoundedIcon from "@mui/icons-material/WorkspacesRounded";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { api } from "./api";
import type {
  AnnotationRecord,
  DocumentRecord,
  JsonObject,
  LabelRecord,
  ProjectBundle,
  ProjectRecord,
  StatusValue,
  UserRecord,
} from "./types";
import {
  buildExportFilename,
  deepClone,
  documentMatchesSearch,
  downloadJson,
  findNextPendingDocumentId,
  getDocumentSnippet,
  getDocumentStatus,
  getProjectGuideline,
  getProjectShortcutHelpEnabled,
  groupAnnotationsByLabel,
  isLocalId,
  labelEquals,
  makeLocalId,
  normalizeSearchText,
  projectEquals,
  readJsonFile,
  setDocumentStatus,
  setProjectGuideline,
  setProjectShortcutHelpEnabled,
  sortDocuments,
  toJsonObject,
} from "./utils";

type ToastState = {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error";
};

type PendingAction =
  | { type: "doc"; docId: string }
  | { type: "settings" }
  | { type: "workspace" }
  | { type: "projects" };

type SelectionDraft = {
  start: number;
  end: number;
  text: string;
  top: number;
  left: number;
};

const TOKEN_KEY = "layered-span-studio/token";
const UNDERLINE_LANE_BASE = 5.0;
const UNDERLINE_LANE_PITCH = 4.4;
const UNDERLINE_PADDING_TAIL = 5;
const UNDERLINE_HIT_HEIGHT = 5;

function useToast() {
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    severity: "info",
  });

  return {
    toast,
    showToast(message: string, severity: ToastState["severity"] = "info") {
      setToast({ open: true, message, severity });
    },
    closeToast() {
      setToast((current) => ({ ...current, open: false }));
    },
  };
}

function getSelectionOffset(container: HTMLElement, node: Node, offset: number) {
  let total = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const currentNode = walker.currentNode;
    const length = currentNode.textContent?.length ?? 0;
    if (currentNode === node) {
      return total + offset;
    }
    total += length;
  }
  return total;
}

function contextSnippet(text: string, start: number, end: number, size = 16) {
  return {
    before: text.slice(Math.max(0, start - size), start),
    focus: text.slice(start, end),
    after: text.slice(end, Math.min(text.length, end + size)),
  };
}

function mixColorWithBlack(hexColor: string, ratio = 0.5) {
  const normalized = hexColor.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "#1d1d1d";
  }
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) => Math.round(channel * (1 - ratio)));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function getDocumentHoverPreview(document: DocumentRecord, query: string, size = 180) {
  if (!query.trim()) {
    return document.text.slice(0, size);
  }
  const normalizedText = normalizeSearchText(document.text);
  const normalizedQuery = normalizeSearchText(query);
  const index = normalizedText.indexOf(normalizedQuery);
  if (index < 0) {
    return document.text.slice(0, size);
  }
  const start = Math.max(0, index - 48);
  const end = Math.min(document.text.length, index + size);
  return `${start > 0 ? "…" : ""}${document.text.slice(start, end)}${end < document.text.length ? "…" : ""}`;
}

function buildSegments(
  text: string,
  annotations: AnnotationRecord[],
  labelsById: Map<string, LabelRecord>,
  focusedLabelId: string | null,
  selectedAnnotationId: string | null,
) {
  const boundaries = new Set<number>([0, text.length]);
  annotations.forEach((annotation) => {
    boundaries.add(annotation.start);
    boundaries.add(annotation.end);
  });
  const sorted = [...boundaries].sort((a, b) => a - b);
  const segments: Array<{
    id: string;
    text: string;
    covers: AnnotationRecord[];
    focused: AnnotationRecord[];
    others: AnnotationRecord[];
    selected: boolean;
  }> = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (start === end) {
      continue;
    }
    const cover = annotations.filter((annotation) => annotation.start < end && annotation.end > start);
    segments.push({
      id: `${start}-${end}`,
      text: text.slice(start, end),
      covers: cover,
      focused: cover.filter((annotation) => annotation.label_id === focusedLabelId),
      others: cover.filter((annotation) => annotation.label_id !== focusedLabelId),
      selected: cover.some((annotation) => annotation.id === selectedAnnotationId),
    });
  }

  return segments.map((segment) => {
    const focusedLabel = segment.focused[0] ? labelsById.get(segment.focused[0].label_id) : null;
    const underlineColors = segment.others
      .map((annotation) => labelsById.get(annotation.label_id)?.color)
      .filter((value): value is string => Boolean(value));
    return {
      ...segment,
      focusedColor: focusedLabel?.color,
      underlineColors,
    };
  });
}

function buildUnderlineLaneByAnnotation(
  annotations: AnnotationRecord[],
  labels: LabelRecord[],
  focusedLabelId: string | null,
) {
  const labelOrderById = new Map(labels.map((label, index) => [label.id, index]));
  const laneEnds: number[] = [];
  const laneByAnnotationId: Record<string, number> = {};
  let maxLane = -1;
  annotations
    .filter((annotation) => annotation.label_id !== focusedLabelId)
    .sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start;
      }
      if (left.end !== right.end) {
        return left.end - right.end;
      }
      const labelDiff = (labelOrderById.get(left.label_id) ?? 0) - (labelOrderById.get(right.label_id) ?? 0);
      if (labelDiff !== 0) {
        return labelDiff;
      }
      return left.id.localeCompare(right.id);
    })
    .forEach((annotation) => {
      let laneIndex = 0;
      while (laneIndex < laneEnds.length && laneEnds[laneIndex] > annotation.start) {
        laneIndex += 1;
      }
      laneEnds[laneIndex] = annotation.end;
      laneByAnnotationId[annotation.id] = laneIndex;
      maxLane = Math.max(maxLane, laneIndex);
    });

  return {
    laneByAnnotationId,
    reserveBottom:
      maxLane >= 0 ? UNDERLINE_LANE_BASE + maxLane * UNDERLINE_LANE_PITCH + UNDERLINE_PADDING_TAIL : 0,
  };
}

function mergeInlineRects(
  rects: Array<{ left: number; right: number; top: number; bottom: number; width: number; height: number }>,
) {
  const sorted = [...rects]
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((left, right) => (left.top !== right.top ? left.top - right.top : left.left - right.left));
  const merged: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  sorted.forEach((rect) => {
    const last = merged[merged.length - 1];
    const isSameLine =
      last &&
      Math.abs(last.top - rect.top) <= 1 &&
      Math.abs(last.bottom - rect.bottom) <= 1 &&
      rect.left <= last.right + 2;
    if (isSameLine) {
      last.right = Math.max(last.right, rect.right);
      return;
    }
    merged.push({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    });
  });
  return merged;
}

function sortAnnotationsInPanelOrder(document: DocumentRecord, labels: LabelRecord[]) {
  const groups = new Map(labels.map((label) => [label.id, [] as AnnotationRecord[]]));
  const fallback: AnnotationRecord[] = [];
  document.annotations.forEach((annotation) => {
    const group = groups.get(annotation.label_id);
    if (group) {
      group.push(annotation);
    } else {
      fallback.push(annotation);
    }
  });
  const sortBySpanIndex = (left: AnnotationRecord, right: AnnotationRecord) =>
    left.start - right.start || left.end - right.end || left.id.localeCompare(right.id);
  const ordered: AnnotationRecord[] = [];
  labels.forEach((label) => {
    const group = groups.get(label.id) ?? [];
    group.sort(sortBySpanIndex);
    ordered.push(...group);
  });
  fallback.sort(sortBySpanIndex);
  ordered.push(...fallback);
  return ordered;
}

function getSameLabelSurfaceExamples(
  bundle: ProjectBundle,
  focusedLabel: LabelRecord | null,
  selectedAnnotation: AnnotationRecord | null,
) {
  if (!focusedLabel) {
    return [];
  }
  const entries = bundle.documents.flatMap((document) =>
    document.annotations
      .filter((annotation) => annotation.label_id === focusedLabel.id)
      .filter((annotation) => !selectedAnnotation || annotation.id !== selectedAnnotation.id)
      .map((annotation) => ({ document, annotation })),
  );
  const deduped = new Map<
    string,
    {
      document: DocumentRecord;
      annotation: AnnotationRecord;
      duplicateCount: number;
      duplicates: Array<{ document: DocumentRecord; annotation: AnnotationRecord }>;
    }
  >();
  entries.forEach((entry) => {
    const key = normalizeSearchText(entry.annotation.span_text);
    if (!key) {
      return;
    }
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, { ...entry, duplicateCount: 1, duplicates: [entry] });
      return;
    }
    existing.duplicateCount += 1;
    existing.duplicates.push(entry);
    if (existing.annotation.status !== "verified" && entry.annotation.status === "verified") {
      deduped.set(key, { ...entry, duplicateCount: existing.duplicateCount, duplicates: existing.duplicates });
    }
  });
  return [...deduped.values()]
    .sort((left, right) => {
      if (left.annotation.status !== right.annotation.status) {
        return left.annotation.status === "verified" ? -1 : 1;
      }
      return right.document.document_name.localeCompare(left.document.document_name, "ja");
    })
    .slice(0, 8);
}

function getSameSurfaceAnnotationExamples(bundle: ProjectBundle, selectedAnnotation: AnnotationRecord | null) {
  if (!selectedAnnotation) {
    return [];
  }
  const target = normalizeSearchText(selectedAnnotation.span_text);
  return bundle.documents
    .flatMap((document) =>
      document.annotations
        .filter((annotation) => normalizeSearchText(annotation.span_text) === target)
        .filter((annotation) => annotation.id !== selectedAnnotation.id)
        .map((annotation) => ({ document, annotation })),
    )
    .sort((left, right) => {
      const leftDifferent = left.annotation.label_id !== selectedAnnotation.label_id;
      const rightDifferent = right.annotation.label_id !== selectedAnnotation.label_id;
      if (leftDifferent !== rightDifferent) {
        return leftDifferent ? -1 : 1;
      }
      if (left.annotation.status !== right.annotation.status) {
        return left.annotation.status === "verified" ? -1 : 1;
      }
      return right.document.document_name.localeCompare(left.document.document_name, "ja");
    })
    .slice(0, 8);
}

function LoginPage({
  loading,
  error,
  onLogin,
}: {
  loading: boolean;
  error: string;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("demo_login_user");
  const [password, setPassword] = useState("demo_login_pass");

  return (
    <Container maxWidth="sm" sx={{ display: "grid", minHeight: "100vh", placeItems: "center", py: 4 }}>
      <Card sx={{ width: "100%", borderRadius: 4 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="overline" color="primary.main">
                Material Workspace
              </Typography>
              <Typography variant="h4" sx={{ mt: 1 }}>
                Layered Span Studio
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.7 }}>
                Google Workspace 系の読みやすさを土台にした、ドキュメント注釈用フロントエンドである。
              </Typography>
            </Box>
            <Stack
              component="form"
              spacing={2}
              onSubmit={(event) => {
                event.preventDefault();
                void onLogin(username, password);
              }}
            >
              <TextField label="Username" value={username} onChange={(event) => setUsername(event.target.value)} fullWidth />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                fullWidth
              />
              {error ? <Alert severity="error">{error}</Alert> : null}
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}

function ProjectsPage({
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

function DocumentCanvas({
  document,
  labels,
  focusedLabelId,
  selectedAnnotationId,
  onFocusLabel,
  onSelectAnnotation,
  onCreateAnnotation,
  onClearSelection,
}: {
  document: DocumentRecord;
  labels: LabelRecord[];
  focusedLabelId: string | null;
  selectedAnnotationId: string | null;
  onFocusLabel: (labelId: string) => void;
  onSelectAnnotation: (annotationId: string | null) => void;
  onCreateAnnotation: (start: number, end: number, text: string) => void;
  onClearSelection: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<SelectionDraft | null>(null);
  const [hoveredLaneAnnotationId, setHoveredLaneAnnotationId] = useState<string | null>(null);
  const [laneTooltip, setLaneTooltip] = useState<{ text: string; color: string; top: number; left: number } | null>(
    null,
  );
  const [markerBoxes, setMarkerBoxes] = useState<
    Array<{ annotationId: string; left: number; top: number; width: number; height: number; color: string }>
  >([]);
  const [overlayLines, setOverlayLines] = useState<
    Array<{ annotationId: string; left: number; top: number; width: number; color: string }>
  >([]);
  const [selectionBoxes, setSelectionBoxes] = useState<
    Array<{ left: number; top: number; width: number; height: number; color: string }>
  >([]);
  const labelsById = useMemo(() => new Map(labels.map((label) => [label.id, label])), [labels]);
  const underlineLayout = useMemo(
    () => buildUnderlineLaneByAnnotation(document.annotations, labels, focusedLabelId),
    [document.annotations, labels, focusedLabelId],
  );
  const segments = useMemo(
    () => buildSegments(document.text, document.annotations, labelsById, focusedLabelId, selectedAnnotationId),
    [document, labelsById, focusedLabelId, selectedAnnotationId],
  );

  useEffect(() => {
    setSelection(null);
    setHoveredLaneAnnotationId(null);
    setLaneTooltip(null);
  }, [document.id, focusedLabelId, selectedAnnotationId]);

  useEffect(() => {
    if (!selection) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onCreateAnnotation(selection.start, selection.end, selection.text);
        window.getSelection()?.removeAllRanges();
        setSelection(null);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, onCreateAnnotation]);

  useLayoutEffect(() => {
    const root = textRef.current;
    if (!root) {
      setMarkerBoxes([]);
      setOverlayLines([]);
      setSelectionBoxes([]);
      return;
    }
    const baseRect = root.getBoundingClientRect();
    const rectsByAnnotationId: Record<
      string,
      Array<{ left: number; right: number; top: number; bottom: number; width: number; height: number }>
    > = {};
    const segmentsWithCover = root.querySelectorAll<HTMLElement>("[data-cover-ann-ids]");
    segmentsWithCover.forEach((element) => {
      const coverIds = (element.dataset.coverAnnIds ?? "").split(",").filter(Boolean);
      const rects = Array.from(element.getClientRects()).map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }));
      coverIds.forEach((annotationId) => {
        rectsByAnnotationId[annotationId] = [...(rectsByAnnotationId[annotationId] ?? []), ...rects];
      });
    });

    const nextMarkerBoxes = document.annotations
      .filter((annotation) => annotation.label_id === focusedLabelId)
      .flatMap((annotation) => {
        const label = labelsById.get(annotation.label_id);
        const mergedRects = mergeInlineRects(rectsByAnnotationId[annotation.id] ?? []);
        return mergedRects.map((rect) => ({
          annotationId: annotation.id,
          color: label?.color ?? "#8b94a0",
          left: rect.left - baseRect.left,
          top: rect.top - baseRect.top - 1,
          width: rect.right - rect.left,
          height: Math.max(18, rect.bottom - rect.top + 2),
        }));
      })
      .filter((box) => box.width > 0);

    const nextOverlayLines = document.annotations
      .filter((annotation) => annotation.label_id !== focusedLabelId)
      .flatMap((annotation) => {
        const laneIndex = underlineLayout.laneByAnnotationId[annotation.id];
        const label = labelsById.get(annotation.label_id);
        const mergedRects = mergeInlineRects(rectsByAnnotationId[annotation.id] ?? []);
        return mergedRects.map((rect) => ({
          annotationId: annotation.id,
          color: label?.color ?? "#8b94a0",
          left: rect.left - baseRect.left,
          width: rect.right - rect.left,
          top:
            rect.bottom -
            baseRect.top +
            (UNDERLINE_LANE_BASE + (laneIndex ?? 0) * UNDERLINE_LANE_PITCH - UNDERLINE_HIT_HEIGHT / 2),
        }));
      })
      .filter((line) => line.width > 0);

    const nextSelectionBoxes = selectedAnnotationId
      ? mergeInlineRects(rectsByAnnotationId[selectedAnnotationId] ?? []).map((rect) => {
          const selectedAnnotation = document.annotations.find((item) => item.id === selectedAnnotationId);
          const selectedLabel = selectedAnnotation ? labelsById.get(selectedAnnotation.label_id) : null;
          return {
            left: rect.left - baseRect.left,
            top: rect.top - baseRect.top,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
            color: mixColorWithBlack(selectedLabel?.color ?? "#1a73e8", 0.5),
          };
        })
      : [];

    setMarkerBoxes(nextMarkerBoxes);
    setOverlayLines(nextOverlayLines);
    setSelectionBoxes(nextSelectionBoxes);
  }, [document, focusedLabelId, selectedAnnotationId, underlineLayout, labelsById, segments]);

  const moveLaneTooltip = (annotationId: string, clientX: number, clientY: number) => {
    const annotation = document.annotations.find((item) => item.id === annotationId);
    const label = annotation ? labelsById.get(annotation.label_id) : null;
    if (!annotation || !label) {
      setLaneTooltip(null);
      return;
    }
    setLaneTooltip({
      text: label.name,
      color: label.color,
      left: Math.min(window.innerWidth - 180, clientX + 14),
      top: Math.min(window.innerHeight - 42, clientY + 16),
    });
  };

  const handleMouseUp = () => {
    const root = textRef.current;
    const selectionObj = window.getSelection();
    if (!root || !selectionObj || selectionObj.rangeCount === 0 || selectionObj.isCollapsed) {
      setSelection(null);
      return;
    }
    const range = selectionObj.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setSelection(null);
      return;
    }
    const start = getSelectionOffset(root, range.startContainer, range.startOffset);
    const end = getSelectionOffset(root, range.endContainer, range.endOffset);
    if (start === end) {
      setSelection(null);
      return;
    }
    const normalizedStart = Math.min(start, end);
    const normalizedEnd = Math.max(start, end);
    const rect = range.getBoundingClientRect();
    setSelection({
      start: normalizedStart,
      end: normalizedEnd,
      text: document.text.slice(normalizedStart, normalizedEnd),
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX,
    });
  };

  return (
    <Box sx={{ position: "relative" }}>
      <Paper sx={{ p: 2.5, minHeight: 520 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Drag で選択し、現在ラベルへ span を作成する。注目ラベルは塗り、それ以外は下線で表示する。
        </Typography>
        <Box
          ref={canvasRef}
          onClick={(event) => {
            if (!window.getSelection()?.isCollapsed) {
              return;
            }
            if (event.target === event.currentTarget) {
              onClearSelection();
            }
          }}
          sx={{ position: "relative" }}
        >
          <Box
            ref={textRef}
            data-testid="doc-text"
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              setHoveredLaneAnnotationId(null);
              setLaneTooltip(null);
            }}
            sx={{
              fontSize: 19,
              lineHeight: 1.95,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              userSelect: "text",
              position: "relative",
              pb: `${underlineLayout.reserveBottom}px`,
              zIndex: 2,
            }}
          >
            {segments.map((segment) => {
              const primaryFocused = segment.focused[0] ?? null;
              return (
                <Box
                  key={segment.id}
                  component="span"
                  data-primary-ann-id={primaryFocused?.id ?? ""}
                  data-cover-ann-ids={segment.covers.map((annotation) => annotation.id).join(",")}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (primaryFocused) {
                      onSelectAnnotation(primaryFocused.id);
                      return;
                    }
                    onClearSelection();
                  }}
                  sx={{
                    display: "inline",
                    cursor: segment.covers.length ? "pointer" : "text",
                    backgroundColor: "transparent",
                    borderRadius: "4px",
                    boxDecorationBreak: "clone",
                    WebkitBoxDecorationBreak: "clone",
                  }}
                >
                  {segment.text}
                </Box>
              );
            })}
          </Box>

          <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}>
            {markerBoxes.map((box, index) => (
              <Box
                key={`${box.annotationId}-marker-${index}`}
                sx={{
                  position: "absolute",
                  left: box.left - 1,
                  top: box.top,
                  width: box.width + 2,
                  height: box.height,
                  borderRadius: 1,
                  backgroundColor: alpha(box.color, 0.28),
                }}
              />
            ))}
          </Box>

          <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3 }}>
            {overlayLines.map((line, index) => {
              const isHover = hoveredLaneAnnotationId === line.annotationId;
              const isSelected = selectedAnnotationId === line.annotationId;
              const dimmed = hoveredLaneAnnotationId && !isHover && !isSelected;
              return (
                <Box
                  key={`${line.annotationId}-${index}`}
                  data-overlay-ann-id={line.annotationId}
                  onMouseEnter={() => setHoveredLaneAnnotationId(line.annotationId)}
                  onMouseLeave={() => {
                    setHoveredLaneAnnotationId(null);
                    setLaneTooltip(null);
                  }}
                  onMouseMove={(event) => moveLaneTooltip(line.annotationId, event.clientX, event.clientY)}
                  onClick={(event) => {
                    event.stopPropagation();
                    const annotation = document.annotations.find((item) => item.id === line.annotationId);
                    if (!annotation) {
                      return;
                    }
                    onFocusLabel(annotation.label_id);
                    onSelectAnnotation(annotation.id);
                  }}
                  sx={{
                    position: "absolute",
                    pointerEvents: "auto",
                    left: line.left,
                    top: line.top,
                    width: line.width,
                    height: UNDERLINE_HIT_HEIGHT,
                    cursor: "pointer",
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      height: isHover || isSelected ? 3 : 2.5,
                      borderRadius: 999,
                      backgroundColor: alpha(line.color, dimmed ? 0.28 : 0.94),
                    },
                  }}
                />
              );
            })}
            {selectionBoxes.map((box, index) => (
              <Box
                key={`${box.left}-${box.top}-${index}`}
                sx={{
                  position: "absolute",
                  left: box.left - 1,
                  top: box.top - 1,
                  width: box.width + 2,
                  height: box.height + 2,
                  pointerEvents: "none",
                  boxShadow: `0 0 0 2px ${box.color}`,
                  borderRadius: 1,
                  backgroundColor: "transparent",
                }}
              />
            ))}
          </Box>
        </Box>
      </Paper>

      {selection ? (
        <Paper
          sx={{
            position: "fixed",
            top: selection.top,
            left: selection.left,
            zIndex: 30,
            px: 1,
            py: 0.5,
            display: "flex",
            gap: 1,
            alignItems: "center",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {selection.text}
          </Typography>
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              onCreateAnnotation(selection.start, selection.end, selection.text);
              window.getSelection()?.removeAllRanges();
              setSelection(null);
            }}
          >
            Add annotation
          </Button>
        </Paper>
      ) : null}

      {laneTooltip ? (
        <Paper
          sx={{
            position: "fixed",
            top: laneTooltip.top,
            left: laneTooltip.left,
            zIndex: 31,
            px: 1,
            py: 0.5,
            display: "flex",
            gap: 0.75,
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: laneTooltip.color }} />
          <Typography variant="caption">{laneTooltip.text}</Typography>
        </Paper>
      ) : null}
    </Box>
  );
}

function ProjectShell({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: UserRecord;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId = "" } = useParams();
  const view: "workspace" | "settings" = location.pathname.endsWith("/settings") ? "settings" : "workspace";
  const { toast, showToast, closeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [snapshot, setSnapshot] = useState<ProjectBundle | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [focusedLabelId, setFocusedLabelId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"examples" | "annotations">("examples");
  const [annotationEditCollapsed, setAnnotationEditCollapsed] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("name");
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [createDocOpen, setCreateDocOpen] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocText, setNewDocText] = useState("");
  const [labelDraft, setLabelDraft] = useState({
    id: "",
    name: "",
    color: "#1a73e8",
    description: "",
    shortcut: "",
  });
  const [settingsImportFile, setSettingsImportFile] = useState<File | null>(null);
  const [exportPending, setExportPending] = useState(true);
  const [exportVerified, setExportVerified] = useState(true);

  const dirty = useMemo(() => {
    if (!bundle || !snapshot) {
      return false;
    }
    return JSON.stringify(bundle) !== JSON.stringify(snapshot);
  }, [bundle, snapshot]);

  async function loadBundle() {
    setLoading(true);
    try {
      const nextBundle = await api.loadProjectBundle(token, projectId);
      setBundle(nextBundle);
      setSnapshot(deepClone(nextBundle));
      setSelectedDocId(nextBundle.documents[0]?.id ?? null);
      setFocusedLabelId(nextBundle.labels[0]?.id ?? null);
      setSelectedAnnotationId(null);
      setRightTab("examples");
      setAnnotationEditCollapsed(false);
      setAccordionOpen(Object.fromEntries(nextBundle.labels.map((label) => [label.id, true])));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Workspace の読み込みに失敗した", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBundle();
  }, [projectId, token]);

  const currentDocument = useMemo(
    () => bundle?.documents.find((document) => document.id === selectedDocId) ?? bundle?.documents[0] ?? null,
    [bundle, selectedDocId],
  );

  const focusedLabel = useMemo(
    () => bundle?.labels.find((label) => label.id === focusedLabelId) ?? bundle?.labels[0] ?? null,
    [bundle, focusedLabelId],
  );

  const selectedAnnotation = useMemo(
    () => currentDocument?.annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null,
    [currentDocument, selectedAnnotationId],
  );

  const visibleDocuments = useMemo(() => {
    if (!bundle) {
      return [];
    }
    return sortDocuments(
      bundle.documents.filter((document) => documentMatchesSearch(document, searchQuery)),
      sortMode,
    );
  }, [bundle, searchQuery, sortMode]);

  const currentHiddenBySearch = Boolean(
    currentDocument && searchQuery.trim() && !visibleDocuments.some((document) => document.id === currentDocument.id),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = Boolean(target?.closest("input, textarea, [contenteditable='true']"));
      const keyLower = event.key.toLowerCase();
      if (event.key === "?" && !editing) {
        event.preventDefault();
        setShortcutOpen((current) => !current);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && keyLower === "s") {
        event.preventDefault();
        void handleSave();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSubmit();
        return;
      }
      if (editing || !bundle || !currentDocument) {
        return;
      }
      if (keyLower === "j") {
        event.preventDefault();
        moveDocumentByDirection(1, event.shiftKey);
        return;
      }
      if (keyLower === "k") {
        event.preventDefault();
        moveDocumentByDirection(-1, event.shiftKey);
        return;
      }
      if (keyLower === "h" || event.key === "ArrowLeft") {
        event.preventDefault();
        moveLabelByDirection(-1);
        return;
      }
      if (keyLower === "l" || event.key === "ArrowRight") {
        event.preventDefault();
        moveLabelByDirection(1);
        return;
      }
      if (event.key === "[") {
        event.preventDefault();
        moveRightPanelTabByDirection(-1);
        return;
      }
      if (event.key === "]") {
        event.preventDefault();
        moveRightPanelTabByDirection(1);
        return;
      }
      if (keyLower === "n") {
        event.preventDefault();
        moveAnnotationByDirection(1, false);
        return;
      }
      if (keyLower === "p") {
        event.preventDefault();
        moveAnnotationByDirection(-1, false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveAnnotationByDirection(1, true);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveAnnotationByDirection(-1, true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedAnnotationId(null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedAnnotationId) {
        event.preventDefault();
        deleteSelectedAnnotation();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bundle, currentDocument, focusedLabelId, rightTab, selectedAnnotationId, searchQuery, sortMode, snapshot]);

  const sameLabelExamples = useMemo(() => {
    if (!bundle || !focusedLabel) {
      return [];
    }
    return getSameLabelSurfaceExamples(bundle, focusedLabel, selectedAnnotation);
  }, [bundle, focusedLabel, selectedAnnotation]);

  const sameSurfaceExamples = useMemo(() => {
    if (!bundle) {
      return [];
    }
    return getSameSurfaceAnnotationExamples(bundle, selectedAnnotation);
  }, [bundle, selectedAnnotation]);

  function mutateBundle(mutator: (draft: ProjectBundle) => void) {
    setBundle((current) => {
      if (!current) {
        return current;
      }
      const draft = deepClone(current);
      mutator(draft);
      return draft;
    });
  }

  function moveDocumentByDirection(direction: number, pendingOnly: boolean) {
    if (!bundle || visibleDocuments.length === 0 || !currentDocument) {
      return;
    }
    const currentIndex = visibleDocuments.findIndex((document) => document.id === currentDocument.id);
    if (currentIndex < 0) {
      setSelectedDocId(direction > 0 ? visibleDocuments[0].id : visibleDocuments[visibleDocuments.length - 1].id);
      setSelectedAnnotationId(null);
      setRightTab("examples");
      return;
    }
    let index = currentIndex + direction;
    while (index >= 0 && index < visibleDocuments.length) {
      const candidate = visibleDocuments[index];
      if (!pendingOnly || getDocumentStatus(candidate) === "pending") {
        setSelectedDocId(candidate.id);
        setSelectedAnnotationId(null);
        setRightTab("examples");
        return;
      }
      index += direction;
    }
    showToast(pendingOnly ? "移動先の pending doc がない" : "移動先の doc がない", "info");
  }

  function moveLabelByDirection(direction: number) {
    if (!bundle || bundle.labels.length === 0) {
      return;
    }
    const currentIndex = bundle.labels.findIndex((label) => label.id === focusedLabelId);
    const nextIndex = (currentIndex >= 0 ? currentIndex : 0) + direction;
    if (nextIndex < 0 || nextIndex >= bundle.labels.length) {
      return;
    }
    setFocusedLabelId(bundle.labels[nextIndex].id);
    setSelectedAnnotationId(null);
  }

  function moveRightPanelTabByDirection(direction: number) {
    const tabs: Array<"examples" | "annotations"> = ["examples", "annotations"];
    const currentIndex = tabs.indexOf(rightTab);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= tabs.length) {
      return;
    }
    setRightTab(tabs[nextIndex]);
  }

  function moveAnnotationByDirection(direction: number, allowCrossGroup: boolean) {
    if (!currentDocument || currentDocument.annotations.length === 0 || !bundle) {
      return;
    }
    const orderedAll = sortAnnotationsInPanelOrder(currentDocument, bundle.labels);
    const ordered = orderedAll.filter((annotation) => annotation.label_id === focusedLabelId);
    if (!allowCrossGroup && ordered.length === 0) {
      showToast("現在 Label に Annotation がない", "info");
      return;
    }
    const current = currentDocument.annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null;
    let next: AnnotationRecord | null = null;
    if (allowCrossGroup) {
      const currentIndex = current ? orderedAll.findIndex((annotation) => annotation.id === current.id) : -1;
      if (currentIndex >= 0) {
        next = orderedAll[currentIndex + direction] ?? null;
      } else if (ordered.length > 0) {
        next = direction > 0 ? ordered[0] : ordered[ordered.length - 1];
      } else {
        next = direction > 0 ? orderedAll[0] : orderedAll[orderedAll.length - 1];
      }
    } else {
      const sameLabelSelection = current?.label_id === focusedLabelId;
      const currentIndex = sameLabelSelection ? ordered.findIndex((annotation) => annotation.id === current?.id) : -1;
      const nextIndex = currentIndex < 0 ? (direction > 0 ? 0 : ordered.length - 1) : currentIndex + direction;
      next = ordered[nextIndex] ?? null;
    }
    if (!next) {
      return;
    }
    setSelectedAnnotationId(next.id);
    setFocusedLabelId(next.label_id);
  }

  function deleteSelectedAnnotation() {
    if (!currentDocument || !selectedAnnotationId) {
      return;
    }
    mutateBundle((draft) => {
      const document = draft.documents.find((item) => item.id === currentDocument.id);
      if (!document) {
        return;
      }
      document.annotations = document.annotations.filter((annotation) => annotation.id !== selectedAnnotationId);
    });
    setSelectedAnnotationId(null);
  }

  async function handleSave() {
    if (!bundle || !snapshot) {
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveProjectBundle(token, snapshot, bundle);
      setBundle(saved);
      setSnapshot(deepClone(saved));
      showToast("保存した", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存に失敗した", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!bundle || !currentDocument) {
      return;
    }
    mutateBundle((draft) => {
      const document = draft.documents.find((item) => item.id === currentDocument.id);
      if (!document) {
        return;
      }
      setDocumentStatus(document, "verified");
      document.annotations.forEach((annotation) => {
        annotation.status = "verified";
      });
    });
    if (snapshot) {
      await handleSave();
      const nextId = findNextPendingDocumentId(bundle, currentDocument.id);
      if (nextId) {
        setSelectedDocId(nextId);
      }
      showToast("Document を submit した", "success");
    }
  }

  function executePendingAction(action: PendingAction) {
    if (action.type === "doc") {
      setSelectedDocId(action.docId);
      setSelectedAnnotationId(null);
      setRightTab("examples");
      return;
    }
    if (action.type === "settings") {
      navigate(`/projects/${projectId}/settings`);
      return;
    }
    if (action.type === "workspace") {
      navigate(`/projects/${projectId}`);
      return;
    }
    navigate("/projects");
  }

  function requestAction(action: PendingAction) {
    if (dirty) {
      setPendingAction(action);
      return;
    }
    executePendingAction(action);
  }

  async function resolvePendingAction(mode: "save" | "discard") {
    if (!pendingAction) {
      return;
    }
    const action = pendingAction;
    setPendingAction(null);
    if (mode === "save") {
      await handleSave();
      executePendingAction(action);
      return;
    }
    if (snapshot) {
      setBundle(deepClone(snapshot));
    }
    executePendingAction(action);
  }

  function handleCreateAnnotation(start: number, end: number, text: string) {
    if (!bundle || !currentDocument || !focusedLabel) {
      return;
    }
    const hasOverlap = currentDocument.annotations.some(
      (annotation) =>
        annotation.label_id === focusedLabel.id &&
        annotation.start < end &&
        annotation.end > start,
    );
    if (hasOverlap) {
      showToast("同一ラベル内で重複する span は作成できない", "warning");
      return;
    }
    const nextAnnotation: AnnotationRecord = {
      id: makeLocalId("annotation"),
      document_id: currentDocument.id,
      document_name: currentDocument.document_name,
      label_id: focusedLabel.id,
      label_name: focusedLabel.name,
      start,
      end,
      span_text: text,
      comment: "",
      status: "pending",
      meta: {},
    };
    mutateBundle((draft) => {
      const document = draft.documents.find((item) => item.id === currentDocument.id);
      document?.annotations.push(nextAnnotation);
    });
    setSelectedAnnotationId(nextAnnotation.id);
    setRightTab("annotations");
  }

  async function handleSettingsImport() {
    if (!settingsImportFile || !bundle) {
      return;
    }
    try {
      const payload = await readJsonFile(settingsImportFile);
      await api.importProject(token, bundle.project.id, payload);
      showToast("現在の project に import した", "success");
      setSettingsImportFile(null);
      await loadBundle();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Import に失敗した", "error");
    }
  }

  async function handleExport() {
    if (!bundle) {
      return;
    }
    try {
      const payload = await api.exportProject(token, bundle.project.id, exportPending, exportVerified);
      downloadJson(buildExportFilename(bundle.project), payload);
      showToast("Export を開始した", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Export に失敗した", "error");
    }
  }

  if (loading || !bundle) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  const groupedAnnotations = currentDocument ? groupAnnotationsByLabel(currentDocument, bundle.labels) : [];

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: "blur(10px)", borderBottom: "1px solid #d7e2f0" }}>
        <Toolbar sx={{ gap: 2 }}>
          <Button color="inherit" startIcon={<ArrowBackRoundedIcon />} onClick={() => requestAction({ type: "projects" })}>
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
          <Tabs value={view} onChange={(_event, value) => requestAction({ type: value })} sx={{ minHeight: 0 }}>
            <Tab value="workspace" label="Workspace" icon={<WorkspacesRoundedIcon />} iconPosition="start" />
            <Tab value="settings" label="Project Settings" icon={<SettingsRoundedIcon />} iconPosition="start" />
          </Tabs>
          <Tooltip title="ショートカット一覧">
            <IconButton onClick={() => setShortcutOpen(true)}>
              <HelpOutlineRoundedIcon />
            </IconButton>
          </Tooltip>
          <Button onClick={onLogout} color="inherit" startIcon={<LogoutRoundedIcon />}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 2, display: "grid", gap: 2, gridTemplateColumns: view === "workspace" ? "320px minmax(540px,1fr) 380px" : "320px minmax(0,1fr)" }}>
        <Paper sx={{ minHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column" }}>
          <Box sx={{ p: 2, display: "grid", gap: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle1">Documents</Typography>
                <Typography variant="body2" color="text.secondary">
                  {bundle.documents.filter((document) => getDocumentStatus(document) === "pending").length} pending / {bundle.documents.length} docs
                </Typography>
              </Box>
              <Tooltip title="Create Document">
                <IconButton onClick={() => setCreateDocOpen(true)}>
                  <AddRoundedIcon />
                </IconButton>
              </Tooltip>
            </Stack>
            <TextField
              placeholder="本文検索"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField select size="small" label="並び順" value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <MenuItem value="name">document_name 順</MenuItem>
              <MenuItem value="pending">未完了優先</MenuItem>
            </TextField>
          </Box>
          <Divider />
          <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1, overflow: "auto" }}>
            {currentHiddenBySearch ? (
              <Alert severity="info" action={<Button onClick={() => setSearchQuery("")}>検索クリア</Button>}>
                現在表示中の Document は検索結果外である。
              </Alert>
            ) : null}
            {visibleDocuments.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Typography variant="subtitle2">一致する Document がない</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  検索条件を見直すか、新しい Document を作成する。
                </Typography>
              </Paper>
            ) : null}
            {visibleDocuments.map((document) => (
              <Tooltip
                key={document.id}
                placement="right-start"
                arrow
                title={
                  <Box sx={{ maxWidth: 360, p: 0.5 }}>
                    <Typography variant="subtitle2">{document.document_name}</Typography>
                    <Typography variant="caption" sx={{ display: "block", color: "rgba(255,255,255,0.72)", mb: 1 }}>
                      Hover preview
                    </Typography>
                    <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                      {getDocumentHoverPreview(document, searchQuery)}
                    </Typography>
                  </Box>
                }
              >
                <ListItemButton
                  selected={document.id === currentDocument?.id}
                  onClick={() => requestAction({ type: "doc", docId: document.id })}
                  sx={{ alignItems: "flex-start", borderRadius: 3, border: "1px solid", borderColor: document.id === currentDocument?.id ? "primary.main" : "#dbe3ee" }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                        <Typography variant="subtitle2" noWrap>
                          {document.document_name}
                        </Typography>
                        <Chip size="small" label={getDocumentStatus(document)} color={getDocumentStatus(document) === "verified" ? "success" : "warning"} />
                      </Stack>
                    }
                    secondary={
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        {getDocumentSnippet(document, searchQuery)}
                      </Typography>
                    }
                  />
                </ListItemButton>
              </Tooltip>
            ))}
          </Box>
        </Paper>

        {view === "workspace" ? (
          <>
            <Box sx={{ display: "grid", gap: 2, minHeight: "calc(100vh - 96px)", gridTemplateRows: "auto minmax(0,1fr) auto" }}>
              <Paper sx={{ px: 1.5, py: 1.25, display: "flex", gap: 1, overflowX: "auto", minHeight: 58, alignItems: "center" }}>
                {bundle.labels.map((label) => {
                  const active = label.id === focusedLabel?.id;
                  return (
                    <Chip
                      key={label.id}
                      label={label.name}
                      onClick={() => {
                        setFocusedLabelId(label.id);
                        setSelectedAnnotationId(null);
                      }}
                      sx={{
                        height: 30,
                        px: 0.25,
                        color: active ? "#fff" : label.color,
                        backgroundColor: active ? label.color : alpha(label.color, 0.08),
                        border: `1px solid ${alpha(label.color, active ? 0.4 : 0.24)}`,
                        "& .MuiChip-label": {
                          px: 1,
                          fontWeight: 600,
                          fontSize: 13,
                        },
                      }}
                    />
                  );
                })}
              </Paper>

              {currentDocument ? (
                <DocumentCanvas
                  document={currentDocument}
                  labels={bundle.labels}
                  focusedLabelId={focusedLabel?.id ?? null}
                  selectedAnnotationId={selectedAnnotationId}
                  onFocusLabel={setFocusedLabelId}
                  onSelectAnnotation={setSelectedAnnotationId}
                  onCreateAnnotation={handleCreateAnnotation}
                  onClearSelection={() => setSelectedAnnotationId(null)}
                />
              ) : (
                <Paper sx={{ p: 4 }}>
                  <Typography variant="h6">Document がない</Typography>
                </Paper>
              )}

              <Stack
                direction="row"
                spacing={1}
                sx={{
                  ml: "auto",
                  alignItems: "center",
                  pb: 1,
                }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SaveRoundedIcon />}
                  onClick={() => void handleSave()}
                  disabled={!dirty || saving}
                  sx={{ minWidth: 72, borderRadius: 1.5 }}
                >
                  Save
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  endIcon={<TaskAltRoundedIcon />}
                  onClick={() => void handleSubmit()}
                  disabled={!currentDocument || saving}
                  sx={{ minWidth: 84, borderRadius: 1.5 }}
                >
                  Submit
                </Button>
              </Stack>
            </Box>

            <Paper sx={{ minHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column" }}>
              <Tabs value={rightTab} onChange={(_event, value) => setRightTab(value)} variant="fullWidth">
                <Tab value="examples" label="関連例" />
                <Tab value="annotations" label="注釈一覧" />
              </Tabs>
              <Divider />
              <Box sx={{ p: 2, display: "grid", gap: 2, overflow: "auto" }}>
                {rightTab === "examples" ? (
                  <>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2">{focusedLabel?.name ?? "Label"} アノテーション基準</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2, whiteSpace: "pre-wrap" }}>
                        {focusedLabel?.description || getProjectGuideline(bundle.project) || "ガイドライン未設定"}
                      </Typography>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2">同一ラベルの他アノテーション</Typography>
                      <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                        {sameLabelExamples.map(({ document, annotation, duplicateCount, duplicates }) => {
                          const snippet = contextSnippet(document.text, annotation.start, annotation.end);
                          return (
                            <Tooltip
                              key={annotation.id}
                              placement="left-start"
                              arrow
                              title={
                                <Box sx={{ maxWidth: 360, p: 0.5 }}>
                                  <Typography variant="subtitle2">
                                    {annotation.span_text} / {duplicateCount}件の事例
                                  </Typography>
                                  <Stack spacing={1} sx={{ mt: 1 }}>
                                    {duplicates.map((item) => (
                                      <Box key={item.annotation.id}>
                                        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                          {item.document.document_name}
                                        </Typography>
                                        <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                                          {contextSnippet(item.document.text, item.annotation.start, item.annotation.end, 42).before}
                                          <Box component="span" sx={{ fontWeight: 700 }}>
                                            {item.annotation.span_text}
                                          </Box>
                                          {contextSnippet(item.document.text, item.annotation.start, item.annotation.end, 42).after}
                                        </Typography>
                                      </Box>
                                    ))}
                                  </Stack>
                                </Box>
                              }
                            >
                              <Paper
                                variant="outlined"
                                sx={{ p: 1.5, cursor: "pointer" }}
                                onClick={() => {
                                  if (document.id !== currentDocument?.id) {
                                    requestAction({ type: "doc", docId: document.id });
                                  }
                                  setFocusedLabelId(annotation.label_id);
                                  setSelectedAnnotationId(annotation.id);
                                  setRightTab("annotations");
                                }}
                              >
                                <Stack direction="row" justifyContent="space-between" spacing={1}>
                                  <Typography variant="caption" color="text.secondary">
                                    {document.document_name}
                                  </Typography>
                                  <Chip size="small" label={annotation.status} color={annotation.status === "verified" ? "success" : "warning"} />
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                  {annotation.span_text} / {duplicateCount}件の事例
                                </Typography>
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                  <Box component="span" color="text.disabled">
                                    {snippet.before}
                                  </Box>
                                  <Box component="span" sx={{ fontWeight: 700 }}>
                                    {snippet.focus}
                                  </Box>
                                  <Box component="span" color="text.disabled">
                                    {snippet.after}
                                  </Box>
                                </Typography>
                              </Paper>
                            </Tooltip>
                          );
                        })}
                        {sameLabelExamples.length === 0 ? <Typography color="text.secondary">該当なし</Typography> : null}
                      </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2">同一表層の他アノテーション</Typography>
                      <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                        {sameSurfaceExamples.map(({ document, annotation }) => (
                          <Tooltip
                            key={annotation.id}
                            placement="left-start"
                            arrow
                            title={
                              <Box sx={{ maxWidth: 360, p: 0.5 }}>
                                <Typography variant="subtitle2">{document.document_name}</Typography>
                                <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.7 }}>
                                  {contextSnippet(document.text, annotation.start, annotation.end, 42).before}
                                  <Box component="span" sx={{ fontWeight: 700 }}>
                                    {annotation.span_text}
                                  </Box>
                                  {contextSnippet(document.text, annotation.start, annotation.end, 42).after}
                                </Typography>
                              </Box>
                            }
                          >
                            <Paper variant="outlined" sx={{ p: 1.5 }}>
                              <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" color="text.secondary">
                                  {document.document_name}
                                </Typography>
                                <Chip
                                  size="small"
                                  label={annotation.label_name}
                                  sx={{
                                    color: bundle.labels.find((label) => label.id === annotation.label_id)?.color ?? "primary.main",
                                    bgcolor: alpha(
                                      bundle.labels.find((label) => label.id === annotation.label_id)?.color ?? "#1a73e8",
                                      0.12,
                                    ),
                                  }}
                                />
                              </Stack>
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                {annotation.span_text}
                              </Typography>
                            </Paper>
                          </Tooltip>
                        ))}
                        {!selectedAnnotation ? (
                          <Typography color="text.secondary">Annotation を選択すると同一表層の事例が出る。</Typography>
                        ) : null}
                      </Stack>
                    </Paper>
                  </>
                ) : (
                  <>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2">選択中 Annotation</Typography>
                        <Button size="small" id="annotation-edit-toggle" onClick={() => setAnnotationEditCollapsed((current) => !current)}>
                          {annotationEditCollapsed ? "▶" : "▼"}
                        </Button>
                      </Stack>
                      {selectedAnnotation && !annotationEditCollapsed ? (
                        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                          <Autocomplete
                            options={["pending", "verified"]}
                            value={selectedAnnotation.status}
                            renderInput={(params) => <TextField {...params} label="Status" size="small" />}
                            onChange={(_event, value) => {
                              if (!value || !currentDocument) {
                                return;
                              }
                              mutateBundle((draft) => {
                                const document = draft.documents.find((item) => item.id === currentDocument.id);
                                const annotation = document?.annotations.find((item) => item.id === selectedAnnotation.id);
                                if (annotation) {
                                  annotation.status = value as StatusValue;
                                }
                              });
                            }}
                          />
                          <TextField
                            label="Comment"
                            multiline
                            minRows={3}
                            value={selectedAnnotation.comment}
                            onChange={(event) => {
                              if (!currentDocument) {
                                return;
                              }
                              const value = event.target.value;
                              mutateBundle((draft) => {
                                const document = draft.documents.find((item) => item.id === currentDocument.id);
                                const annotation = document?.annotations.find((item) => item.id === selectedAnnotation.id);
                                if (annotation) {
                                  annotation.comment = value;
                                }
                              });
                            }}
                          />
                          <TextField
                            label="Meta (JSON)"
                            multiline
                            minRows={3}
                            value={JSON.stringify(selectedAnnotation.meta ?? {}, null, 2)}
                            onChange={(event) => {
                              if (!currentDocument) {
                                return;
                              }
                              try {
                                const parsed = JSON.parse(event.target.value) as JsonObject;
                                mutateBundle((draft) => {
                                  const document = draft.documents.find((item) => item.id === currentDocument.id);
                                  const annotation = document?.annotations.find((item) => item.id === selectedAnnotation.id);
                                  if (annotation) {
                                    annotation.meta = parsed;
                                  }
                                });
                              } catch {
                                // 編集途中の不正JSONは保持せず無視する
                              }
                            }}
                          />
                          <Button
                            color="error"
                            variant="outlined"
                            startIcon={<DeleteOutlineRoundedIcon />}
                            onClick={() => deleteSelectedAnnotation()}
                          >
                            Delete annotation
                          </Button>
                        </Stack>
                      ) : selectedAnnotation ? (
                        <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                          折りたたみ中である。展開すると status / comment / meta を編集できる。
                        </Typography>
                      ) : (
                        <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                          Annotation を選択すると comment / status / meta を編集できる。
                        </Typography>
                      )}
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2">Doc アノテーション一覧</Typography>
                      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                        {groupedAnnotations.map(({ label, annotations }) => (
                          <Paper key={label.id} variant="outlined" sx={{ p: 1.5 }}>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              sx={{ cursor: "pointer" }}
                              onClick={() =>
                                setAccordionOpen((current) => ({
                                  ...current,
                                  [label.id]: !(current[label.id] ?? true),
                                }))
                              }
                            >
                              <Typography variant="caption">{accordionOpen[label.id] ?? true ? "▼" : "▶"}</Typography>
                              <LabelRoundedIcon sx={{ color: label.color, fontSize: 18 }} />
                              <Typography variant="subtitle2">{label.name}</Typography>
                              <Chip size="small" label={annotations.length} />
                            </Stack>
                            <Stack spacing={1} sx={{ mt: 1.25, display: accordionOpen[label.id] ?? true ? "flex" : "none" }}>
                              {annotations.map((annotation) => {
                                const snippet = contextSnippet(currentDocument?.text ?? "", annotation.start, annotation.end, 10);
                                return (
                                  <Paper
                                    key={annotation.id}
                                    variant="outlined"
                                    sx={{
                                      p: 1.25,
                                      cursor: "pointer",
                                      borderColor: annotation.id === selectedAnnotationId ? "primary.main" : undefined,
                                    }}
                                    onClick={() => {
                                      setFocusedLabelId(annotation.label_id);
                                      setSelectedAnnotationId(annotation.id);
                                    }}
                                  >
                                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                                      <Typography variant="caption" color="text.secondary">
                                        {annotation.start}-{annotation.end}
                                      </Typography>
                                      <Chip size="small" label={annotation.status} color={annotation.status === "verified" ? "success" : "warning"} />
                                    </Stack>
                                    <Typography variant="body2" sx={{ mt: 0.75 }}>
                                      <Box component="span" color="text.disabled">
                                        {snippet.before}
                                      </Box>
                                      <Box component="span" sx={{ fontWeight: 700 }}>
                                        {snippet.focus}
                                      </Box>
                                      <Box component="span" color="text.disabled">
                                        {snippet.after}
                                      </Box>
                                    </Typography>
                                  </Paper>
                                );
                              })}
                              {annotations.length === 0 ? <Typography color="text.secondary">Annotation なし</Typography> : null}
                            </Stack>
                          </Paper>
                        ))}
                      </Stack>
                    </Paper>
                  </>
                )}
              </Box>
            </Paper>
          </>
        ) : (
          <Paper sx={{ minHeight: "calc(100vh - 96px)", p: 3, display: "grid", gap: 3, alignContent: "start" }}>
            <Box>
              <Typography variant="h5">Project Settings</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Label 定義、ガイドライン、Import / Export をここで管理する。
              </Typography>
            </Box>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="subtitle1">Project</Typography>
              <Stack spacing={2} sx={{ mt: 2 }}>
                <TextField
                  label="Project name"
                  value={bundle.project.name}
                  onChange={(event) =>
                    mutateBundle((draft) => {
                      draft.project.name = event.target.value;
                    })
                  }
                />
                <TextField
                  label="Description"
                  multiline
                  minRows={2}
                  value={bundle.project.description ?? ""}
                  onChange={(event) =>
                    mutateBundle((draft) => {
                      draft.project.description = event.target.value;
                    })
                  }
                />
                <TextField
                  label="Guideline"
                  multiline
                  minRows={4}
                  value={getProjectGuideline(bundle.project)}
                  onChange={(event) =>
                    mutateBundle((draft) => {
                      setProjectGuideline(draft.project, event.target.value);
                    })
                  }
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={getProjectShortcutHelpEnabled(bundle.project)}
                      onChange={(event) =>
                        mutateBundle((draft) => {
                          setProjectShortcutHelpEnabled(draft.project, event.target.checked);
                        })
                      }
                    />
                  }
                  label="ショートカットヘルプを有効化"
                />
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="subtitle1">Labels</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2, alignItems: "flex-start" }}>
                <Stack spacing={1.5} sx={{ minWidth: 320, flex: 1 }}>
                  <TextField label="Name" value={labelDraft.name} onChange={(event) => setLabelDraft((current) => ({ ...current, name: event.target.value }))} />
                  <TextField label="Color" value={labelDraft.color} onChange={(event) => setLabelDraft((current) => ({ ...current, color: event.target.value }))} />
                  <TextField label="Description" multiline minRows={3} value={labelDraft.description} onChange={(event) => setLabelDraft((current) => ({ ...current, description: event.target.value }))} />
                  <TextField label="Shortcut" value={labelDraft.shortcut} onChange={(event) => setLabelDraft((current) => ({ ...current, shortcut: event.target.value }))} />
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      startIcon={<AddRoundedIcon />}
                      onClick={() => {
                        if (!labelDraft.name.trim() || !bundle) {
                          return;
                        }
                        const existing = bundle.labels.find((label) => label.name === labelDraft.name.trim());
                        if (existing && !labelDraft.id) {
                          showToast("同名 label は追加できない", "warning");
                          return;
                        }
                        mutateBundle((draft) => {
                          const nextLabel: LabelRecord = {
                            id: labelDraft.id || makeLocalId("label"),
                            project_id: draft.project.id,
                            project_name: draft.project.name,
                            name: labelDraft.name.trim(),
                            color: labelDraft.color,
                            description: labelDraft.description,
                            shortcut: labelDraft.shortcut || null,
                            meta: {},
                          };
                          const index = draft.labels.findIndex((label) => label.id === nextLabel.id);
                          if (index >= 0) {
                            draft.labels[index] = nextLabel;
                          } else {
                            draft.labels.push(nextLabel);
                          }
                        });
                        setLabelDraft({ id: "", name: "", color: "#1a73e8", description: "", shortcut: "" });
                      }}
                    >
                      {labelDraft.id ? "Update label" : "Add label"}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => setLabelDraft({ id: "", name: "", color: "#1a73e8", description: "", shortcut: "" })}
                    >
                      Clear
                    </Button>
                  </Stack>
                </Stack>
                <List sx={{ flex: 1, width: "100%", border: "1px solid #d7e2f0", borderRadius: 3, bgcolor: "#fff" }}>
                  {bundle.labels.map((label) => (
                    <ListItemButton
                      key={label.id}
                      onClick={() =>
                        setLabelDraft({
                          id: label.id,
                          name: label.name,
                          color: label.color,
                          description: label.description,
                          shortcut: label.shortcut ?? "",
                        })
                      }
                    >
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: label.color }} />
                            <Typography variant="subtitle2">{label.name}</Typography>
                          </Stack>
                        }
                        secondary={label.description}
                      />
                      <IconButton
                        edge="end"
                        color="error"
                        onClick={(event) => {
                          event.stopPropagation();
                          mutateBundle((draft) => {
                            draft.labels = draft.labels.filter((item) => item.id !== label.id);
                            draft.documents.forEach((document) => {
                              document.annotations = document.annotations.filter((annotation) => annotation.label_id !== label.id);
                            });
                          });
                          if (focusedLabelId === label.id) {
                            setFocusedLabelId(bundle.labels.find((item) => item.id !== label.id)?.id ?? null);
                          }
                        }}
                      >
                        <DeleteOutlineRoundedIcon />
                      </IconButton>
                    </ListItemButton>
                  ))}
                </List>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="subtitle1">Import / Export</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2 }}>
                <Stack spacing={1.5} sx={{ flex: 1 }}>
                  <Typography variant="subtitle2">現在 project への追記 import</Typography>
                  <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />}>
                    {settingsImportFile?.name ?? "Select JSON"}
                    <input hidden type="file" accept=".json,application/json" onChange={(event) => setSettingsImportFile(event.target.files?.[0] ?? null)} />
                  </Button>
                  <Button variant="contained" onClick={() => void handleSettingsImport()} disabled={!settingsImportFile}>
                    Import
                  </Button>
                </Stack>
                <Stack spacing={1.5} sx={{ flex: 1 }}>
                  <Typography variant="subtitle2">Export</Typography>
                  <FormControlLabel control={<Switch checked={exportPending} onChange={(event) => setExportPending(event.target.checked)} />} label="Include pending" />
                  <FormControlLabel control={<Switch checked={exportVerified} onChange={(event) => setExportVerified(event.target.checked)} />} label="Include verified" />
                  <Button variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={() => void handleExport()}>
                    Export JSON
                  </Button>
                </Stack>
              </Stack>
            </Paper>

            <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
              <Button variant="outlined" startIcon={<SaveRoundedIcon />} onClick={() => void handleSave()} disabled={!dirty || saving}>
                Save changes
              </Button>
            </Stack>
          </Paper>
        )}
      </Box>

      <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)}>
        <DialogTitle>未保存の変更がある</DialogTitle>
        <DialogContent>
          <Typography>保存して移動するか、変更を破棄して移動するかを選ぶ。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingAction(null)}>キャンセル</Button>
          <Button onClick={() => void resolvePendingAction("discard")}>破棄して移動</Button>
          <Button variant="contained" onClick={() => void resolvePendingAction("save")}>
            保存して移動
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createDocOpen} onClose={() => setCreateDocOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create Document</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField label="Document name" value={newDocName} onChange={(event) => setNewDocName(event.target.value)} />
          <TextField label="Text" multiline minRows={8} value={newDocText} onChange={(event) => setNewDocText(event.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDocOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!newDocName.trim() || !newDocText.trim()) {
                return;
              }
              const nextDocument: DocumentRecord = {
                id: makeLocalId("document"),
                project_id: bundle.project.id,
                project_name: bundle.project.name,
                document_name: newDocName.trim(),
                text: newDocText,
                annotations: [],
                meta: {
                  status: "pending",
                },
              };
              mutateBundle((draft) => {
                draft.documents.push(nextDocument);
              });
              setSelectedDocId(nextDocument.id);
              setCreateDocOpen(false);
              setNewDocName("");
              setNewDocText("");
            }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer anchor="right" open={shortcutOpen} onClose={() => setShortcutOpen(false)}>
        <Box sx={{ width: 360, p: 3, display: "grid", gap: 2 }}>
          <Typography variant="h6">Keyboard Shortcuts</Typography>
          <List dense>
            {[
              ["Cmd+S", "Save"],
              ["Cmd+Enter", "Submit"],
              ["?", "ショートカット一覧"],
              ["J / K", "Doc 移動"],
              ["H / L", "Label 移動"],
              ["[ / ]", "右ペインタブ切り替え"],
            ].map(([key, description]) => (
              <ListItemText key={key} primary={key} secondary={description} sx={{ my: 0.5 }} />
            ))}
          </List>
        </Box>
      </Drawer>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={closeToast}>
        <Alert onClose={closeToast} severity={toast.severity} variant="filled">
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void api
      .getMe(token)
      .then((response) => {
        if (!active) {
          return;
        }
        setUser(response);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        if (!active) {
          return;
        }
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function handleLogin(username: string, password: string) {
    setError("");
    setLoading(true);
    try {
      const response = await api.login(username, password);
      localStorage.setItem(TOKEN_KEY, response.access_token);
      setToken(response.access_token);
      const me = await api.getMe(response.access_token);
      setUser(me);
      navigate("/projects");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "ログインに失敗した");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    if (location.pathname !== "/login") {
      navigate("/login");
    }
  }

  if (loading && token && !user) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Routes>
      {!token || !user ? (
        <>
          <Route path="/login" element={<LoginPage loading={loading} error={error} onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : (
        <>
          <Route path="/login" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage token={token} user={user} onLogout={handleLogout} />} />
          <Route path="/projects/:projectId" element={<ProjectShell token={token} user={user} onLogout={handleLogout} />} />
          <Route path="/projects/:projectId/settings" element={<ProjectShell token={token} user={user} onLogout={handleLogout} />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </>
      )}
    </Routes>
  );
}
