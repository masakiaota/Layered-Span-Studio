import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

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
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Project を削除する</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5, pt: 2 }}>
        <Typography>"{projectName}" を削除する。</Typography>
        <Typography color="text.secondary">配下 document / annotation / label も含めて削除される。</Typography>
        <Typography color="text.secondary">この操作は元に戻せない。</Typography>
        {dirty ? <Alert severity="warning">未保存の変更も破棄される。</Alert> : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          キャンセル
        </Button>
        <Button color="error" variant="contained" onClick={onDelete} disabled={busy}>
          削除
        </Button>
      </DialogActions>
    </Dialog>
  );
}
