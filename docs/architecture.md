# Layered Span Studio - アーキテクチャ設計

## システム構成

Layered Span Studioは、Frontend（SPA）とBackend（APIサーバー）の2層構成で実装します。データベースは別サーバーとして分離せず、Backendに統合します。

```
┌─────────────────────────────────────────┐
│            Frontend (SPA)               │
│  「見せる・操作する・一時的に持つ」        │
├─────────────────────────────────────────┤
│ - アノテーションUI                       │
│ - キーボードショートカット                │
│ - 一時的な状態管理                       │
│ - API通信                              │
└─────────────────────────────────────────┘
              ↕ HTTP/REST API
┌─────────────────────────────────────────┐
│            Backend (API Server)         │
│  「保存する・計算する・外と繋ぐ」          │
├─────────────────────────────────────────┤
│ - データ永続化                           │
│ - ビジネスロジック                       │
│ - LLM連携（将来構想）                   │
│ - API提供                              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│       データストレージ（Backend内包）      │
├─────────────────────────────────────────┤
│ - JSONファイル or SQLite                │
│ - プロジェクトごとのディレクトリ構造       │
└─────────────────────────────────────────┘
```

## なぜDBをBackendに統合するのか

### 統合を選択した理由

1. **シンプルさの優先**
   - 要件定義で「シンプルさを優先」を掲げている
   - 開発・デプロイ・運用が容易

2. **データ特性**
   - アノテーションデータは構造がシンプル
   - 複雑なクエリや集計は不要
   - データ量は数千〜数万件程度

3. **運用の容易性**
   - ローカル環境で別途DBサーバーを立ち上げる必要がない
   - デプロイが単純（Backendプロセス1つで完結）
   - 初期セットアップが簡単

4. **将来の拡張性**
   - Repository層とStorage層を分離することで、後からDB変更可能
   - JSONファイル → SQLite → PostgreSQLと段階的に移行できる

## ディレクトリ構成

```
layered-span-studio/
├── frontend/
│   ├── src/
│   │   ├── components/      # UIコンポーネント
│   │   ├── features/        # 機能ごとのモジュール
│   │   ├── hooks/           # カスタムフック
│   │   ├── pages/           # 画面単位のコンポーネント
│   │   ├── generated/       # OpenAPI から生成した API 契約型
│   │   ├── api.ts           # API client 初期化と共通エラーハンドリング
│   │   ├── api-contract.ts  # generated 契約型の再公開
│   │   ├── types.ts         # UI ローカル型定義
│   │   ├── utils.ts         # 共通ユーティリティ
│   │   └── App.tsx          # 画面全体のルート構成
│   ├── index.html
│   ├── openapi/             # backend OpenAPI schema snapshot
│   └── package.json
│
├── backend/
│   ├── src/
│   │   └── layered_span_studio_backend/
│   │       ├── api/            # APIエンドポイント（ルーティング）
│   │       │   ├── auth.py
│   │       │   ├── projects.py
│   │       │   ├── documents.py
│   │       │   ├── annotations.py
│   │       │   ├── annotation_search.py
│   │       │   ├── labels.py
│   │       │   └── import_export.py
│   │   │
│   │       ├── services/       # ビジネスロジック層
│   │       │   ├── projects_service.py
│   │       │   ├── documents_service.py
│   │       │   ├── annotations_service.py
│   │       │   ├── labels_service.py
│   │       │   └── import_export_service.py
│   │   │
│   │       ├── repositories/   # データアクセス層
│   │       ├── models/         # データモデル定義
│   │       ├── storage/        # SQLite ベースの永続化実装
│   │       ├── core/           # 設定・依存解決
│   │       └── utils/          # ユーティリティ
│   │   │
│   ├── data/               # データ保存先（gitignore）
│   │   └── projects/
│   │       ├── project-001/
│   │       │   ├── config.json
│   │       │   └── documents/
│   │       │       ├── doc-001.json
│   │       │       └── doc-002.json
│   │       └── project-002/
│   │
│   └── pyproject.toml
│
├── docs/
│   ├── requirements.md
│   └── architecture.md
│
└── README.md
```

