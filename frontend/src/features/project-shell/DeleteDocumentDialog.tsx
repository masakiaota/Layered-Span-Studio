import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

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
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Document を削除する</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5, pt: 2 }}>
        <Typography>"{documentName}" を削除する。</Typography>
        <Typography color="text.secondary">配下 annotation も含めて削除される。</Typography>
        <Typography color="text.secondary">この操作は元に戻せない。</Typography>
        {currentDocumentDirty ? <Alert severity="warning">未保存の変更も破棄される。</Alert> : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          キャンセル
        </Button>
        <Button ref={confirmButtonRef} color="error" variant="contained" onClick={onDelete} disabled={busy}>
          削除 ↵
        </Button>
      </DialogActions>
    </Dialog>
  );
}
