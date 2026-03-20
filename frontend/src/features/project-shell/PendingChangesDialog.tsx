import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useI18n } from "../../i18n/useI18n";

export function PendingChangesDialog({
  open,
  confirmButtonRef,
  onClose,
  onDiscard,
  onSave,
}: {
  open: boolean;
  confirmButtonRef: React.Ref<HTMLButtonElement>;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t("projectShell.dialogs.pendingChanges.title")}</DialogTitle>
      <DialogContent>
        <Typography>{t("projectShell.dialogs.pendingChanges.description")}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("projectShell.dialogs.pendingChanges.cancel")}</Button>
        <Button onClick={onDiscard}>{t("projectShell.dialogs.pendingChanges.discard")}</Button>
        <Button ref={confirmButtonRef} variant="outlined" onClick={onSave}>
          {t("projectShell.dialogs.pendingChanges.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