## Frontend の責務

### 1. 画面表示・UI

- テキスト表示
- スパン（アノテーション）の可視化
  - 複数ラベルの重なりを視覚的に表現
  - 色分け、レイヤー表示
- ラベル一覧の表示
- プロジェクト選択画面
- ドキュメント一覧
- ガイドライン表示パネル

### 2. ユーザー操作

- マウスでテキストをドラッグしてスパン選択
- ラベルの選択・付与
- スパンの編集・削除
- コメントの入力
- プロジェクト/ドキュメントの切り替え

### 3. キーボードショートカット

- 全てのショートカット処理
- 共通ショートカットの処理
- `label.shortcut` のようなラベル個別ショートカットは backend / API では保持可能だが、frontend での編集 UI と直接操作は未対応であり、将来の拡張候補とする
- スパン選択・編集の操作

### 4. 一時的な状態管理

- 現在選択中のテキスト範囲
- 編集中の project bundle 全体
- 保存済み snapshot との差分
- Undo / Redo 用の履歴
- local ID を含む未保存エンティティ
- UI表示状態（パネルの開閉等）
- 現在のプロジェクト/ドキュメント
- Document 一覧のページング状態と表示ウィンドウ
- 選択中 Document の本文・Annotation 詳細

#### ProjectShell の状態分割方針

- `ProjectShell` は画面遷移、ダイアログ開閉、選択状態などの画面オーケストレーションを担当する。
- project / document 読み込みと一覧ページング、snapshot 管理は `useProjectBundle` に集約する。
- 現在開いている Document の Undo / Redo 履歴は `useDocumentHistory` に集約する。
- Project Settings の Import / Export 状態と実行は `useImportExport` に集約する。
- 関連例・同一表層事例の取得と一覧状態は `useProjectExamples` に集約する。
- この分割により、UIイベントの配線とデータ取得・履歴・入出力の責務を分離し、回帰テストを hook 単位で追加しやすくする。

### 5. バックエンドとの通信

- API呼び出し
- データの送受信
- エラーハンドリング
- Save / Submit 時の差分同期
- Document 一覧検索・並び替え・追加読み込みの要求
- project 横断の関連例検索要求

**要約**: 見た目・操作・未保存の編集中状態の管理

## Backend の責務

### 1. データ管理

- プロジェクトデータの保存/読み込み
- ドキュメントデータの保存/読み込み
- アノテーションデータの保存/読み込み
- ラベル定義の管理
- ガイドライン本文の管理

### 2. ビジネスロジック

- アノテーションの追加/更新/削除
- プロジェクトの作成/削除
- データの整合性チェック
- エクスポート処理（JSON生成）
- インポート処理（JSON解析・検証）
- Document 一覧の検索・並び替え・件数集計
- project 横断の関連例集約・表層検索

### 3. データ永続化

- ファイルシステムへの書き込み/読み込み
- データ構造の管理
- ファイル/ディレクトリの作成・削除

### 4. LLM連携（将来構想）

現行実装には LLM 呼び出し UI / API は含まれていない。以下は、将来的に導入する場合の backend 側責務を示す。

- LLM APIへのリクエスト
- プロンプト生成
  - 既存アノテーション + 未アノテーションテキスト → プロンプト
- LLMレスポンスの解析
- アノテーション候補の生成

### 5. API提供

- RESTful API エンドポイントの提供
- リクエスト/レスポンスの処理
- 認証（必要な場合）

**要約**: データの永続化・ビジネスロジック・外部連携

## レイヤー分離の重要性

Backend内部ではRepository層とStorage層を明確に分離します。これにより、将来的なデータストレージの変更（JSONファイル → SQLite → PostgreSQL等）が容易になります。

