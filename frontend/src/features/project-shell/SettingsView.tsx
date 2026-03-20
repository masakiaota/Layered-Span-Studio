import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link,
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
import { getImportYourDataGuideUrl } from "../../externalLinks";
import { useI18n } from "../../i18n/useI18n";
import { getProjectGuideline } from "../../utils";

export function SettingsView({
  bundle,
  selectedLabelId,
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
  importing,
  importFeedback,
  onProjectNameChange,
  onProjectDescriptionChange,
  onProjectGuidelineChange,
  onLabelDraftChange,
  onNormalizeLabelColor,
  onOpenColorPicker,
  onPickLabelColor,
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
  importing: boolean;
  importFeedback: { severity: "success" | "info" | "warning" | "error"; message: string } | null;
  onProjectNameChange: (value: string) => void;
  onProjectDescriptionChange: (value: string) => void;
  onProjectGuidelineChange: (value: string) => void;
  onLabelDraftChange: (draft: LabelDraft) => void;
  onNormalizeLabelColor: () => void;
  onOpenColorPicker: () => void;
  onPickLabelColor: (value: string) => void;
  onSubmitLabelDraft: () => void;
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
  const { locale, t } = useI18n();
  const guideUrl = getImportYourDataGuideUrl(locale);

  return (
    <Box sx={{ display: "grid", gap: 2, height: "100%", minHeight: 0, gridTemplateRows: "minmax(0,1fr) auto" }}>
      <Paper sx={{ height: "100%", minHeight: 0, overflow: "auto" }}>
        <Box sx={{ p: 3, display: "grid", gap: 3, alignContent: "start" }}>
          <Box>
            <Typography variant="h5">{t("projectShell.settings.title")}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {t("projectShell.settings.description")}
            </Typography>
          </Box>

          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1">{t("projectShell.settings.projectTitle")}</Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <TextField label={t("projectShell.settings.projectName")} value={bundle.project.name} onChange={(event) => onProjectNameChange(event.target.value)} />
              <TextField
                label={t("projectShell.settings.descriptionField")}
                multiline
                minRows={2}
                value={bundle.project.description ?? ""}
                onChange={(event) => onProjectDescriptionChange(event.target.value)}
              />
              <TextField
                label={t("projectShell.settings.guideline")}
                multiline
                minRows={4}
                value={getProjectGuideline(bundle.project)}
                onChange={(event) => onProjectGuidelineChange(event.target.value)}
              />
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1">{t("projectShell.settings.labelsTitle")}</Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2, alignItems: "flex-start" }}>
              <Stack spacing={1.5} sx={{ minWidth: 320, flex: 1 }}>
                <TextField
                  label={t("projectShell.settings.name")}
                  value={labelDraft.name}
                  onChange={(event) => onLabelDraftChange({ ...labelDraft, name: event.target.value })}
                />
                <TextField
                  label={t("projectShell.settings.color")}
                  value={labelDraft.color}
                  onChange={(event) => onLabelDraftChange({ ...labelDraft, color: event.target.value })}
                  onBlur={onNormalizeLabelColor}
                  error={labelDraft.color.trim().length > 0 && !labelColorValid}
                  helperText={labelDraft.color.trim().length > 0 && !labelColorValid ? t("projectShell.settings.invalidColorHelper") : undefined}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: 0.2 }}>
                            {t("projectShell.settings.colorPreview")}
                          </Typography>
                          <Box
                            aria-label={t("projectShell.settings.selectedColorPreview")}
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
                    {t("projectShell.settings.pickColorButton")}
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ minHeight: 20, display: "flex", alignItems: "center" }}>
                    {labelColorValid ? t("projectShell.settings.currentColor", { color: normalizedLabelColor }) : t("projectShell.settings.invalidColor")}
                  </Typography>
                  <Box
                    component="input"
                    ref={labelColorInputRef}
                    type="color"
                    aria-label={t("projectShell.settings.pickColor")}
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
                  label={t("projectShell.settings.labelDescription")}
                  multiline
                  minRows={3}
                  value={labelDraft.description}
                  onChange={(event) => onLabelDraftChange({ ...labelDraft, description: event.target.value })}
                />
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onSubmitLabelDraft} disabled={!labelDraft.name.trim() || !labelColorValid}>
                    {labelDraft.id ? t("projectShell.settings.updateLabel") : t("projectShell.settings.addLabel")}
                  </Button>
                  <Button variant="outlined" onClick={onResetLabelDraft}>
                    {t("projectShell.settings.clear")}
                  </Button>
                </Stack>
              </Stack>
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
                      aria-label={t("projectShell.settings.deleteLabel", { name: label.name })}
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
            <Typography variant="subtitle1">{t("projectShell.settings.importExportTitle")}</Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2 }}>
              <Stack spacing={1.5} sx={{ flex: 1 }}>
                <Typography variant="subtitle2">{t("projectShell.settings.importTitle")}</Typography>
                <Alert severity="info">
                  {t("projectShell.settings.importInfo")}
                </Alert>
                <Typography variant="body2" color="text.secondary">
                  {t("projectShell.settings.importGuidePrefix")}{" "}
                  <Link href={guideUrl} target="_blank" rel="noreferrer">
                    {t("projectShell.settings.importGuideLink")}
                  </Link>{" "}
                  {t("projectShell.settings.importGuideSuffix")}
                </Typography>
                {importFeedback ? <Alert severity={importFeedback.severity}>{importFeedback.message}</Alert> : null}
                <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />} disabled={importing}>
                  {settingsImportFile?.name ?? t("projectShell.settings.selectJson")}
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
                  {importing ? t("projectShell.settings.importing") : t("projectShell.settings.import")}
                </Button>
              </Stack>
              <Stack spacing={1.5} sx={{ flex: 1 }}>
                <Typography variant="subtitle2">{t("projectShell.settings.exportTitle")}</Typography>
                <FormControlLabel control={<Switch checked={exportPending} onChange={(event) => onExportPendingChange(event.target.checked)} />} label={t("projectShell.settings.includePending")} />
                <FormControlLabel control={<Switch checked={exportVerified} onChange={(event) => onExportVerifiedChange(event.target.checked)} />} label={t("projectShell.settings.includeVerified")} />
                <Button variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={onExport}>
                  {t("projectShell.settings.exportJson")}
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
              {t("projectShell.settings.dangerZone")}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {t("projectShell.settings.dangerDescription")}
            </Typography>
            <Button
              color="error"
              variant="contained"
              sx={{ mt: 2 }}
              onClick={onRequestDeleteProject}
              disabled={saving || importing || deletingProject}
            >
              {t("projectShell.settings.deleteProject")}
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
          {t("projectShell.settings.saveChanges")}
        </Button>
      </Stack>
    </Box>
  );
}
