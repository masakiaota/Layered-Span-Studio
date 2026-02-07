# Repository Rules

## Backend Python Execution

- `backend/` 配下では Python 実行を `uv` に限定する。
- 実行系は `uv run ...` を使う（例: `uv run pytest`）。
- 依存追加は `uv add ...` を使う。
- `python` / `python3` / `pip` / `pip3` / `uv pip install` は使わない。
