import { useRef, useState, type DragEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { IMPORT_YOUR_DATA_GUIDE_URL } from "../../externalLinks";

const INVALID_IMPORT_FILE_MESSAGE = "Import できるのは .json ファイルのみである";

function isJsonImportFile(file: File) {
  const normalizedName = file.name.trim().toLowerCase();
  return normalizedName.endsWith(".json");
}

export function ImportProjectDialog({
  open,
  importing,
  selectedFile,
  feedback,
  onClose,
  onFileChange,
  onFileRejected,
  onImport,
}: {
  open: boolean;
  importing: boolean;
  selectedFile: File | null;
  feedback: { severity: "success" | "info" | "warning" | "error"; message: string } | null;
  onClose: () => void;
  onFileChange: (file: File | null) => void;
  onFileRejected: (message: string) => void;
  onImport: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  function handleDragState(next: boolean) {
    setDragActive(next);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    handleDragState(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file && !isJsonImportFile(file)) {
      onFileChange(null);
      onFileRejected(INVALID_IMPORT_FILE_MESSAGE);
      return;
    }
    onFileChange(file);
  }

  return (
    <Dialog open={open} onClose={importing ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Import Project</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
        <Typography color="text.secondary">
          export JSON から新しい project を作成する。JSON ファイルをドラッグするか、ファイル選択から読み込む。
        </Typography>
        <Alert severity="info">
          <Stack spacing={0.75}>
            <Typography variant="body2">
              受け付ける JSON は top-level に `project` / `labels` / `documents` を持つ。
            </Typography>
            <Typography variant="body2">
              自前データから import 用 JSON を作りたい場合は{" "}
              <Link href={IMPORT_YOUR_DATA_GUIDE_URL} target="_blank" rel="noreferrer">
                この手順書
              </Link>{" "}
              を参照。
            </Typography>
          </Stack>
        </Alert>
        {feedback ? <Alert severity={feedback.severity}>{feedback.message}</Alert> : null}
        <Box
          data-testid="import-file-dropzone"
          onDragEnter={(event) => {
            event.preventDefault();
            handleDragState(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!dragActive) {
              handleDragState(true);
            }
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            handleDragState(false);
          }}
          onDrop={handleDrop}
          sx={{
            borderRadius: 4,
            border: "1px dashed #9cb6d5",
            bgcolor: dragActive ? alpha("#1a73e8", 0.08) : "#f8fbff",
            px: 4,
            py: 6,
            textAlign: "center",
            transition: "background-color 120ms ease, border-color 120ms ease",
            borderColor: dragActive ? "primary.main" : "#9cb6d5",
          }}
        >
          <Stack spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                bgcolor: alpha("#1a73e8", 0.12),
                color: "primary.main",
              }}
            >
              <UploadFileRoundedIcon />
            </Box>
            <Typography variant="h6">ここに JSON をドラッグ</Typography>
            <Typography color="text.secondary">
              または下のボタンからファイルを選択する
            </Typography>
            <Button
              component="label"
              variant="outlined"
              startIcon={<UploadFileRoundedIcon />}
            >
              Select JSON
              <input
                ref={inputRef}
                hidden
                accept=".json"
                type="file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  if (file && !isJsonImportFile(file)) {
                    onFileChange(null);
                    onFileRejected(INVALID_IMPORT_FILE_MESSAGE);
                    event.currentTarget.value = "";
                    return;
                  }
                  onFileChange(file);
                  event.currentTarget.value = "";
                }}
              />
            </Button>
          </Stack>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {selectedFile ? `選択中: ${selectedFile.name}` : "ファイルはまだ選択されていない"}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={importing}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onImport} disabled={importing || !selectedFile}>
          {importing ? "Importing..." : "Import"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
