# データベーススキーマ設計

## 概要

Layered Span Studioでは、データ永続化にSQLiteを使用します。1プロジェクトにつき1つのSQLiteデータベースファイルを作成し、プロジェクト情報、ラベル定義、ドキュメント、アノテーションを管理します。

## データベース構成

```
backend/data/projects/
└── {project_id}/
    └── database.db      # 1プロジェクト = 1 SQLiteファイル
```

各プロジェクトは独立したデータベースファイルを持ちます。これにより、プロジェクト単位でのバックアップ、エクスポート、削除が容易になります。

## 設計方針

### 1. 完全正規化

検索、集計、統計処理を高速化するため、RDBの原則に従った正規化を行います。

- **project**: プロジェクト情報（1レコードのみ）
- **labels**: ラベル定義
- **documents**: ドキュメント
- **annotations**: アノテーション（ドキュメントとは別テーブル）

### 2. ID設計

すべてのテーブルでUUID v4を主キーとして使用します。

**採用理由**:
- グローバルにユニーク（衝突の心配がない）
- エクスポート/インポート時に安全
- 標準的で実装がシンプル
- IDはユーザーに見せないため、長さは問題にならない

**ID生成**:
```python
import uuid
id = str(uuid.uuid4())  # 例: "550e8400-e29b-41d4-a716-446655440000"
```

### 3. multi-label対応

同じテキスト範囲に複数のラベルを付与できるよう、annotationsテーブルにはスパンの重複を禁止する制約を設けません。

### 4. 事前アノテーションとチェック済みの区別

- `status`: アノテーションの状態（`pending` | `verified`）

これにより、LLM/人間/アルゴリズム等による事前アノテーション（pending）と、チェック済みアノテーション（verified）を同じ仕組みで扱えます。

### 5. 柔軟な拡張

- `meta`: 各エンティティに任意JSON（不定形データ）を格納

将来的な機能追加や外部システム連携に備え、JSON形式の拡張フィールドを用意します。

### 6. JSONスキーマとの関係

`docs/backend/json-schema.md` は **外部インターフェースの仕様** です。
DBスキーマは **そのJSONを生成・保存できること** を満たせばよく、内部的には追加のリレーションや冗長な情報を保持して構いません。
この設計は、JSONの形に従いつつも、検索・整合性・拡張性を優先した形になっています。

## ER図

```
                 ┌─────────────┐
                 │  project    │ 1プロジェクト = 1データベース
                 └─────────────┘
                   1 │     │ 1
                     │     │
                    *│     │*
        ┌─────────────┐   ┌─────────────┐
        │   labels    │   │  documents  │
        └─────────────┘   └─────────────┘
               1 │              │ 1
                 │*            *│
                 │              │
                 └──────┐  ┌────┘
                        │  │
                   ┌─────────────┐
                   │ annotations │
                   └─────────────┘
```

**リレーション**:
- project 1 : * labels（`labels.project_id`）
- project 1 : * documents（`documents.project_id`）
- documents 1 : * annotations
- labels 1 : * annotations

## テーブル定義

### project テーブル

プロジェクト全体の情報を管理します。1データベースにつき1レコードのみ存在します。

```sql
CREATE TABLE project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    meta TEXT                     -- JSON: 任意の拡張情報
);
```

| カラム | 型 | NULL | 説明 |
|--------|-----|------|------|
| id | TEXT | NOT NULL | プロジェクトID（UUID） |
| name | TEXT | NOT NULL | プロジェクト名 |
| description | TEXT | NULL | プロジェクトの説明 |
| meta | TEXT | NULL | 任意の拡張情報（JSON文字列） |

---

### labels テーブル

プロジェクトで使用するラベル（エンティティタイプ）の定義を管理します。

```sql
CREATE TABLE labels (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,           -- 表示名
    color TEXT NOT NULL,          -- 16進数カラーコード
    description TEXT NOT NULL,    -- ラベルの説明（ガイドライン含む）
    shortcut TEXT,                -- キーボードショートカット
    meta TEXT,                    -- JSON: 任意の拡張情報
    FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);

CREATE INDEX idx_labels_project ON labels(project_id);
CREATE INDEX idx_labels_name ON labels(name);
```

