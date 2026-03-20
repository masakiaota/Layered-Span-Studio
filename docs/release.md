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

## ブランチ戦略

- 既定運用は `main` を正本ブランチとし、release 可能な状態を保つ。
- `prod` ブランチは常設しない。Git tag と GitHub Release を本番リリースの識別子として使う。
- 日常の実装は `feature/*` や `fix/*` の短命ブランチから `main` へ取り込む。
- 未完成の差分をまとめて保持したい時だけ `develop` を導入してよい。ただし `main` と `develop` の二重管理が必要になるため、必要性が明確な場合に限る。
- `develop` を使う場合でも、正式 release は必ず `main` 上の commit に対して tag を切る。

## リリース手順

1. `main` にリリース対象の変更が揃っていることを確認する。
2. `backend` と `frontend` の version を次の `X.Y.Z` に更新する。
3. 生成物や lock file を必要に応じて更新する。
4. テストと build を通す。
5. commit を作成して `main` に push する。
6. annotated tag `vX.Y.Z` を作成して push する。
7. GitHub Release を `vX.Y.Z` から作成する。

## 現在の採用方針

- リリース version の正は Git tag とする。
- `backend/pyproject.toml`、`frontend/package.json`、OpenAPI schema の version は release tag に追従させる。
- 現時点では `prod` ブランチは使わず、必要になった時だけ `develop` 導入を検討する。

## 参考: GitHub の公式手順

- タグ運用: [GitHub Docs: Working with tags](https://docs.github.com/en/repositories/releasing-projects-on-github/working-with-tags)
- リリース作成: [GitHub Docs: Creating and managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
