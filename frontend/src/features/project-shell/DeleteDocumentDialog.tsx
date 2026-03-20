import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useI18n } from "../../i18n/useI18n";

export function DeleteDocumentDialog({
  open,
  busy,
  documentName,
  currentDocumentDirty,
  confirmButtonRef,
  onClose,
  onDelete,
}: {
  open: boolean;
  busy: boolean;
  documentName: string;
  currentDocumentDirty: boolean;
  confirmButtonRef: React.Ref<HTMLButtonElement>;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("projectShell.dialogs.deleteDocument.title")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5, pt: 2 }}>
        <Typography>{t("projectShell.dialogs.deleteDocument.deleteTarget", { name: documentName })}</Typography>
        <Typography color="text.secondary">{t("projectShell.dialogs.deleteDocument.cascade")}</Typography>
        <Typography color="text.secondary">{t("projectShell.dialogs.deleteDocument.irreversible")}</Typography>
        {currentDocumentDirty ? <Alert severity="warning">{t("projectShell.dialogs.deleteDocument.unsavedChanges")}</Alert> : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("projectShell.dialogs.deleteDocument.cancel")}
        </Button>
        <Button ref={confirmButtonRef} color="error" variant="contained" onClick={onDelete} disabled={busy}>
          {t("projectShell.dialogs.deleteDocument.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
