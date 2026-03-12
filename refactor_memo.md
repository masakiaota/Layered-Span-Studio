# Refactor Memo

## 2026-03-11

- Frontend bug candidate:
  `frontend/src/features/project-shell/WorkspaceView.tsx` から呼ばれる `Meta (JSON)` 編集は、途中で不正 JSON になる入力を保持しない。結果として、利用者は自然な途中入力をしづらい。今回の作業では「機能を変えない」制約を優先し、挙動はそのままにした。

- Frontend improvement candidate:
  `frontend` の production build でメインチャンクが 500 kB を超える警告が出る。今回の refactor ではコード分割や route-level lazy loading は入れていないため、将来的には `/projects` と `/projects/:projectId` 周辺で分割を検討してよい。
