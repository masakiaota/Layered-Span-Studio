# Layered Span Studio Backend

FastAPI backend for Layered Span Studio.

この backend は、Python の実行環境と依存管理を `uv` で統一している。
開発者ごとの差分を減らし、手元でも CI でも同じ依存関係を再現しやすくするためだ。
そのため、日常の作業は `uv sync` / `uv run ...` / `uv add ...` の流れで進める。

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
uv run fastapi dev src/layered_span_studio_backend/main.py
```

サーバー起動後のデフォルト URL は `http://127.0.0.1:8000` である。