```typescript
// Repository層（ビジネスロジックから呼ばれる）
class ProjectRepository {
  constructor(private storage: StorageInterface) {}
  
  async getProject(id: string): Promise<Project> {
    const data = await this.storage.read(`projects/${id}/config.json`);
    return this.mapToProject(data);
  }
}

// Storage層（実装を切り替え可能）
interface StorageInterface {
  read(path: string): Promise<any>;
  write(path: string, data: any): Promise<void>;
}

class JsonStorage implements StorageInterface {
  async read(path: string) { /* JSONファイル読み込み */ }
  async write(path: string, data: any) { /* JSONファイル書き込み */ }
}

class SqliteStorage implements StorageInterface {
  async read(path: string) { /* SQLiteから読み込み */ }
  async write(path: string, data: any) { /* SQLiteに書き込み */ }
}
```

## データフロー例

### 例1: スパンを新規作成して保存する操作

1. **Frontend**: ユーザーがテキストをドラッグ → 範囲を一時保持
2. **Frontend**: ユーザーがラベルを選択
3. **Frontend**: annotation をローカルの project bundle に追加する
4. **Frontend**: 未保存状態として画面を更新する
5. **Frontend**: ユーザーが `Save` または `Submit` を実行する
6. **Frontend**: 保存前 snapshot と現在の bundle を比較し、必要な API を順次呼び出す
7. **Backend**: アノテーションデータを検証し、必要な create / update / delete を保存する
8. **Backend**: 永続化後のデータを返す
9. **Frontend**: 受け取ったデータで snapshot を更新し、未保存状態を解消する

### 例2: Document を Submit する操作

1. **Frontend**: ユーザーが `Submit` を押す
2. **Frontend**: 対象 Document の `status` を `verified` にし、配下 Annotation も `verified` に更新する
3. **Frontend**: `Save` と同じ差分同期処理で backend API を呼ぶ
4. **Backend**: Document / Annotation の更新を保存する
5. **Frontend**: 保存後、次の `pending` Document を選択する
6. **Frontend**: 右ペインや Annotation 選択状態を初期化する

### 例3: プロジェクトを開く

1. **Frontend**: プロジェクト選択画面でプロジェクトをクリック
2. **Frontend**: `GET /projects/{project_id}` でプロジェクト情報を取得する
3. **Frontend**: `GET /projects/{project_id}/labels` でラベル一覧を取得する
4. **Frontend**: `GET /projects/{project_id}/documents?offset=0&limit=...&search=&sort=created` で Document 一覧の先頭ページを取得する
5. **Frontend**: 先頭 Document があれば `GET /projects/{project_id}/documents/{document_id}` で詳細を取得する
6. **Backend**: プロジェクトデータ、ラベル、Document 一覧、選択中 Document 詳細を返す
7. **Frontend**: Project bundle と Document 一覧ウィンドウを初期化する
8. **Frontend**: Workspace を表示する

## 実装の判断基準

どちらに実装するか迷った時の基準：

| 質問 | Yes → Backend | No → Frontend |
|------|---------------|---------------|
| データを保存する必要がある？ | ✓ | |
| 計算や変換処理が必要？ | ✓ | |
| 外部API（LLM等）を呼ぶ？ | ✓ | |
| UIの見た目に関わる？ | | ✓ |
| ユーザー操作に即座に反応する？ | | ✓ |
| データがページリロード後も残る必要がある？ | ✓ | |

## データストレージの成長パス

プロジェクトの成長に応じて、段階的にストレージを変更できます。

### Phase 1: JSONファイルベース（初期実装）

**メリット**:
- シンプル、デバッグしやすい
- Gitでバージョン管理可能
- 人間が直接編集可能

**適用範囲**: プロトタイプ、小〜中規模のプロジェクト

### Phase 2: SQLite（必要に応じて）

