# Repository Rules

## Repository Map

- Backend 実装: [`backend/src/`](backend/src/)
- Backend テスト: [`backend/tests/`](backend/tests/)
- Backend 作業ガイド: [`backend/README.md`](backend/README.md)
- 仕様ドキュメント: [`docs/backend/`](docs/backend/)
- 全体ドキュメント: [`docs/`](docs/)

## Backend Python Execution

- `backend/` 配下では Python 実行を `uv` に限定する。
- 実行系は `uv run ...` を使う（例: `uv run pytest`）。
- 依存追加は `uv add ...` を使う。
- `python` / `python3` / `pip` / `pip3` / `uv pip install` は使わない。

## Documentation Rules

- API の仕様変更は [`docs/backend/api.md`](docs/backend/api.md) を更新する。
- 認証仕様の変更は [`docs/backend/auth.md`](docs/backend/auth.md) を更新する。
- DB 構造の変更は [`docs/backend/database-schema.md`](docs/backend/database-schema.md) を更新する。
- JSON 形式の変更は [`docs/backend/json-schema.md`](docs/backend/json-schema.md) を更新する。
- 横断的な設計変更は [`docs/architecture.md`](docs/architecture.md) と [`docs/requirements.md`](docs/requirements.md) を確認し、必要なら更新する。
