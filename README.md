Layered Span Studio

## 概要

Layered Span Studio は、テキストに対する span annotation を効率よく行うためのアノテーションツールである。複数ラベルの重なりを前提とした layered な閲覧・編集体験を重視しており、document 一覧、annotation canvas、作業支援 UI を一体で扱う構成を採る。

現時点では、FastAPI ベースの backend と React + Vite ベースの frontend を含む開発中リポジトリである。

## リポジトリ構成

- `backend/`: FastAPI による backend 実装
- `frontend/`: React + Vite による frontend 実装
- `docs/`: 仕様・設計ドキュメント

詳細な作業ガイドや仕様は、以下を参照すること。

- [backend/README.md](backend/README.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/requirements.md](docs/requirements.md)

## 開発方針

- backend の Python 実行は `uv` を前提とする
- frontend / backend / docs をまたぐ変更では、仕様ドキュメントの同期を重視する
- AI を前提に実装を進める一方で、重視するのはコード生成そのものではなく、最終成果物の UI/UX と、将来的に手を入れやすい構造である。


## フィードバック

利用報告や導入連絡は歓迎する。必須ではないが、チーム利用・業務利用・派生利用の事例を一言共有してもらえると非常に助かる。

Issue や Discussion、または既知の連絡手段があればそこから連絡してほしい。

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
