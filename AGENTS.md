# Repository Rules

## Repository Map

- Backend 実装: [`backend/src/`](backend/src/)
- Backend テスト: [`backend/tests/`](backend/tests/)
- Backend 作業ガイド: [`backend/README.md`](backend/README.md)
- Frontend 実装: [`frontend/src/`](frontend/src/)
- Frontend テスト: [`frontend/src/test/`](frontend/src/test/)
- 仕様ドキュメント: [`docs/backend/`](docs/backend/)
- Frontend 仕様ドキュメント: [`docs/frontend/`](docs/frontend/)
- Frontend 画面遷移仕様: [`docs/frontend/navigation.md`](docs/frontend/navigation.md)
- Frontend Workspace 仕様: [`docs/frontend/workspace-spec.md`](docs/frontend/workspace-spec.md)
- リリース運用: [`docs/release.md`](docs/release.md)
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
- Frontend の画面遷移、URL、画面間導線の変更は [`docs/frontend/navigation.md`](docs/frontend/navigation.md) を更新する。
- Frontend の Workspace / Project Settings UI、ショートカット、Import/Export、Annotation 操作仕様の変更は [`docs/frontend/workspace-spec.md`](docs/frontend/workspace-spec.md) を更新する。
- 横断的な設計変更は [`docs/architecture.md`](docs/architecture.md) と [`docs/requirements.md`](docs/requirements.md) を確認し、必要なら更新する。
- リリース運用、ブランチ戦略、tag/version の管理方針を変更した場合は [`docs/release.md`](docs/release.md) を更新する。

## Development Philosophy

- 重視するのは最終成果物の UI/UX 品質である。
- 実装判断では、その場しのぎの対症療法よりも、将来的な改変・拡張・保守のしやすさを優先する。
- 変更は責務の境界が分かる形で行い、読みやすく整理されたコードを保つ。場当たり的なパッチワークで辻褄を合わせない。
- 新機能追加や不具合修正の際は、必要に応じて周辺の構造も見直し、一貫した設計に寄せる。
