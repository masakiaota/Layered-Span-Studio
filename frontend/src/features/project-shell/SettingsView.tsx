import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { LabelEditorForm } from "./LabelEditorForm";
import type { ProjectBundle } from "../../types";
import { getProjectGuideline } from "../../utils";

export function SettingsView({
  bundle,
  selectedLabelId,
  labelColorInputRef,
  settingsImportFile,
  exportPending,
  exportVerified,
  dirty,
  saving,
  importing,
  importFeedback,
  onProjectNameChange,
  onProjectDescriptionChange,
  onProjectGuidelineChange,
  onOpenColorPicker,
  onSubmitLabelDraft,
  onResetLabelDraft,
  onSelectLabel,
  onDeleteLabel,
  onImportFileChange,
  onImport,
  onExportPendingChange,
  onExportVerifiedChange,
  onExport,
  onSave,
  onRequestDeleteProject,
  deletingProject,
}: {
  bundle: ProjectBundle;
  selectedLabelId: string | null;
  labelColorInputRef: React.Ref<HTMLInputElement>;
  settingsImportFile: File | null;
  exportPending: boolean;
  exportVerified: boolean;
  dirty: boolean;
  saving: boolean;
  importing: boolean;
  importFeedback: { severity: "success" | "info" | "warning" | "error"; message: string } | null;
  onProjectNameChange: (value: string) => void;
  onProjectDescriptionChange: (value: string) => void;
  onProjectGuidelineChange: (value: string) => void;
  onOpenColorPicker: () => void;
  onSubmitLabelDraft: (draft: { id: string; name: string; color: string; description: string }) => void;
  onResetLabelDraft: () => void;
  onSelectLabel: (labelId: string) => void;
  onDeleteLabel: (labelId: string) => void;
  onImportFileChange: (file: File | null) => void;
  onImport: () => void;
  onExportPendingChange: (checked: boolean) => void;
  onExportVerifiedChange: (checked: boolean) => void;
  onExport: () => void;
  onSave: () => void;
  onRequestDeleteProject: () => void;
  deletingProject: boolean;
}) {
  const selectedLabel = selectedLabelId ? bundle.labels.find((label) => label.id === selectedLabelId) ?? null : null;

  return (
    <Box sx={{ display: "grid", gap: 2, height: "100%", minHeight: 0, gridTemplateRows: "minmax(0,1fr) auto" }}>
      <Paper sx={{ height: "100%", minHeight: 0, overflow: "auto" }}>
        <Box sx={{ p: 3, display: "grid", gap: 3, alignContent: "start" }}>
          <Box>
            <Typography variant="h5">Project Settings</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Label 定義、ガイドライン、Import / Export をここで管理する。
            </Typography>
          </Box>

          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1">Project</Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <TextField label="Project name" value={bundle.project.name} onChange={(event) => onProjectNameChange(event.target.value)} />
              <TextField
                label="Description"
                multiline
                minRows={2}
                value={bundle.project.description ?? ""}
                onChange={(event) => onProjectDescriptionChange(event.target.value)}
              />
              <TextField
                label="Guideline"
                multiline
                minRows={4}
                value={getProjectGuideline(bundle.project)}
                onChange={(event) => onProjectGuidelineChange(event.target.value)}
              />
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1">Labels</Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2, alignItems: "flex-start" }}>
              <LabelEditorForm
                selectedLabel={selectedLabel}
                labelColorInputRef={labelColorInputRef}
                onOpenColorPicker={onOpenColorPicker}
                onSubmit={onSubmitLabelDraft}
                onReset={onResetLabelDraft}
              />
              <List
                sx={{
                  flex: 1,
                  width: "100%",
                  border: "1px solid #d7e2f0",
                  borderRadius: 3,
                  bgcolor: "#fff",
                  overflow: "hidden",
                }}
              >
                {bundle.labels.map((label) => (
                  <ListItemButton
                    key={label.id}
                    selected={label.id === selectedLabelId}
                    onClick={() => onSelectLabel(label.id)}
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
                      aria-label={`${label.name} を削除`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteLabel(label.id);
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
                <Alert severity="info">
                  append 専用である。既存 project 本体は更新しない。構造不正や同名データは import 前または backend 側で失敗として扱う。
                </Alert>
                {importFeedback ? <Alert severity={importFeedback.severity}>{importFeedback.message}</Alert> : null}
                <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />} disabled={importing}>
                  {settingsImportFile?.name ?? "Select JSON"}
                  <input
                    hidden
                    type="file"
                    accept=".json,application/json"
                    onChange={(event) => {
                      onImportFileChange(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </Button>
                <Button variant="contained" onClick={onImport} disabled={!settingsImportFile || importing}>
                  {importing ? "Importing..." : "Import"}
                </Button>
              </Stack>
              <Stack spacing={1.5} sx={{ flex: 1 }}>
                <Typography variant="subtitle2">Export</Typography>
                <FormControlLabel control={<Switch checked={exportPending} onChange={(event) => onExportPendingChange(event.target.checked)} />} label="Include pending" />
                <FormControlLabel control={<Switch checked={exportVerified} onChange={(event) => onExportVerifiedChange(event.target.checked)} />} label="Include verified" />
                <Button variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={onExport}>
                  Export JSON
                </Button>
              </Stack>
            </Stack>
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              borderColor: alpha("#d32f2f", 0.32),
              bgcolor: alpha("#d32f2f", 0.03),
            }}
          >
            <Typography variant="subtitle1" color="error.main">
              Danger Zone
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Project 全体を削除する。配下の document、annotation、label もすべて失われる。
            </Typography>
            <Button
              color="error"
              variant="contained"
              sx={{ mt: 2 }}
              onClick={onRequestDeleteProject}
              disabled={saving || importing || deletingProject}
            >
              Project を削除
            </Button>
          </Paper>
        </Box>
      </Paper>

      <Stack direction="row" spacing={1} sx={{ ml: "auto", alignItems: "center", pb: 1 }}>
        <Button
          variant="contained"
          endIcon={<SaveRoundedIcon />}
          onClick={onSave}
          disabled={!dirty || saving}
          sx={{ minWidth: 148, minHeight: 40, px: 2.5, borderRadius: 1.5 }}
        >
          Save changes
        </Button>
      </Stack>
    </Box>
  );
}