| カラム | 型 | NULL | 説明 |
|--------|-----|------|------|
| id | TEXT | NOT NULL | ラベルID（UUID） |
| project_id | TEXT | NOT NULL | プロジェクトID（UUID） |
| name | TEXT | NOT NULL | ラベル名（例: "疾患名", "症状"） |
| color | TEXT | NOT NULL | カラーコード（例: "#ff6b6b"） |
| description | TEXT | NOT NULL | ラベルの説明（ガイドライン含む） |
| shortcut | TEXT | NULL | キーボードショートカット（例: "1", "d"） |
| meta | TEXT | NULL | 任意の拡張情報（JSON文字列） |

**設計ポイント**:
- `name` は変更可能（ユーザー向け表示名）
- `id` は不変（システム内部での識別子）
- ラベル名を変更しても、既存のアノテーションへの参照は壊れない
 - 外部JSONでは `project_id` を持たないため、インポート時は `project.id` を補完して保存する

---

### documents テーブル

アノテーション対象のドキュメントを管理します。

```sql
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    document_name TEXT NOT NULL,  -- ドキュメント名
    text TEXT NOT NULL,           -- アノテーション対象のテキスト
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'verified'
    created_at TEXT NOT NULL,     -- ISO 8601 UTC
    updated_at TEXT NOT NULL,     -- ISO 8601 UTC
    meta TEXT,                    -- JSON: 任意の拡張情報
    FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE,
    CHECK (status IN ('pending', 'verified'))
);

CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_document_name ON documents(document_name);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_updated_at ON documents(updated_at);
```

| カラム | 型 | NULL | 説明 |
|--------|-----|------|------|
| id | TEXT | NOT NULL | ドキュメントID（UUID） |
| project_id | TEXT | NOT NULL | プロジェクトID（UUID） |
| document_name | TEXT | NOT NULL | ドキュメント名 |
| text | TEXT | NOT NULL | アノテーション対象のテキスト全体 |
| status | TEXT | NOT NULL | 状態（'pending', 'verified'） |
| created_at | TEXT | NOT NULL | 作成日時（ISO 8601 UTC） |
| updated_at | TEXT | NOT NULL | 更新日時（ISO 8601 UTC） |
| meta | TEXT | NULL | 任意の拡張情報（JSON文字列。user-defined fields のみ） |

メモ:
- 外部JSON（`docs/backend/json-schema.md`）の `Document.project_name` は、`project.name` から取得します。
- `status` / `created_at` / `updated_at` は system field として backend が管理します。

---

### annotations テーブル

ドキュメント内のアノテーション（スパン）を管理します。

```sql
CREATE TABLE annotations (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    label_id TEXT NOT NULL,
    start INTEGER NOT NULL,       -- 開始位置（文字単位、0-indexed、inclusive）
    end INTEGER NOT NULL,         -- 終了位置（文字単位、0-indexed、exclusive）
    span_text TEXT NOT NULL,      -- スパンのテキスト（必須）
    comment TEXT NOT NULL DEFAULT '', -- コメント（必須。未記入は空文字）
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'verified'
    meta TEXT,                    -- JSON: 任意の拡張情報
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE,
    CHECK (start >= 0),
    CHECK (end > start),
    CHECK (status IN ('pending', 'verified'))
);

CREATE INDEX idx_annotations_document ON annotations(document_id);
CREATE INDEX idx_annotations_label ON annotations(label_id);
CREATE INDEX idx_annotations_status ON annotations(status);
CREATE INDEX idx_annotations_position ON annotations(document_id, start, end);
```

| カラム | 型 | NULL | 説明 |
|--------|-----|------|------|
| id | TEXT | NOT NULL | アノテーションID（UUID） |
| document_id | TEXT | NOT NULL | ドキュメントID |
| label_id | TEXT | NOT NULL | ラベルID |
| start | INTEGER | NOT NULL | 開始位置（文字単位） |
| end | INTEGER | NOT NULL | 終了位置（文字単位） |
| span_text | TEXT | NOT NULL | スパンのテキスト |
| comment | TEXT | NOT NULL | コメント（未記入は空文字） |
| status | TEXT | NOT NULL | 状態（'pending', 'verified'） |
| meta | TEXT | NULL | 任意の拡張情報（JSON文字列） |

**スパン位置の仕様**:
- `start`: 開始位置（0-indexed、inclusive）
- `end`: 終了位置（0-indexed、exclusive）
- Pythonの文字列スライス `text[start:end]` と対応

