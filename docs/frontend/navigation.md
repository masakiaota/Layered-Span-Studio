# Frontend 画面遷移仕様（初版）

最終更新: 2026-03-17

## 1. 遷移方針

- Project 一覧の導線は Label Studio の構成を踏襲する。
- browser から見た API は same-origin の `/api` 配下とする。
- browser 認証は `HttpOnly Cookie + server session` とし、frontend は auth token を `localStorage` に保持しない。
- Project 選択後は Project スコープ画面（Workspace / Project Settings）へ遷移する。
- URL は以下を持つ。
  - `"/projects/:projectId"`（Workspace）
  - `"/projects/:projectId/settings"`（Project Settings）
- Document 切り替えは画面内状態で行い、Document ごとの URL は持たない。

## 2. 画面一覧

1. Login
2. Project List
3. Workspace
4. Project Settings（Import / Export を内包）

## 3. 遷移フロー

1. アプリ起動時に `GET /auth/session` を呼び、既存 session が有効ならそのまま Project List を開く。
2. session が無効なら `"/login"` を開く。
3. `"/login"` で username / password を入力し、`POST /auth/session` でサインインする。
4. サインイン後は Project List を開く。
5. Project List で既存 Project を選択する、`New Project` を実行して空の Project を作成する、または Import Project を実行して新規 Project を作成する。
6. 既存 Project を選んだ場合は `"/projects/:projectId"` の Workspace を開く。
7. `New Project` では作成ダイアログで `name` / `description` を入力し、作成完了後は `"/projects/:projectId/settings"` を開く。
8. 新規 Project Import 完了時も、作成された `"/projects/:projectId"` の Workspace を開く。
9. Project List からは各 Project の `Settings` 導線で `"/projects/:projectId/settings"` を直接開ける。
10. Project List では `並び順` と `昇順 / 降順` を user が切り替えられるようにする。
11. Project List の初期並びは `作成順 / 降順` とし、新しく作成・import した project が先頭に来る。
12. 上部ナビゲーションで以下を切り替える。
  - Workspace
  - Project Settings
13. Workspace では左ペインで Document を選び、中央で Annotation 編集、右ペインで詳細編集を行う。
14. Project Settings では Project 名 / 説明 / Label 定義 / ガイドライン / Import・Export・Project 削除を管理する。

## 4. Document 切り替え時の扱い

- 保存方式は明示保存方式とする。
- browser の annotation 編集は document 単位で保持し、Save/Submit まではローカル state に留める。
- browser の通常保存導線では annotation 個別 CRUD を使わず、document bundle save を使う。
- 未保存変更がある状態で Document 切り替えを実行した場合は、確認ダイアログを表示する。
- ダイアログは以下 3 アクションを持つ。
  - 保存して移動
  - 破棄して移動
  - キャンセル
- 左ペインの Doc 検索は画面内状態として扱い、URL には載せない。
- 左ペインの Doc 検索は本文に対する単純な部分一致検索とし、`%` / `_` に特別な意味は持たせない。`document_name` は識別用表示名として残す。
- Doc 検索中の一覧移動（クリック / `J` / `K` / `Shift+J` / `Shift+K`）は、検索結果に含まれる Document のみを候補とする。
- 検索によって現在選択中 Document が一覧から外れても、編集中の Document は維持する。左ペインには検索結果外である旨と、検索クリア導線を表示する。

## 5. Project 一覧へ戻る時の扱い

- Workspace / Settings の各画面から Project 一覧へ戻る導線には未保存確認を出す。
- 未保存確認ダイアログは以下 3 アクションを持つ。
  - 保存して移動
  - 破棄して移動
  - キャンセル
- URL 直打ちやブラウザ履歴遷移時のガードは実装対象外とする（データロスト許容）。

## 5.1 Import / Export の扱い

- Project List では、新規 project 作成のための Import Project 導線を提供する。
- Project List では、空の project を作る `New Project` 導線も提供する。
- Project List では `作成順` `名前順` `ドキュメント数順` `未確定ドキュメント数順` を切り替え可能にし、昇順 / 降順も選べるようにする。
- Project List の初期値は `作成順 / 降順` とする。
- `New Project` は dialog で `Project name` と `Description` を入力して確定する。
- `New Project` 完了後は、作成された project の `Project Settings` を開く。
- Project List の Import は backend の `POST /projects/import` と同じ意味を持ち、export JSON から新規 project を作る。
- Project List の Import で `project.name` が既存と重複した場合は、backend 仕様に合わせて `"(imported)"`, `"(imported 2)"` ... を付けて自動改名する。
- Project Settings では、現在 project に対する追記 Import と Export を提供する。
- 入出力はファイル（`.json`）で扱う。
- JSON 形式は backend の `POST /projects/import` / `POST /projects/{project_id}/export` / `POST /projects/{project_id}/import` と同一の構造を前提にする。
- 単位は project 単位とする（Document 単位では提供しない）。
- Project Settings の Import は backend の `POST /projects/{project_id}/import` と同じく append 専用とし、`payload.project.*` で既存 project 本体は更新しない。
- Project Settings の Import で既存データと同名の label / document がある場合は、backend 仕様に合わせて全体失敗とする。
- Project Settings では、画面最下部に `Danger Zone` を置き、`DELETE /projects/{project_id}` に対応する Project 削除導線を提供する。
- Project 削除は確認ダイアログ必須とし、対象 project 名と「元に戻せない」ことを明示する。
- Project 削除成功後は Project List へ戻る。

## 6. Submit の定義

- Submit ボタンは中央ペインの右下（操作列の右端）に配置する。
- Submit 実行時は、対象 Document の確定処理を行う。
- 確定処理では以下を同時に実施する。
  - 対象 Document の `status` を `verified` に変更
  - 対象 Document 配下の全 Annotation の `status` を `verified` に変更
- Submit 完了後は、次の `pending` Document を自動選択して同一 Workspace 内で遷移する。
- 次の `pending` が存在しない場合は現在 Document のままとする。

## 7. ステータス仕様

- Annotation は `pending | verified` を持つ。
- Document も `pending | verified` を持つ（新規追加要件）。
- 通常編集時は `pending` のまま扱い、Submit で一括 `verified` に遷移させる。
