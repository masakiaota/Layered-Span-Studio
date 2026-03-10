# Layered Span Studio: 基本JSONスキーマ（外部インターフェース）

このドキュメントは、Layered Span Studio の **基本となるJSON形式**（Backendが返す/受け取る、Import/Exportの基礎）を定義します。

- APIごとの最適化（例: レイヤー/ラベル単位に spans を束ねるレスポンス、一覧用の軽量レスポンス等）は、ここから派生して別途定義します。
- ここで定義するのは「まず共通で通る、最小でブレない形」です。

## 共通ルール

- **`id`**: UUID文字列
- **`meta`**: 任意JSON（基本は object を想定）。用途例:
  - 名前の別名（aliases）
  - 外部システム連携の一時データ退避
  - 将来の拡張フィールド
- **文字位置**:
  - `start`: 0-indexed / inclusive
  - `end`: 0-indexed / exclusive
  - 例: `text[start:end]` がスパン文字列になる
- **時刻**: この基本スキーマでは `created_at` / `updated_at` を必須にしません（必要になったAPIで追加してOK）

## エンティティ定義

### Label

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "project_name": "医療文書NER",
  "name": "疾患名",
  "color": "#ff6b6b",
  "description": "ガイドラインもここに書く",
  "shortcut": "1",
  "meta": {
    "aliases": ["病名"]
  }
}
```

- **必須**: `id`, `project_id`, `project_name`, `name`, `color`, `description`
- **任意**: `shortcut`, `meta`

- アノテーションガイドラインは `Label.description` に記述します。

---

### Label Example（ラベル横断参照）

```json
{
  "annotation_id": "uuid",
  "document_id": "uuid",
  "document_name": "患者記録_001",
  "span_text": "糖尿病",
  "start": 24,
  "end": 27,
  "status": "verified",
  "context_before": "既往歴に",
  "context_after": "あり。"
}
```

- **必須**:
  - `annotation_id`
  - `document_id`, `document_name`
  - `span_text`
  - `start`, `end`
  - `status`
  - `context_before`, `context_after`

#### Label Example API のクエリ仕様

- `status`: `pending` / `verified` / `all`
  - 未指定時の既定値は `verified`
  - `all` のときに両方を対象とする
- `sample`: `sequential` / `random`
  - `random` は重複なし抽出
- `seed`: `sample=random` のときの再現性制御
- `context_window`: 前後文脈の文字数

---

### Label Surface Group（同一ラベルの表層集約）

```json
{
  "surface_text": "糖尿病",
  "surface_norm": "糖尿病",
  "duplicate_count": 12,
  "representative": {
    "annotation_id": "uuid",
    "document_id": "uuid",
    "document_name": "患者記録_001",
    "span_text": "糖尿病",
    "start": 24,
    "end": 27,
    "status": "verified",
    "context_before": "既往歴に",
    "context_after": "あり。"
  }
}
```

- `surface_norm` は `trim -> lowercase -> 連続する空白/ハイフン/アンダースコアを1つの空白へ畳み込み` した値
- `duplicate_count` は同一 `surface_norm` に属する annotation 件数
- `representative` は一覧表示用の代表事例

---

### Annotation Search Item（同一表層検索）

```json
{
  "annotation_id": "uuid",
  "document_id": "uuid",
  "document_name": "患者記録_002",
  "label_id": "uuid",
  "label_name": "所見",
  "label_color": "#33AA44",
  "start": 12,
  "end": 15,
  "span_text": "糖尿病",
  "status": "verified",
  "context_before": "母に",
  "context_after": "の既往あり"
}
```

- `label_color` は frontend でバッジ強調に使うために含める
- `match=normalized` の場合は `surface_norm` 相当の比較でヒットする

---

### Project

```json
{
  "id": "uuid",
  "name": "医療文書NER",
  "description": "医療文書からエンティティ抽出",
  "meta": {
    "note": "任意"
  }
}
```

- **必須**: `id`, `name`
- **任意**: `description`, `meta`

メモ:
- `settings` はこの段階では設けません（必要になったときに新規フィールド追加を検討）。
- `Project` は `labels` を内包しません（後述のExportで別フィールドとして扱う）。

---

### Annotation

```json
{
  "id": "uuid",
  "document_id": "uuid",
  "document_name": "患者記録_001",
  "label_id": "uuid",
  "label_name": "疾患名",
  "start": 16,
  "end": 19,
  "span_text": "糖尿病",
  "comment": "",
  "status": "pending",
  "meta": {}
}
```

- **必須**:
  - `id`
  - `document_id`, `document_name`
  - `label_id`, `label_name`
  - `start`, `end`
  - `span_text`（必須）
  - `comment`（必須。未記入は必ず `""`）
  - `status`
- **任意**: `meta`

#### `status`

- `pending`: 事前アノテーション/レビュー待ち
- `verified`: チェック済み（確定）

#### 区間重複ルール

- 同一ドキュメント内で、同一ラベルの区間重複は不可
- 異なるラベル同士の区間重複は可
- 判定は半開区間 `[start, end)`（隣接区間は重複ではない）

---

### Document（基本は full 形式のみ定義）


```json
{
  "id": "uuid",
  "project_id": "uuid",
  "project_name": "医療文書NER",
  "document_name": "患者記録_001",
  "text": "患者は頭痛を訴え、アスピリンを処方された。既往歴に糖尿病あり。",
  "annotations": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "document_name": "患者記録_001",
      "label_id": "uuid",
      "label_name": "疾患名",
      "start": 16,
      "end": 19,
      "span_text": "糖尿病",
      "comment": "",
      "status": "pending",
      "meta": {}
    }
  ],
  "meta": {
    "source": "hospital_records"
  }
}
```

- **必須**: `id`, `project_id`, `project_name`, `document_name`, `text`, `annotations`
- **任意**: `meta`

#### Document List API の派生ルール

- 一覧 API も基本の `Document` 形を使うが、`annotations` は含めない
- 一覧 API は `offset/limit/search/sort` を持つ
- `search` は `text` にのみ適用し、`document_name` は検索対象に含めない

## 組み合わせ（Exportの基本形）

プロジェクト全体のエクスポートは、まず次の形を基本とします。

```json
{
  "project": {
    "id": "uuid",
    "name": "医療文書NER",
    "description": "医療文書からエンティティ抽出",
    "meta": {}
  },
  "labels": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "name": "疾患名",
      "color": "#ff6b6b",
      "description": "ガイドラインもここに書く",
      "shortcut": "1",
      "meta": {}
    }
  ],
  "documents": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "document_name": "患者記録_001",
      "text": "患者は…",
      "annotations": [
        {
          "id": "uuid",
          "document_id": "uuid",
          "document_name": "患者記録_001",
          "label_id": "uuid",
          "label_name": "疾患名",
          "start": 16,
          "end": 19,
          "span_text": "糖尿病",
          "comment": "",
          "status": "pending",
          "meta": {}
        }
      ],
      "meta": {}
    }
  ]
}
```

この Export 形式は、そのまま import request body としても使います。

### Import の扱い

- `POST /projects/import`
  - Export JSON を受け取り、新しい project を 1 件作成する
  - `project.name` / `project.description` / `project.meta` を新規 project の初期値に使う
  - payload 内の `id` / `project_id` / `document_id` / `label_id` は無視し、新しい UUID を再採番する
  - 同名 project が既に存在する場合は `"(imported)"`, `"(imported 2)"` ... を付けて自動改名する

- `POST /projects/{project_id}/import`
  - Export JSON を受け取り、既存 project に labels / documents / annotations を追記する
  - payload の `project.*` は受け取るが、既存 project 本体の更新には使わない
  - payload 内の `id` / `project_id` / `document_id` / `label_id` は無視し、新しい UUID を再採番する
  - 既存と同名の label / document が含まれる場合は全体失敗する

### 新規 Project Import のレスポンス

```json
{
  "project": {
    "id": "uuid",
    "name": "医療文書NER (imported)",
    "description": "医療文書からエンティティ抽出",
    "meta": {}
  },
  "imported": {
    "labels": 1,
    "documents": 1,
    "annotations": 1
  },
  "errors": []
}
```


## 将来の拡張（このドキュメントのスコープ外）

- 一覧API用の軽量 `Document` 形式（例: `text` や `annotations` を省略、集計値だけ返す）
- レイヤー（ラベル）単位で spans を束ねたレスポンス形式（本ツールの特色）
- アノテーション候補提示、差分適用、バッチ承認などの操作API用リクエスト/レスポンス形式