**移行タイミング**:
- 検索性能が必要になった
- トランザクションが必要になった
- データ量が増えてきた

**メリット**:
- ファイル1つで管理
- SQLによる柔軟なクエリ
- サーバープロセス不要

### Phase 3: PostgreSQL等（スケールが必要な場合）

**移行タイミング**:
- 複数ユーザーの同時アクセスが必要
- データが非常に大きくなった
- 高度なクエリや集計が必要

**変更内容**:
- この時点でBackendからDBを分離
- Repository層の実装を変更するだけ（インターフェースは維持）

## デプロイ構成

### ローカル開発

```bash
# Frontend
cd frontend
npm run dev  # port 3000

# Backend
cd backend
export JWT_SECRET='dev-secret'
uv run uvicorn layered_span_studio_backend.main:app --host 127.0.0.1 --port 8000 --reload
```

開発時の browser から見た入口は frontend dev server の `http://127.0.0.1:3000` に統一する。
frontend は `/api` を backend `:8000` へ proxy し、same-origin のまま cookie session を扱う。

### 本番デプロイ（必要な場合）

Docker Composeを使用:

```yaml
services:
  frontend:
    # Nginx等で静的ファイル配信
    
  backend:
    # Node.js/Python等
    # データはボリュームマウント
```

## API設計方針

### RESTful API

基本的な CRUD 操作を RESTful に設計する。現在の実装では、frontend が編集中の bundle を保持し、`Save` / `Submit` 時に必要な API を順次呼び出して backend と同期する。

- 新規作成は `POST`
- 部分更新は `PATCH`
- 削除は `DELETE`
- 取得は `GET`
- 全置換更新を表す `PUT` は、設定やラベル、ドキュメント bundle など一部のリソースで限定的に利用する

```
POST   /auth/session                                             # browser session 作成
GET    /auth/session                                             # browser session 取得
DELETE /auth/session                                             # browser session 破棄
POST   /auth/token                                               # CLI / API client 用 JWT 発行

GET    /projects                                                 # プロジェクト一覧
POST   /projects                                                 # プロジェクト作成
GET    /projects/{project_id}                                    # プロジェクト取得
PATCH  /projects/{project_id}                                    # プロジェクト部分更新
DELETE /projects/{project_id}                                    # プロジェクト削除

GET    /projects/{project_id}/labels                             # ラベル一覧（revision 付き）
PUT    /projects/{project_id}/labels                             # ラベル一括同期（base_revision 必須）

GET    /projects/{project_id}/documents                          # ドキュメント一覧
POST   /projects/{project_id}/documents                          # ドキュメント作成
GET    /projects/{project_id}/documents/{document_id}            # ドキュメント取得
DELETE /projects/{project_id}/documents/{document_id}            # ドキュメント削除

GET    /projects/{project_id}/annotations/search                 # アノテーション横断検索
POST   /projects/{project_id}/documents/{document_id}/annotations        # アノテーション作成
GET    /projects/{project_id}/documents/{document_id}/annotations/{annotation_id}   # アノテーション取得
PATCH  /projects/{project_id}/documents/{document_id}/annotations/{annotation_id}   # アノテーション部分更新
DELETE /projects/{project_id}/documents/{document_id}/annotations/{annotation_id}   # アノテーション削除

GET    /projects/{project_id}/labels/{label_id}/surface-groups   # 同一表層グループ取得
POST   /projects/{project_id}/export                             # エクスポート
POST   /projects/import                                          # 新規 project import
POST   /projects/{project_id}/import                             # 既存 project 追記 import
```

## まとめ

- **Frontend**: UIとユーザー操作に特化、一時的な状態のみ管理
- **Backend**: データ永続化、ビジネスロジック、外部連携を担当
- **データストレージ**: Backendに統合、レイヤー分離で将来の変更に対応
- **成長パス**: JSONファイル → SQLite → PostgreSQLと段階的に移行可能
