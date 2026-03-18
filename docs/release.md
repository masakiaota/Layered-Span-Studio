# Layered Span Studio リリース管理方針

このリポジトリのリリース管理は、GitHub の tag と Release を軸に運用する。

## 方針

- 単一アプリとして `vX.Y.Z` を主軸管理とする。
- 開発版は `v0.1.0-dev1` を最初の暫定タグとする。
- 基本は SemVer。`v0.1.0-devN`（N は整数）を使う場合は `v0.1.0` への暫定版と扱う。
- `backend`/`frontend` は単体バージョンではなく、全体版の副次情報として扱う。
- データ仕様は別管理。`docs/backend/json-schema.md` の `meta.version` と `docs/backend/database-schema.md` の仕様を基準に管理する。

## 最小運用ルール

- タグは同名で付け替えない（push 済みは変更前提にしない）。
- 破壊的変更時のみ `MAJOR` を上げる。
- `-devN` は公開前テスト目的の暫定版。十分に安定したら同一 `PATCH` の正式タグ（`v0.1.0`）へ移行する。

## 参考: GitHub の公式手順

- タグ運用: [GitHub Docs: Working with tags](https://docs.github.com/en/repositories/releasing-projects-on-github/working-with-tags)
- リリース作成: [GitHub Docs: Creating and managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
