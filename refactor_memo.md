# Refactor Memo

## 2026-03-11

- Frontend bug candidate:
  `frontend/src/features/project-shell/WorkspaceView.tsx` から呼ばれる `Meta (JSON)` 編集は、途中で不正 JSON になる入力を保持しない。結果として、利用者は自然な途中入力をしづらい。今回の作業では「機能を変えない」制約を優先し、挙動はそのままにした。
