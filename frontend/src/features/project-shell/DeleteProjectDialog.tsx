import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useI18n } from "../../i18n/useI18n";

export function DeleteProjectDialog({
  open,
  busy,
  projectName,
  dirty,
  onClose,
  onDelete,
}: {
  open: boolean;
  busy: boolean;
  projectName: string;
  dirty: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("projectShell.dialogs.deleteProject.title")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5, pt: 2 }}>
        <Typography>{t("projectShell.dialogs.deleteProject.deleteTarget", { name: projectName })}</Typography>
        <Typography color="text.secondary">{t("projectShell.dialogs.deleteProject.cascade")}</Typography>
        <Typography color="text.secondary">{t("projectShell.dialogs.deleteProject.irreversible")}</Typography>
        {dirty ? <Alert severity="warning">{t("projectShell.dialogs.deleteProject.unsavedChanges")}</Alert> : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("projectShell.dialogs.deleteProject.cancel")}
        </Button>
        <Button color="error" variant="contained" onClick={onDelete} disabled={busy}>
          {t("projectShell.dialogs.deleteProject.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
