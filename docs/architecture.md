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
│ - LLM連携                              │
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
│   │   ├── services/        # API通信
│   │   ├── hooks/           # カスタムフック
│   │   └── types/           # TypeScript型定義
│   ├── public/
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── api/            # APIエンドポイント（ルーティング）
│   │   │   ├── projects
│   │   │   ├── documents
│   │   │   ├── annotations
│   │   │   └── llm
│   │   │
│   │   ├── services/       # ビジネスロジック層
│   │   │   ├── project_service
│   │   │   ├── annotation_service
│   │   │   └── llm_service
│   │   │
│   │   ├── repositories/   # データアクセス層
│   │   │   ├── project_repository
│   │   │   ├── document_repository
│   │   │   └── annotation_repository
│   │   │
│   │   ├── models/         # データモデル定義
│   │   │   ├── project
│   │   │   ├── document
│   │   │   └── annotation
│   │   │
│   │   ├── storage/        # 永続化の実装
│   │   │   ├── json_storage       # JSONファイル実装
│   │   │   ├── sqlite_storage     # SQLite実装（オプション）
│   │   │   └── storage_interface  # 抽象インターフェース
│   │   │
│   │   └── utils/          # ユーティリティ
│   │
│   ├── data/               # データ保存先（gitignore）
│   │   └── projects/
│   │       ├── project-001/
│   │       │   ├── config.json
│   │       │   └── documents/
│   │       │       ├── doc-001.json
│   │       │       └── doc-002.json
│   │       └── project-002/
│   │
│   └── package.json / requirements.txt
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
- 編集中のアノテーション
- UI表示状態（パネルの開閉等）
- 現在のプロジェクト/ドキュメント

### 5. バックエンドとの通信

- API呼び出し
- データの送受信
- エラーハンドリング

**要約**: 見た目・操作・一時的な状態の管理

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

### 3. データ永続化

- ファイルシステムへの書き込み/読み込み
- データ構造の管理
- ファイル/ディレクトリの作成・削除

### 4. LLM連携

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

### 例1: スパンを新規作成する操作

1. **Frontend**: ユーザーがテキストをドラッグ → 範囲を一時保持
2. **Frontend**: ユーザーがラベルを選択
3. **Frontend**: `POST /api/annotations` でBackendに送信
4. **Backend**: アノテーションデータを検証
5. **Backend**: JSONファイルに保存
6. **Backend**: 保存したデータをレスポンスで返す
7. **Frontend**: 受け取ったデータで画面を更新

### 例2: LLMで自動アノテーション

1. **Frontend**: 「LLMで自動補完」ボタンをクリック
2. **Frontend**: `POST /api/llm/annotate` でBackendにリクエスト
3. **Backend**: 既存アノテーションを取得
4. **Backend**: プロンプト生成
5. **Backend**: LLM APIに送信
6. **Backend**: レスポンスを解析してアノテーション候補を作成
7. **Backend**: 候補データを返す
8. **Frontend**: 候補を画面に表示（確認・編集可能な状態）
9. **Frontend**: ユーザーが承認 → `POST /api/annotations` で保存

### 例3: プロジェクトを開く

1. **Frontend**: プロジェクト選択画面でプロジェクトをクリック
2. **Frontend**: `GET /api/projects/{id}` でプロジェクト情報取得
3. **Backend**: プロジェクトデータを読み込み
4. **Backend**: ラベル定義、ガイドライン等を含めて返す
5. **Frontend**: プロジェクト情報を表示
6. **Frontend**: `GET /api/projects/{id}/documents` でドキュメント一覧取得
7. **Backend**: ドキュメント一覧を返す
8. **Frontend**: ドキュメント一覧を表示

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
npm run dev  # port 8000
```

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

基本的なCRUD操作をRESTfulに設計します。

```
GET    /api/projects              # プロジェクト一覧
POST   /api/projects              # プロジェクト作成
GET    /api/projects/:id          # プロジェクト取得
PUT    /api/projects/:id          # プロジェクト更新
DELETE /api/projects/:id          # プロジェクト削除

GET    /api/projects/:id/documents           # ドキュメント一覧
POST   /api/projects/:id/documents           # ドキュメント追加
GET    /api/projects/:id/documents/:docId    # ドキュメント取得
PUT    /api/projects/:id/documents/:docId    # ドキュメント更新
DELETE /api/projects/:id/documents/:docId    # ドキュメント削除

GET    /api/documents/:docId/annotations     # アノテーション一覧
POST   /api/documents/:docId/annotations     # アノテーション追加
PUT    /api/annotations/:id                  # アノテーション更新
DELETE /api/annotations/:id                  # アノテーション削除

POST   /api/documents/:docId/llm-annotate    # LLM自動アノテーション
POST   /api/projects/:id/export              # エクスポート
POST   /api/projects/import                  # インポート
```

## まとめ

- **Frontend**: UIとユーザー操作に特化、一時的な状態のみ管理
- **Backend**: データ永続化、ビジネスロジック、外部連携を担当
- **データストレージ**: Backendに統合、レイヤー分離で将来の変更に対応
- **成長パス**: JSONファイル → SQLite → PostgreSQLと段階的に移行可能
