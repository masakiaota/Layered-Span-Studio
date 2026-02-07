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


## 将来の拡張（このドキュメントのスコープ外）

- 一覧API用の軽量 `Document` 形式（例: `text` や `annotations` を省略、集計値だけ返す）
- レイヤー（ラベル）単位で spans を束ねたレスポンス形式（本ツールの特色）
- アノテーション候補提示、差分適用、バッチ承認などの操作API用リクエスト/レスポンス形式
