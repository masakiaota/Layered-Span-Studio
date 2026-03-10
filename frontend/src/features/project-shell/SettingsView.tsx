import {
  Box,
  Button,
  FormControlLabel,
  IconButton,
  InputAdornment,
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
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import type { LabelDraft } from "./projectShellTypes";
import type { ProjectBundle } from "../../types";
import { getProjectGuideline } from "../../utils";

export function SettingsView({
  bundle,
  focusedLabelId,
  labelDraft,
  normalizedLabelColor,
  labelColorValid,
  labelColorPreview,
  labelColorInputRef,
  settingsImportFile,
  exportPending,
  exportVerified,
  dirty,
  saving,
  onProjectNameChange,
  onProjectDescriptionChange,
  onProjectGuidelineChange,
  onLabelDraftChange,
  onNormalizeLabelColor,
  onOpenColorPicker,
  onPickLabelColor,
  onSubmitLabelDraft,
  onResetLabelDraft,
  onSelectLabelDraft,
  onDeleteLabel,
  onImportFileChange,
  onImport,
  onExportPendingChange,
  onExportVerifiedChange,
  onExport,
  onSave,
}: {
  bundle: ProjectBundle;
  focusedLabelId: string | null;
  labelDraft: LabelDraft;
  normalizedLabelColor: string;
  labelColorValid: boolean;
  labelColorPreview: string;
  labelColorInputRef: React.Ref<HTMLInputElement>;
  settingsImportFile: File | null;
  exportPending: boolean;
  exportVerified: boolean;
  dirty: boolean;
  saving: boolean;
  onProjectNameChange: (value: string) => void;
  onProjectDescriptionChange: (value: string) => void;
  onProjectGuidelineChange: (value: string) => void;
  onLabelDraftChange: (draft: LabelDraft) => void;
  onNormalizeLabelColor: () => void;
  onOpenColorPicker: () => void;
  onPickLabelColor: (value: string) => void;
  onSubmitLabelDraft: () => void;
  onResetLabelDraft: () => void;
  onSelectLabelDraft: (draft: LabelDraft) => void;
  onDeleteLabel: (labelId: string) => void;
  onImportFileChange: (file: File | null) => void;
  onImport: () => void;
  onExportPendingChange: (checked: boolean) => void;
  onExportVerifiedChange: (checked: boolean) => void;
  onExport: () => void;
  onSave: () => void;
}) {
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
              <Stack spacing={1.5} sx={{ minWidth: 320, flex: 1 }}>
                <TextField
                  label="Name"
                  value={labelDraft.name}
                  onChange={(event) => onLabelDraftChange({ ...labelDraft, name: event.target.value })}
                />
                <TextField
                  label="Color: 16進カラーコード"
                  value={labelDraft.color}
                  onChange={(event) => onLabelDraftChange({ ...labelDraft, color: event.target.value })}
                  onBlur={onNormalizeLabelColor}
                  error={labelDraft.color.trim().length > 0 && !labelColorValid}
                  helperText={labelDraft.color.trim().length > 0 && !labelColorValid ? "Color は #RRGGBB 形式で入力する" : undefined}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: 0.2 }}>
                            色見本
                          </Typography>
                          <Box
                            aria-label="Selected color preview"
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: 1.2,
                              bgcolor: labelColorPreview,
                              border: `1px solid ${alpha("#16324f", 0.16)}`,
                              boxShadow: `inset 0 0 0 1px ${alpha("#ffffff", 0.35)}`,
                            }}
                          />
                        </Stack>
                      </InputAdornment>
                    ),
                  }}
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
                  <Button variant="outlined" startIcon={<PaletteRoundedIcon />} onClick={onOpenColorPicker} sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}>
                    色を選ぶ
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ minHeight: 20, display: "flex", alignItems: "center" }}>
                    {labelColorValid ? `現在の色: ${normalizedLabelColor}` : "有効なカラーコードを入力すると色見本に反映される"}
                  </Typography>
                  <Box
                    component="input"
                    ref={labelColorInputRef}
                    type="color"
                    aria-label="Pick label color"
                    value={labelColorPreview}
                    onChange={(event) => onPickLabelColor(event.target.value)}
                    sx={{
                      position: "absolute",
                      width: 1,
                      height: 1,
                      p: 0,
                      m: -1,
                      overflow: "hidden",
                      clip: "rect(0 0 0 0)",
                      whiteSpace: "nowrap",
                      border: 0,
                    }}
                  />
                </Stack>
                <TextField
                  label="Description"
                  multiline
                  minRows={3}
                  value={labelDraft.description}
                  onChange={(event) => onLabelDraftChange({ ...labelDraft, description: event.target.value })}
                />
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onSubmitLabelDraft} disabled={!labelDraft.name.trim() || !labelColorValid}>
                    {labelDraft.id ? "Update label" : "Add label"}
                  </Button>
                  <Button variant="outlined" onClick={onResetLabelDraft}>
                    Clear
                  </Button>
                </Stack>
              </Stack>
              <List sx={{ flex: 1, width: "100%", border: "1px solid #d7e2f0", borderRadius: 3, bgcolor: "#fff" }}>
                {bundle.labels.map((label) => (
                  <ListItemButton
                    key={label.id}
                    selected={label.id === focusedLabelId}
                    onClick={() =>
                      onSelectLabelDraft({
                        id: label.id,
                        name: label.name,
                        color: label.color,
                        description: label.description,
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
                <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />}>
                  {settingsImportFile?.name ?? "Select JSON"}
                  <input hidden type="file" accept=".json,application/json" onChange={(event) => onImportFileChange(event.target.files?.[0] ?? null)} />
                </Button>
                <Button variant="contained" onClick={onImport} disabled={!settingsImportFile}>
                  Import
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
