import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { useI18n } from "../../i18n/useI18n";

export function CreateProjectDialog({
  open,
  saving,
  projectName,
  projectDescription,
  onNameChange,
  onDescriptionChange,
  onClose,
  onCreate,
}: {
  open: boolean;
  saving: boolean;
  projectName: string;
  projectDescription: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("projects.dialogs.create.title")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
        <Typography color="text.secondary">{t("projects.dialogs.create.description")}</Typography>
        <Stack spacing={2}>
          <TextField autoFocus label={t("projects.dialogs.create.projectName")} value={projectName} onChange={(event) => onNameChange(event.target.value)} />
          <TextField
            label={t("projects.dialogs.create.descriptionField")}
            multiline
            minRows={3}
            value={projectDescription}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t("projects.dialogs.create.cancel")}
        </Button>
        <Button variant="contained" onClick={onCreate} disabled={saving || !projectName.trim()}>
          {t("projects.dialogs.create.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
