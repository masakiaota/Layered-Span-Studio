# Layered Span Studio

Languages: [English](./README-en.md) / [中文](./README-zh-CN.md)

Layered Span Studio は、文字列の任意区間に対して、重なり合う複数ラベルを同時に管理する作業に最適化されたアノテーションツールである。主な特徴は次の通り。

- 重なり合うラベルを前提にした UI/UX を採用し、複数 span を直感的に編集可能。
- アノテーションの定義情報や、他の既存アノテーションを即座に確認でき、効率的なアノテーション作業が可能。
- LLM 連携を見据えたAPIを提供しており、半自動アノテーションの組込が可能。


![外観](./docs/readme-overview.webp)

---

## 目次

1. [クイックスタート](#クイックスタート)
2. [リポジトリ構成](#リポジトリ構成)
3. [リリース運用](#リリース運用)
4. [補足事項](#補足事項)
5. [License](#license)

## クイックスタート

クイックスタートとして、デモプロジェクトを読み込む前提で手順をまとめる。

以下は2つのターミナルで並行して実行する想定。

1. バックエンドを起動する

```bash
cd backend
export JWT_SECRET='dev-secret'
uv sync # 初回 / 依存更新時のみ
uv run scripts/create_user.py demo_login_user demo_login_pass # サンプル: 任意のユーザー名とパスワードに置き換え可 / 初回のみ（未作成時）
uv run uvicorn layered_span_studio_backend.main:app --host 127.0.0.1 --port 8000 --reload
```

`JWT_SECRET` はログイン後に発行する JWT の署名・検証に使うサーバー側の秘密鍵である。本番環境では十分長くランダムな固定値を設定する。

2. フロントエンドを起動する

```bash
cd ../frontend
npm install # 初回のみ
npm run dev
```

3. ブラウザで `http://127.0.0.1:5173` (フロントの出力を確認すること) を開き、ログイン後にデモプロジェクトを import する

- ユーザー名: `demo_login_user`
- パスワード: `demo_login_pass`
- プロジェクト一覧右上の `Import Project` から `docs/quickstart-demo-project.json` を選択
- import 完了後、作成されたプロジェクトが開くのでアノテーション画面を確認する

4. すぐ確認できるポイント
- ドラッグでアノテーションができる。
- テキストに対して重なり合うラベルを付与することが可能。
- 右ペインで既存アノテーションや定義情報を確認
- 選択中の表層テキストに対して、別docにある既存アノテーションを確認可能
- shortcut で操作が可能 (? ボタンで確認)

## 自分のデータで始める

自前の文書や annotation データを import 用 JSON に変換したい場合は、[docs/import-your-data.md](./docs/import-your-data.md) を参照。
英語版は [docs/import-your-data-en.md](./docs/import-your-data-en.md) にある。中国語版は [docs/import-your-data-zh-CN.md](./docs/import-your-data-zh-CN.md) にある。
新しい project を作る import と、既存 project への追記 import の違いもこの手順書で整理している。

規模の大きめな日本語NERデータで試したい場合は、[script/build_stockmark_ner_import.py](./script/build_stockmark_ner_import.py) で
[Stockmark ner-wikipedia-dataset](https://github.com/stockmarkteam/ner-wikipedia-dataset) を import 用 JSON に変換できる。

```bash
uv run --script script/build_stockmark_ner_import.py --output data/stockmark-ner-wikipedia-import.json
```

生成物をそのまま backend に取り込む場合は `--import-backend` を付ける。元データは Wikipedia 日本語版由来で、Stockmark dataset は CC BY-SA 3.0 に従うため、生成 JSON や取り込んだ project を再配布・公開する場合はライセンス継承と帰属表示に注意すること。

## リポジトリ構成

- `backend/`: サーバ側のAPIとデータ保存、認証、Import/Exportの土台。
- `frontend/`: アノテーションUI本体（React + Vite）。
- `docs/`: 仕様、設計、運用方針の参照先。

- 詳細なリリース運用ルールは [docs/release.md](./docs/release.md) を参照。


## 補足事項

本ツールをご利用いただく際には、以下の点にご留意ください。

- 本ツールを用いて生じたいかなる損害についても、開発者は一切の責任を負いません。
- 企業での導入も歓迎しています。ご利用いただく場合は、ユースケース・運用要件・改善要望を把握したいため、ぜひご連絡いただけると嬉しいです。 ( aotamasakimail (あっと) gmail.com )
- IssueやPRも歓迎しています。


## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
