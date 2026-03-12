import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";

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
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create Document</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
        <TextField label="Document name" value={documentName} onChange={(event) => onNameChange(event.target.value)} />
        <TextField label="Text" multiline minRows={8} value={documentText} onChange={(event) => onTextChange(event.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onCreate} disabled={saving}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
