# TODO

完了した項目はこのファイルから削除する。長期に残す設計判断や背景は各ドキュメントへ反映し、このファイルは「未完了タスクの一覧」に留める。

最終更新: 2026-03-11

## High

- [ ] Browser 向け認証方式を再設計する
  現行 frontend は Bearer JWT を `localStorage` に保存しているが、暫定方針である。`HttpOnly Cookie` ベースのサーバセッション方式を第一候補としつつ、CLI / API クライアント用途を残すため Bearer JWT 併用の可否も含めて整理する。

## Mid

- [ ] Import / Export まわりの失敗時 UX を改善する
  JSON 不正、重複名、backend 由来の検証エラーなどを、操作を止めずに理解できる導線へ寄せる。

- [ ] `Meta (JSON)` 編集で途中入力を保持できるようにする
  現状は不正 JSON の途中状態を保持できず、自然な入力がしづらい。編集中の文字列状態と確定済み JSON を分けて扱う設計を検討する。

- [ ] frontend のメインチャンク肥大化を改善する
  production build で 500 kB 超の警告が出ている。`/projects` と `/projects/:projectId` 周辺の code splitting や route-level lazy loading を検討する。
