import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";

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
  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create Project</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
        <Typography color="text.secondary">
          空の project を作成する。作成後は Project Settings へ移動し、label 定義や import を続けられる。
        </Typography>
        <Stack spacing={2}>
          <TextField
            autoFocus
            label="Project name"
            value={projectName}
            onChange={(event) => onNameChange(event.target.value)}
          />
          <TextField
            label="Description"
            multiline
            minRows={3}
            value={projectDescription}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onCreate} disabled={saving || !projectName.trim()}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
