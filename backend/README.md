# Layered Span Studio Backend

FastAPI backend for Layered Span Studio.

この backend は、Python の実行環境と依存管理を `uv` で統一している。
開発者ごとの差分を減らし、手元でも CI でも同じ依存関係を再現しやすくするためだ。
そのため、日常の作業は `uv sync` / `uv run ...` / `uv add ...` の流れで進める。

## 実装とドキュメントの探し方

実装を追うときは、まず次の順で見ると速い。

- アプリ起動点: [`src/layered_span_studio_backend/main.py`](src/layered_span_studio_backend/main.py)
- API ルーター: [`src/layered_span_studio_backend/api/router.py`](src/layered_span_studio_backend/api/router.py)
- ビジネスロジック: [`src/layered_span_studio_backend/services/`](src/layered_span_studio_backend/services/)
- 永続化層: [`src/layered_span_studio_backend/repositories/`](src/layered_span_studio_backend/repositories/)
- テスト: [`tests/`](tests/)

仕様や前提を確認するときは、次のドキュメントを見る。

- API 設計: [`../docs/backend/api.md`](../docs/backend/api.md)
- 認証仕様: [`../docs/backend/auth.md`](../docs/backend/auth.md)
- DB スキーマ: [`../docs/backend/database-schema.md`](../docs/backend/database-schema.md)
- JSON スキーマ: [`../docs/backend/json-schema.md`](../docs/backend/json-schema.md)
- 全体設計: [`../docs/architecture.md`](../docs/architecture.md)
- 要件: [`../docs/requirements.md`](../docs/requirements.md)

## 前提

- `uv` がインストール済みであること
- 作業ディレクトリが `backend/` であること

## 環境構築

依存関係と実行環境を同期する。

```bash
cd backend
uv sync
```

`uv sync` を実行すると、`pyproject.toml` と `uv.lock` に基づいて必要な環境が揃う。

## テスト

全テストを実行する場合:

```bash
cd backend
uv run pytest
```

特定のテストファイルだけ実行する場合:

```bash
cd backend
uv run pytest tests/test_auth.py
```

## 開発サーバー

```bash
cd backend
export JWT_SECRET='dev-secret'
uv run uvicorn layered_span_studio_backend.main:app --host 127.0.0.1 --port 8000 --reload
```

サーバー起動後のデフォルト URL は `http://127.0.0.1:8000` である。

ブラウザで API ドキュメントを確認する場合:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

## 開発用ログイン情報（ローカル専用）

開発中の動作確認では、次の認証情報を使う。

- `username`: `demo_login_user`
- `password`: `demo_login_pass`

未作成の場合は次で作成する。

```bash
cd backend
export JWT_SECRET='dev-secret'
uv run scripts/create_user.py demo_login_user demo_login_pass
```
