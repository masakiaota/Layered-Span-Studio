# TODO: Import API の挙動見直しメモ

最終更新: 2026-02-08

## 背景

現状の import API は `POST /projects/{project_id}/import` である。
この API は「指定した既存プロジェクトに対してデータを取り込む」仕様であり、新規プロジェクトを作成する API ではない。

## 現状仕様（コード上の事実）

- 対象: 既存の `project_id`
- import 時に `payload.project.name / description / meta` で対象プロジェクト情報を更新する
- `labels` / `documents` / `annotations` を同一プロジェクト配下に作成する
- 同名ラベル・同名ドキュメントが既に存在すると 400 で失敗する

## 実際に起きた混乱

- 期待: import 実行後にプロジェクトが 2 件になる
- 実際: 既存 1 件の名前が import payload の `project.name` に置き換わった
- 観測結果として `GET /projects` では件数は増えず、名前だけ変更された

## 問題点

1. `import` という語感から「新規作成」だと誤解しやすい
2. `project` 情報を上書きする副作用が直感に反する
3. エンドポイント名と挙動の対応が弱く、初見で誤操作しやすい

## 改善方針（候補）

### 案A: import で project メタを更新しない

- 挙動: `labels/documents/annotations` のみ取り込む
- 利点: 意図しないプロジェクト改名を防げる
- 欠点: export→import の完全再現性が下がる

### 案B: mode を追加して明示する（推奨）

- 例: `mode=append | replace | replace_with_project_update`
- 利点: 破壊的な挙動を明示でき、互換性を保ちながら誤解を減らせる
- 欠点: API とドキュメント、テストの変更が必要

### 案C: 新規作成 import API を分離する

- 例: `POST /projects/import`（新規作成）と `POST /projects/{id}/import`（既存更新）を分ける
- 利点: 意味が最も明確
- 欠点: 実装変更量が最も大きい

## 推奨方針

短期は案B（mode 追加）を採用する。
理由は、既存 API を壊さずに誤解を減らせるためである。

## 実施タスク

- [ ] API 仕様を決める（`mode` のデフォルト値と挙動）
- [ ] `backend/src/layered_span_studio_backend/models/import_export.py` に `mode` を追加
- [ ] `backend/src/layered_span_studio_backend/api/import_export.py` で入力を受ける
- [ ] `backend/src/layered_span_studio_backend/services/import_export_service.py` の分岐実装
- [ ] `backend/tests/test_import_export.py` に mode 別テストを追加
- [ ] `docs/backend/api.md` に import の挙動差分を明記
- [ ] `docs/backend/json-schema.md` の import payload 例を更新

## 受け入れ条件

- [ ] `GET /projects` の件数変化が mode ごとに期待どおりになる
- [ ] mode 未指定時の挙動が仕様どおりである
- [ ] 既存テスト + 追加テストがすべて通る
- [ ] ドキュメントだけ読んで誤解なく操作できる
