# 自前データを Import 用 JSON に変換する手順

最終更新: 2026-03-20

## 1. この手順書の目的

この手順書は、手元の文書データや annotation データを、Layered Span Studio に import できる JSON に変換するための実務向けガイドである。

この手順書で扱うのは、次のようなケースである。

- CSV や JSON、DB などで文書を持っている
- ラベル定義を自分で決めて project を始めたい
- 既存 annotation をまとめて import したい
- まずは文書だけ import し、annotation は後から追加したい

最終的に作る JSON は、top-level に少なくとも `project` / `labels` / `documents` を持つ。

```json
{
  "project": {},
  "labels": [],
  "documents": []
}
```

`annotations` は各 document の中に入れる。annotation 付きで始めてもよいが、最初は annotation なしで import を通す方が失敗しにくい。

厳密な仕様の正本は [docs/backend/json-schema.md](./backend/json-schema.md) にある。この手順書では、利用者が実際に変換作業を進める順で説明する。

## 2. 最短ルート

最短で始めたい場合は、次の 3 step で十分である。

1. project 名を決める
2. ラベル一覧を `labels` に入れる
3. 文書一覧を `documents` に入れる

annotation は後回しでよい。まずは import が通る最小 JSON を作ることを優先するとよい。

最小例:

```json
{
  "project": {
    "name": "医療文書NER",
    "description": "自前データの初期 import",
    "meta": {
      "guideline": "必要に応じて project 全体のガイドラインを書く"
    }
  },
  "labels": [
    {
      "name": "疾患名",
      "color": "#D94841",
      "description": "疾患や病名に付与する"
    }
  ],
  "documents": [
    {
      "document_name": "record_001",
      "text": "患者は糖尿病の既往がある。",
      "status": "pending",
      "created_at": "2026-03-01T00:00:00Z",
      "updated_at": "2026-03-01T00:00:00Z",
      "annotations": []
    }
  ]
}
```

この形で import できれば、Layered Span Studio 上で annotation 作業を始められる。

## 3. まず完成形を見る

import 用 JSON 全体の基本形は次の通りである。

```json
{
  "project": {
    "name": "医療文書NER",
    "description": "医療文書のエンティティ抽出",
    "meta": {}
  },
  "labels": [
    {
      "name": "疾患名",
      "color": "#D94841",
      "description": "疾患や病名に付与する",
      "meta": {}
    }
  ],
  "documents": [
    {
      "document_name": "record_001",
      "text": "患者は糖尿病の既往がある。",
      "status": "pending",
      "created_at": "2026-03-01T00:00:00Z",
      "updated_at": "2026-03-01T00:00:00Z",
      "annotations": [
        {
          "label_name": "疾患名",
          "start": 3,
          "end": 6,
          "span_text": "糖尿病",
          "comment": "",
          "status": "pending",
          "meta": {}
        }
      ],
      "meta": {}
    }
  ],
  "meta": {
    "format": "layered-span-studio/import",
    "version": "1.0"
  }
}
```

変換作業の最初の時点では、次の点だけ押さえればよい。

- `project.name` は必須
- `labels` は配列
- `documents` は配列
- 各 document には `document_name`, `text`, `status`, `created_at`, `updated_at` が必要
- `annotations` は省略または空配列でもよい

一方で、次のような ID 系の値は import 時に再採番されるため、最初は無理に持たなくてよい。

- `project.id`
- `labels[].id`
- `documents[].id`
- `annotations[].id`
- `project_id`, `document_id`, `label_id`

元データ側の識別子を残したい場合は、`meta` に入れておくとよい。

## 4. 手元データをどう対応づけるか

手元データには色々な形があるが、考え方は共通している。

