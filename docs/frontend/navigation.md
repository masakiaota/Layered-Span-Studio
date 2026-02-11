# Frontend 画面遷移仕様（初版）

最終更新: 2026-02-11

## 1. 遷移方針

- Project 一覧の導線は Label Studio の構成を踏襲する。
- Project 選択後は 1 画面構成の Workspace に遷移する。
- URL は `"/projects/:projectId"` 固定とする。
- Document 切り替えは画面内状態で行い、Document ごとの URL は持たない。

## 2. 画面一覧

1. Project List
2. Workspace（単一画面）

## 3. 遷移フロー

1. Project List で Project を選択する。
2. `"/projects/:projectId"` の Workspace を開く。
3. 左ペインで Document を選ぶ。
4. 中央ペインで Annotation を編集する。
5. 右ペインで Annotation の詳細確認・編集を行う。

## 4. Document 切り替え時の扱い

- 保存方式は明示保存方式とする。
- 未保存変更がある状態で Document 切り替えを実行した場合は、確認ダイアログを表示する。
- ダイアログは以下 3 アクションを持つ。
  - 保存して移動
  - 破棄して移動
  - キャンセル

## 5. Submit の定義

- Submit ボタンは中央ペインの右下（操作列の右端）に配置する。
- Submit 実行時は、対象 Document の確定処理を行う。
- 確定処理では以下を同時に実施する。
  - 対象 Document の `status` を `verified` に変更
  - 対象 Document 配下の全 Annotation の `status` を `verified` に変更
- Submit 完了後は、次の `pending` Document を自動選択して同一 Workspace 内で遷移する。
- 次の `pending` が存在しない場合は現在 Document のままとする。

## 6. ステータス仕様

- Annotation は `pending | verified` を持つ。
- Document も `pending | verified` を持つ（新規追加要件）。
- 通常編集時は `pending` のまま扱い、Submit で一括 `verified` に遷移させる。