**例**:
```python
text = "患者は頭痛を訴え"
start = 3
end = 5
span_text = text[start:end]  # "頭痛"
```

**status の値**:
- `pending`: 未確認（事前アノテーション、レビュー待ち）
- `verified`: 確認済み（チェック完了、確定）

**デフォルト動作**:
- API経由の作成時は `status` を必須入力とする（`pending` または `verified`）
- DBレイヤのデフォルト値は `pending`（直接INSERT時の安全側フォールバック）
- 却下されたアノテーション: データベースから削除

**multi-label対応**:
- 同じ範囲（start, end）に複数のアノテーションを付与可能
- 制約なし、完全に独立

---

## 初期化SQL

データベースの初期化時に実行するSQL文です。

```sql
-- 外部キー制約を有効化
PRAGMA foreign_keys = ON;

-- project テーブル
CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    meta TEXT
);

-- labels テーブル
CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    description TEXT NOT NULL,
    shortcut TEXT,
    meta TEXT,
    FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_labels_project ON labels(project_id);
CREATE INDEX IF NOT EXISTS idx_labels_name ON labels(name);

-- documents テーブル
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    document_name TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    meta TEXT,
    FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE,
    CHECK (status IN ('pending', 'verified'))
);

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_name ON documents(document_name);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);

-- annotations テーブル
CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    label_id TEXT NOT NULL,
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    span_text TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    meta TEXT,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE,
    CHECK (start >= 0),
    CHECK (end > start),
    CHECK (status IN ('pending', 'verified'))
);

CREATE INDEX IF NOT EXISTS idx_annotations_document ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_label ON annotations(label_id);
CREATE INDEX IF NOT EXISTS idx_annotations_status ON annotations(status);
CREATE INDEX IF NOT EXISTS idx_annotations_position ON annotations(document_id, start, end);
```

## 主要クエリ

### ドキュメント一覧取得（アノテーション数付き）

```sql
SELECT 
    d.id,
    d.project_id,
    d.document_name,
    COUNT(a.id) as annotation_count,
    SUM(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END) as pending_count
FROM documents d
LEFT JOIN annotations a ON d.id = a.document_id
GROUP BY d.id
LIMIT 50 OFFSET 0;
```

### ドキュメント詳細取得（アノテーション込み）

```sql
-- ドキュメント本体
SELECT * FROM documents WHERE id = ?;

-- アノテーション一覧（ラベル情報含む）
SELECT 
    a.id,
    a.document_id,
    d.document_name as document_name,
    a.label_id,
    a.start,
    a.end,
    a.span_text,
    a.comment,
    a.status,
    a.meta,
    l.name as label_name
FROM annotations a
JOIN documents d ON a.document_id = d.id
JOIN labels l ON a.label_id = l.id
WHERE a.document_id = ?
ORDER BY a.start;
```

### アノテーション追加

```sql
-- アノテーション挿入
INSERT INTO annotations (
    id, document_id, label_id, start, end, span_text,
    comment, status, meta
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
```

### ラベルごとの統計

```sql
SELECT 
    l.id,
    l.name,
    l.color,
    COUNT(a.id) as annotation_count
FROM labels l
LEFT JOIN annotations a ON l.id = a.label_id
GROUP BY l.id
ORDER BY l.name;
```

### プロジェクト全体の統計

```sql
SELECT 
    COUNT(DISTINCT d.id) as total_documents,
    COUNT(a.id) as total_annotations,
    SUM(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END) as pending_annotations,
    SUM(CASE WHEN a.status = 'verified' THEN 1 ELSE 0 END) as verified_annotations
FROM documents d
LEFT JOIN annotations a ON d.id = a.document_id;
```

### 検索機能

```sql
-- ドキュメント名で検索
SELECT * FROM documents 
WHERE document_name LIKE ?;

-- 特定ラベルが付いたドキュメント検索
SELECT DISTINCT d.*
FROM documents d
JOIN annotations a ON d.id = a.document_id
WHERE a.label_id = ?
ORDER BY d.document_name;

-- 未確認アノテーションの取得
SELECT 
    a.*,
    d.document_name as document_name,
    l.name as label_name
FROM annotations a
JOIN documents d ON a.document_id = d.id
JOIN labels l ON a.label_id = l.id
WHERE a.status = 'pending'
ORDER BY d.document_name, a.start;

-- アノテーションの承認
UPDATE annotations 
SET status = 'verified'
WHERE id = ?;

-- 未確認アノテーションがあるドキュメント
SELECT 
    d.*,
    COUNT(CASE WHEN a.status = 'pending' THEN 1 END) as pending_count
FROM documents d
LEFT JOIN annotations a ON d.id = a.document_id
GROUP BY d.id
HAVING pending_count > 0
ORDER BY pending_count DESC;
```