| 手元データ | Import JSON での置き場所 | 補足 |
| --- | --- | --- |
| project 名 | `project.name` | 画面に表示される project 名になる |
| project 説明 | `project.description` | 空でもよい |
| project 全体ガイドライン | `project.meta.guideline` | 任意 |
| ラベル名 | `labels[].name` | 重複させない |
| ラベル色 | `labels[].color` | `#RRGGBB` 形式 |
| ラベル説明 | `labels[].description` | アノテーション方針を書くと運用しやすい |
| 文書IDやファイル名 | `documents[].document_name` または `documents[].meta.source_id` | 表示名に使うか、元 ID として残すかを分けて考える |
| 文書本文 | `documents[].text` | annotation の `start/end` の基準になる |
| 文書状態 | `documents[].status` | `pending` または `verified` |
| 文書作成時刻 | `documents[].created_at` | timezone 付き ISO 8601 |
| 文書更新時刻 | `documents[].updated_at` | timezone 付き ISO 8601 |
| annotation のラベル名 | `annotations[].label_name` | `labels[].name` と一致させる |
| annotation の開始位置 | `annotations[].start` | 0-index, inclusive |
| annotation の終了位置 | `annotations[].end` | 0-index, exclusive |
| annotation 文字列 | `annotations[].span_text` | `text[start:end]` と一致させる |

迷ったら次の方針で考えるとよい。

- 画面に見せたい名前は `name` や `document_name` に入れる
- 元データ固有の ID や補助情報は `meta` に退避する
- 最初からすべて持ち込もうとせず、まず import に必要な最小項目を揃える

## 5. Step 1: `labels` を作る

`labels` は、その project で使うラベル定義の一覧である。

最小形:

```json
[
  {
    "name": "疾患名",
    "color": "#D94841",
    "description": "疾患や病名に付与する"
  },
  {
    "name": "薬剤名",
    "color": "#2F6FED",
    "description": "薬剤や製品名に付与する"
  }
]
```

最低限、次を満たすようにするとよい。

- `name` は空文字にしない
- 同じ JSON 内で label 名を重複させない
- `color` は `#RRGGBB` 形式にする
- `description` は運用上の判断基準を書く場所として使う

description は単なる補足文ではなく、作業者にとっての簡易ガイドラインになる。あとで判断ぶれを減らしたいなら、ここに付与基準を書く方がよい。

## 6. Step 2: `documents` を作る

`documents` は import の中心になる。各要素が 1 文書を表す。

最小形:

```json
[
  {
    "document_name": "record_001",
    "text": "患者は糖尿病の既往がある。",
    "status": "pending",
    "created_at": "2026-03-01T00:00:00Z",
    "updated_at": "2026-03-01T00:00:00Z",
    "annotations": []
  }
]
```

各項目の意味:

- `document_name`: 文書の表示名
- `text`: annotation の基準になる本文
- `status`: `pending` または `verified`
- `created_at`: 文書作成時刻
- `updated_at`: 文書更新時刻
- `annotations`: 既存 annotation 一覧。最初は空でもよい

`annotations` は省略してもよいが、変換スクリプトやデータ確認を単純にしたいなら空配列で揃える方が扱いやすい。

`document_name` は project 内で重複させない方がよい。append import では、既存 project に同名 document があると失敗する。

## 7. Step 3: `annotations` を入れる

既存 annotation データがある場合だけ、この step を行えばよい。まだ annotation がないなら、この章は飛ばして構わない。

最小形:

```json
[
  {
    "label_name": "疾患名",
    "start": 3,
    "end": 6,
    "span_text": "糖尿病",
    "comment": "",
    "status": "pending"
  }
]
```

重要なのは次の 4 点である。

- `label_name` は `labels[].name` と一致している必要がある
- `start` と `end` は整数である必要がある
- `span_text` は `text[start:end]` と一致している方が安全である
- `status` は `pending` または `verified`

annotation を大量に変換する場合は、変換後に必ず数件を目視確認するとよい。特に改行、全角文字、絵文字、正規化済みテキストを含むデータでは、位置ずれが起きやすい。

## 8. いちばん詰まりやすいポイント

### 8.1 `start` / `end` の意味

Layered Span Studio では、区間は 0-index の半開区間で扱う。

