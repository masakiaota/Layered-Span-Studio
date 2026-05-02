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
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import type { LabelDraft } from "./projectShellTypes";
import type { ProjectBundle } from "../../types";
import { getImportYourDataGuideUrl } from "../../externalLinks";
import { useI18n } from "../../i18n/useI18n";
import { getProjectGuideline } from "../../utils";

type LabelRowElement = {
  id: string;
  element: HTMLDivElement;
};

function sameOrder(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function labelRowsFromRefs(bundle: ProjectBundle, refs: Map<string, HTMLDivElement>) {
  return bundle.labels
    .map((label) => ({
      id: label.id,
      element: refs.get(label.id),
    }))
    .filter((item): item is LabelRowElement => Boolean(item.element));
}

function clearLabelRowStyles(rows: LabelRowElement[]) {
  for (const row of rows) {
    row.element.style.transition = "";
    row.element.style.transform = "";
    row.element.style.zIndex = "";
  }
}

function applyReleaseAnimation(nextIds: string[], visualTopById: Map<string, number>, refs: Map<string, HTMLDivElement>) {
  const rowsAfterCommit = nextIds
    .map((id) => ({
      id,
      element: refs.get(id),
    }))
    .filter((item): item is LabelRowElement => Boolean(item.element));

  for (const row of rowsAfterCommit) {
    const visualTop = visualTopById.get(row.id);
    if (visualTop === undefined) {
      continue;
    }
    const deltaY = visualTop - row.element.getBoundingClientRect().top;
    row.element.style.transition = "none";
    row.element.style.transform = deltaY === 0 ? "" : `translateY(${deltaY}px)`;
  }

  window.requestAnimationFrame(() => {
    for (const row of rowsAfterCommit) {
      row.element.style.transition = "transform 160ms ease";
      row.element.style.transform = "";
    }
  });
}

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
  onReorderLabel,
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
  onReorderLabel: (labelId: string, targetIndex: number) => void;
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
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  const labelRowRefs = useRef(new Map<string, HTMLDivElement>());

  function registerLabelRow(labelId: string, element: HTMLDivElement | null) {
    if (element) {
      labelRowRefs.current.set(labelId, element);
      return;
    }
    labelRowRefs.current.delete(labelId);
  }

  function startLabelDrag(event: React.PointerEvent<HTMLButtonElement>, labelId: string) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    const rows = labelRowsFromRefs(bundle, labelRowRefs.current);
    const ids = rows.map((item) => item.id);
    const from = ids.indexOf(labelId);
    const dragged = rows.find((item) => item.id === labelId);
    if (from < 0 || !dragged) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const handle = event.currentTarget;
    const rectById = new Map(rows.map((item) => [item.id, item.element.getBoundingClientRect()]));
    const draggedRect = rectById.get(labelId);
    const rowHeight = draggedRect?.height || dragged.element.getBoundingClientRect().height || 1;
    const remainingIds = ids.filter((id) => id !== labelId);
    let insertIndex = from;
    let latestClientY = event.clientY;
    let frameId = 0;

    function computeInsertIndex(clientY: number) {
      for (let index = 0; index < remainingIds.length; index += 1) {
        const rect = rectById.get(remainingIds[index]);
        if (rect && clientY < rect.top + rect.height / 2) {
          return index;
        }
      }
      return remainingIds.length;
    }

    function orderedIdsForInsert() {
      const nextIds = [...remainingIds];
      nextIds.splice(insertIndex, 0, labelId);
      return nextIds;
    }

    function applyTransforms() {
      frameId = 0;
      insertIndex = computeInsertIndex(latestClientY);
      const nextIds = orderedIdsForInsert();
      const nextIndexById = new Map(nextIds.map((id, index) => [id, index]));

      for (const item of rows) {
        if (item.id === labelId) {
          item.element.style.transform = `translateY(${latestClientY - event.clientY}px)`;
          continue;
        }
        const originalIndex = ids.indexOf(item.id);
        const nextIndex = nextIndexById.get(item.id);
        const deltaY = nextIndex === undefined ? 0 : (nextIndex - originalIndex) * rowHeight;
        item.element.style.transform = deltaY === 0 ? "" : `translateY(${deltaY}px)`;
      }
    }

    function flushScheduledTransforms() {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      applyTransforms();
    }

    function scheduleTransform(clientY: number) {
      latestClientY = clientY;
      if (!frameId) {
        frameId = window.requestAnimationFrame(applyTransforms);
      }
    }

    function cleanup({ clearTransforms }: { clearTransforms: boolean }) {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (clearTransforms) {
        clearLabelRowStyles(rows);
      }
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("keydown", onKeyDown);
      if (handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      setDraggingLabelId(null);
    }

    function commitWithReleaseAnimation(nextIds: string[]) {
      const visualTopById = new Map(rows.map((item) => [item.id, item.element.getBoundingClientRect().top]));
      cleanup({ clearTransforms: false });
      clearLabelRowStyles(rows);

      flushSync(() => {
        onReorderLabel(labelId, nextIds.indexOf(labelId));
      });

      applyReleaseAnimation(nextIds, visualTopById, labelRowRefs.current);
    }

    function finish(commit: boolean) {
      flushScheduledTransforms();
      const nextIds = orderedIdsForInsert();
      if (commit && !sameOrder(ids, nextIds)) {
        commitWithReleaseAnimation(nextIds);
        return;
      }
      cleanup({ clearTransforms: true });
    }

    function onPointerMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();
      scheduleTransform(moveEvent.clientY);
    }

    function onPointerUp(upEvent: PointerEvent) {
      upEvent.preventDefault();
      finish(true);
    }

    function onPointerCancel(cancelEvent: PointerEvent) {
      cancelEvent.preventDefault();
      finish(false);
    }

    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        finish(false);
      }
    }

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    setDraggingLabelId(labelId);
    for (const item of rows) {
      item.element.style.transition = item.id === labelId ? "none" : "transform 120ms ease";
      if (item.id === labelId) {
        item.element.style.zIndex = "2";
      }
    }
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("keydown", onKeyDown);
    scheduleTransform(event.clientY);
  }

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
                    ref={(element) => registerLabelRow(label.id, element)}
                    selected={label.id === selectedLabelId}
                    onClick={() => onSelectLabel(label.id)}
                    sx={{
                      transition: "background-color 120ms ease, box-shadow 120ms ease, transform 160ms ease",
                      ...(draggingLabelId === label.id
                        ? {
                            bgcolor: alpha(label.color, 0.12),
                            boxShadow: `inset 3px 0 0 ${label.color}`,
                            zIndex: 1,
                          }
                        : {}),
                    }}
                  >
                    <Box
                      component="button"
                      type="button"
                      aria-label={t("projectShell.settings.dragLabel", { name: label.name })}
                      onPointerDown={(event) => {
                        startLabelDrag(event, label.id);
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                      sx={{
                        alignSelf: "stretch",
                        width: 32,
                        minWidth: 32,
                        mr: 1,
                        p: 0,
                        border: 0,
                        borderRight: "1px solid",
                        borderColor: alpha("#16324f", 0.1),
                        bgcolor: "transparent",
                        color: "text.secondary",
                        cursor: draggingLabelId === label.id ? "grabbing" : "grab",
                        touchAction: "none",
                        display: "grid",
                        placeItems: "center",
                        "&:hover": {
                          color: "primary.main",
                          bgcolor: alpha("#1a73e8", 0.06),
                        },
                        "&:focus-visible": {
                          outline: "2px solid",
                          outlineColor: "primary.main",
                          outlineOffset: -2,
                        },
                      }}
                    >
                      <MenuRoundedIcon fontSize="small" />
                    </Box>
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
