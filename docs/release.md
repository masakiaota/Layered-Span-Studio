# Layered Span Studio リリース管理方針

このリポジトリのリリース管理は、GitHub の tag と Release を軸に運用する。

## 方針

- 単一アプリとして Git tag の `vX.Y.Z` を正のリリースバージョンとする。
- `backend` の `pyproject.toml` と `frontend` の `package.json` の version は、tag の `v` を外した値へ同期させる。
- `backend`/`frontend` は個別リリース番号を持たず、全体版の追従先として扱う。
- データ仕様は別管理。`docs/backend/json-schema.md` の `meta.version` と `docs/backend/database-schema.md` の仕様を基準に管理する。

## 最小運用ルール

- タグは同名で付け替えない（push 済みは変更前提にしない）。
- 破壊的変更時のみ `MAJOR` を上げる。
- 日常開発では tag を増やさず、開発途中の識別は branch 名と commit hash で行う。
- リリース時は `version` 更新、commit、annotated tag の作成、`git push`、`git push --tags` を一連で行う。

## 参考: GitHub の公式手順

- タグ運用: [GitHub Docs: Working with tags](https://docs.github.com/en/repositories/releasing-projects-on-github/working-with-tags)
- リリース作成: [GitHub Docs: Creating and managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