- `start`: 含む
- `end`: 含まない

つまり、実際の文字列は `text[start:end]` で取り出される。

例:

```text
患者は糖尿病の既往がある。
   345
```

`"糖尿病"` を指したいなら、概念上は次のようになる。

```json
{
  "start": 3,
  "end": 6,
  "span_text": "糖尿病"
}
```

実際の index は変換元テキストに依存するので、必ず自分のデータで確認すること。

### 8.2 timestamp の形式

`created_at` と `updated_at` は timezone 付き ISO 8601 が必要である。

有効な例:

- `2026-03-01T00:00:00Z`
- `2026-03-01T09:00:00+09:00`

無効な例:

- `2026-03-01 00:00:00`
- `2026-03-01T00:00:00`

また、`updated_at` は `created_at` より前にできない。

### 8.3 status の値

`documents[].status` と `annotations[].status` は、どちらも次のどちらかにする。

- `pending`
- `verified`

`draft` などの独自値は使えない。

## 9. 新規 project import と append import の違い

同じ JSON 形式を使うが、import する場所によって意味が異なる。

| 操作場所 | 用途 | 振る舞い |
| --- | --- | --- |
| Project List の `Import Project` | 新しい project を作る | `project.name` を使って新規 project を作る |
| Project Settings の import | 既存 project に追記する | labels / documents / annotations を現在 project に追加する |

違いとして特に重要なのは次の点である。

- 新規 project import では、同名 project が既にあると自動改名される
- append import では、既存 project と同名の label / document があると失敗する
- append import では、payload 側の `project.name` や `project.description` で既存 project 本体は更新されない

「新しく project を作って始めたい」のか、「今ある project に追加したい」のかを先に決めてから JSON を作る方が混乱しにくい。

## 10. import 前チェックリスト

import 前に、次を確認すると失敗をかなり減らせる。

- top-level に `project` / `labels` / `documents` がある
- `project.name` が空でない
- `labels` が配列である
- `documents` が配列である
- `labels[].name` が重複していない
- `documents[].document_name` が重複していない
- `documents[].status` が `pending` または `verified` である
- `created_at` / `updated_at` が timezone 付き ISO 8601 である
- `updated_at >= created_at` を満たしている
- `annotations[].label_name` が存在する label を参照している
- `annotations[].start` と `end` が整数である

## 11. 実際に import する

### 11.1 新しい project として import する

1. Project List を開く
2. `Import Project` を選ぶ
3. JSON ファイルを選択する
4. import 完了後、作成された project の Workspace が開く

### 11.2 既存 project に追記 import する

1. 対象 project の `Project Settings` を開く
2. Import セクションで JSON ファイルを選ぶ
3. append import を実行する
4. 成功すると project bundle が再読み込みされる

append import は部分成功しない。不整合が 1 件でもあると全体が失敗する。

## 12. よくあるエラーと対処

### `project.name` が空である

`project.name` が未設定、または空白だけになっている。project 名を入れる。

### `labels` が配列でない

`labels` が object や `null` になっている。`[]` か、label object の配列にする。

### `documents[0].created_at が timezone-aware ISO 8601 でない`

timestamp に timezone が付いていない。`Z` または `+09:00` のような offset を付ける。

### `既存 label と重複している`

append import 先の project に同名 label が既に存在している。label 名を変えるか、その label を JSON から外す。

### `既存 document と重複している`

append import 先の project に同名 document が既に存在している。`document_name` を見直す。

## 13. 参考資料

- 完全なサンプル JSON: [docs/quickstart-demo-project.json](./quickstart-demo-project.json)
- JSON 形式の正本仕様: [docs/backend/json-schema.md](./backend/json-schema.md)
- Import / Export API の詳細: [docs/backend/api.md](./backend/api.md)

まずは `labels` と `documents` だけを持つ最小 JSON を作り、import が通ることを確認してから annotation 付きデータへ広げるのが最も失敗しにくい進め方である。
