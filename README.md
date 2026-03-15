# Layered Span Studio

Layered Span Studio は、文字列の任意区間に対して、重なり合う複数ラベルを同時に管理する作業に最適化されたアノテーションツールである。主な特徴は次の通り。

- 重なり合うラベルを前提にした UI/UX を採用し、複数 span を直感的に編集可能。
- アノテーションの定義情報や、他の既存アノテーションを即座に確認でき、効率的なアノテーション作業が可能。
- LLM 連携を見据えたAPIを提供しており、半自動アノテーションの組込が可能。


![外観](./docs/readme-overview.webp)

---

## 目次

1. [クイックスタート](#クイックスタート)
2. [リポジトリ構成](#リポジトリ構成)
3. [補足事項](#補足事項)
4. [License](#license)

## クイックスタート

クイックスタートとして、デモプロジェクトを読み込む前提で手順をまとめる。

以下は2つのターミナルで並行して実行する想定。

1. バックエンドを起動する

```bash
cd backend
export JWT_SECRET='dev-secret'
uv sync # 初回 / 依存更新時のみ
uv run scripts/create_user.py demo_login_user demo_login_pass # 初回のみ（未作成時）
uv run uvicorn layered_span_studio_backend.main:app --host 127.0.0.1 --port 8000 --reload
```

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


## リポジトリ構成
- `backend/`: サーバ側のAPIとデータ保存、認証、Import/Exportの土台。
- `frontend/`: アノテーションUI本体（React + Vite）。
- `docs/`: 仕様、設計、運用方針の参照先。


## 補足事項

本ツールをご利用いただく際には、以下の点にご留意ください。

- 本ツールを用いて生じたいかなる損害についても、開発者は一切の責任を負いません。
- 企業での導入も歓迎しています。ご利用いただく場合は、ユースケース・運用要件・改善要望を把握したいため、ぜひご連絡いただけると嬉しいです。 ( aotamasakimail (あっと) gmail.com )
- 2026-03-15現在 、 まだ開発中です。2026-04-01 までには安定版をリリースする予定です。利用したい場合は少々お待ち下さい。IssueやPRも歓迎しています。



## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