## エクスポート形式

データベースから取得したデータを、以下のJSON形式でエクスポートします。

```json
{
  "project": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "医療文書NER",
    "description": "医療文書からエンティティ抽出",
    "meta": {}
  },
  "labels": [
    {
      "id": "7b9e4f21-a1c3-4d5e-8f9a-1234567890ab",
      "name": "疾患名",
      "color": "#ff6b6b",
      "description": "病気や疾患の名称（ガイドライン含む）",
      "shortcut": "1",
      "meta": {}
    }
  ],
  "documents": [
    {
      "id": "3a5c8d12-e4f6-4g7h-8i9j-0k1l2m3n4o5p",
      "project_id": "550e8400-e29b-41d4-a716-446655440000",
      "project_name": "医療文書NER",
      "document_name": "患者記録_001",
      "text": "患者は頭痛を訴え、アスピリンを処方された。",
      "annotations": [
        {
          "id": "4b6d9e23-f5g7-4h8i-9j0k-1l2m3n4o5p6q",
          "document_id": "3a5c8d12-e4f6-4g7h-8i9j-0k1l2m3n4o5p",
          "document_name": "患者記録_001",
          "label_id": "2c8d5a93-b4e6-4f7g-9h1i-2j3k4l5m6n7o",
          "label_name": "症状",
          "start": 4,
          "end": 6,
          "span_text": "頭痛",
          "comment": "",
          "status": "verified",
          "meta": {}
        }
      ],
      "meta": {}
    }
  ],
  "meta": {
    "format": "layered-span-studio/export",
    "version": "1.0"
  }
}
```

## インポート処理

JSONファイルからデータベースにインポートする際の流れ：

1. プロジェクト情報を `project` テーブルに挿入
2. ラベル定義を `labels` テーブルに挿入（`project_id` は `project.id` で補完）
3. ドキュメントを `documents` テーブルに挿入
4. アノテーションを `annotations` テーブルに挿入

UUID形式のIDを使用しているため、ID衝突の心配なくインポート可能です。

## パフォーマンス考慮事項

### インデックス戦略

以下のインデックスを作成し、検索・集計のパフォーマンスを最適化します。

- `idx_documents_project`: プロジェクト配下のドキュメント取得
- `idx_documents_document_name`: ドキュメント名での検索
- `idx_annotations_document`: 特定ドキュメントのアノテーション取得
- `idx_annotations_label`: 特定ラベルのアノテーション検索
- `idx_annotations_status`: 未確認/確認済みの絞り込み
- `idx_annotations_position`: 位置ベースの検索

### スケーラビリティ

- 10,000ドキュメント規模: 問題なく動作
- 100,000アノテーション規模: インデックスにより高速
- さらに大規模な場合: PostgreSQL等への移行を検討

## データ整合性

### 外部キー制約

- `ON DELETE CASCADE`: 親レコード削除時に子レコードも自動削除
  - プロジェクト削除 → ラベル、ドキュメントも削除
  - ドキュメント削除 → アノテーションも削除
  - ラベル削除 → そのラベルを使うアノテーションも削除

### CHECK制約

- `start >= 0`: 開始位置は0以上
- `end > start`: 終了位置は開始位置より大きい

これらの制約により、不正なデータの挿入を防ぎます。

## まとめ

このスキーマ設計により、以下を実現します：

1. **高速な検索・集計**: 正規化とインデックスによる最適化
2. **multi-label対応**: 同じ範囲への複数ラベル付与
3. **事前アノテーション対応**: `pending` / `verified` による状態管理
4. **柔軟な拡張**: `meta` フィールドによる拡張性
5. **データ整合性**: 外部キー制約とCHECK制約
6. **エクスポート互換性**: `docs/backend/json-schema.md` の形式に合わせた入出力
