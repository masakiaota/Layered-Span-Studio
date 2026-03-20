import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useI18n } from "../../i18n/useI18n";

export function CreateDocumentDialog({
  open,
  saving,
  documentName,
  documentText,
  onNameChange,
  onTextChange,
  onClose,
  onCreate,
}: {
  open: boolean;
  saving: boolean;
  documentName: string;
  documentText: string;
  onNameChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("projectShell.dialogs.createDocument.title")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
        <TextField label={t("projectShell.dialogs.createDocument.documentName")} value={documentName} onChange={(event) => onNameChange(event.target.value)} />
        <TextField label={t("projectShell.dialogs.createDocument.text")} multiline minRows={8} value={documentText} onChange={(event) => onTextChange(event.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("projectShell.dialogs.createDocument.cancel")}</Button>
        <Button variant="contained" onClick={onCreate} disabled={saving}>
          {t("projectShell.dialogs.createDocument.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
