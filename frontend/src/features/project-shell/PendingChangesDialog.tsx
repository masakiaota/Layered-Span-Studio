import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

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
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>未保存の変更がある</DialogTitle>
      <DialogContent>
        <Typography>保存して移動するか、変更を破棄して移動するかを選ぶ。</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={onDiscard}>破棄して移動</Button>
        <Button ref={confirmButtonRef} variant="outlined" onClick={onSave}>
          保存して移動 ↵
        </Button>
      </DialogActions>
    </Dialog>
  );
}
