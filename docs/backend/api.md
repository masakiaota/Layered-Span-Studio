# API設計

## 概要

このドキュメントでは、Layered Span Studio の Backend API の全エンドポイントを定義する。

- **認証方式**:
  - Browser: `HttpOnly Cookie + server session`
  - CLI / API client: Bearer Token (JWT)
  - 詳細は `auth.md` を参照
- **データ形式**: JSON - 詳細は `json-schema.md` を参照
- **ベースURL**:
  - Browser: same-origin の `/api`
  - CLI / API client: `http://localhost:8000` (開発時)

---

## API一覧

**注記**
- 原則として全 API は認証が必要
- 未認証で呼べる例外は `POST /auth/session` と `POST /auth/token` のみ
- 以降の `Authorization: Bearer <token>` 記述は CLI / API client 例である
- Browser は session cookie で認証する
- Browser が session cookie で `POST / PUT / PATCH / DELETE` を呼ぶ場合は `X-CSRF-Token` も必要になる

### Auth

- `POST /auth/session` - browser session を作成
- `GET /auth/session` - 現在の browser session を取得
- `DELETE /auth/session` - browser session を破棄
- `POST /auth/token` - CLI / API client 用 Bearer JWT を取得

### Projects

- `GET /projects` - プロジェクト一覧を取得
- `POST /projects` - プロジェクトを作成
- `GET /projects/{project_id}` - プロジェクト詳細を取得
- `PUT /projects/{project_id}/settings` - プロジェクト settings を上書き保存
- `PUT /projects/{project_id}/settings/atomic` - プロジェクト settings と labels を原子的に上書き保存
- `PATCH /projects/{project_id}` - プロジェクトを更新（主に `name` / `description` / `meta`）
- `DELETE /projects/{project_id}` - プロジェクトを削除（配下も連動削除）

### Labels

- `GET /projects/{project_id}/labels` - ラベル一覧を取得
- `PUT /projects/{project_id}/labels` - ラベル一覧を上書き保存
- `POST /projects/{project_id}/labels` - ラベルを作成
- `GET /projects/{project_id}/labels/{label_id}` - ラベル詳細を取得
- `GET /projects/{project_id}/labels/{label_id}/examples` - ラベルの使用例をドキュメント横断で取得
- `GET /projects/{project_id}/labels/{label_id}/surface-groups` - ラベル配下の同一表層グループをドキュメント横断で取得
- `PATCH /projects/{project_id}/labels/{label_id}` - ラベルを更新（色/説明/ショートカット等）
- `DELETE /projects/{project_id}/labels/{label_id}` - ラベルを削除（関連アノテも連動削除）

### Documents

- `GET /projects/{project_id}/documents` - ドキュメント一覧を取得（`offset/limit/search/sort`）
- `POST /projects/{project_id}/documents` - ドキュメントを作成（`text` は作成時のみ）
- `GET /projects/{project_id}/documents/{document_id}/navigation` - 現在 document 基準の `prev/next/next_pending` を取得
- `GET /projects/{project_id}/documents/{document_id}` - ドキュメント詳細を取得（`annotations` 全件含む）
- `PUT /projects/{project_id}/documents/{document_id}/bundle` - 現在 document の annotation 一覧を一括保存
- `PATCH /projects/{project_id}/documents/{document_id}` - ドキュメントの `document_name` / `meta` を更新（`text` は更新不可）
- `DELETE /projects/{project_id}/documents/{document_id}` - ドキュメントを削除（関連アノテも連動削除）

### Annotations

- `GET /projects/{project_id}/annotations/search` - 表層条件でアノテーションをプロジェクト横断検索
- `POST /projects/{project_id}/documents/{document_id}/annotations` - アノテーションを1件作成
- `POST /projects/{project_id}/documents/{document_id}/annotations/bulk` - アノテーションを一括作成（事前アノテ投入向け）
- `GET /projects/{project_id}/documents/{document_id}/annotations/{annotation_id}` - アノテーション詳細を取得
- `PATCH /projects/{project_id}/documents/{document_id}/annotations/{annotation_id}` - アノテーションを更新（主に `comment` / `status` / `meta`）
- `DELETE /projects/{project_id}/documents/{document_id}/annotations/{annotation_id}` - アノテーションを削除

### Import/Export

- `POST /projects/{project_id}/export` - プロジェクト全体をJSONでエクスポート
- `POST /projects/import` - Export JSON から新規プロジェクトを作成してインポート
- `POST /projects/import/preflight` - 新規プロジェクト import の dry-run を実行
- `POST /projects/{project_id}/import` - JSONを既存プロジェクトへ追記インポート（不整合時は全体失敗）
- `POST /projects/{project_id}/import/preflight` - 既存プロジェクト import の dry-run を実行

---

## 認証

詳細は `auth.md` を参照。

### POST /auth/session

username / password で browser session を作成する。

**Request:**
```json
{
  "username": "user1",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "username": "user1",
  "meta": {}
}
```

**Cookies:**
- `lss_session`
- `lss_csrf`

**Error (401 Unauthorized):**
```json
{
  "detail": "Invalid username or password"
}
```

---

### GET /auth/session

現在の browser session に紐づく user 情報を取得する。

**Request:**
- `Cookie: lss_session=...`

**Response (200 OK):**
```json
{
  "id": "uuid",
  "username": "user1",
  "meta": {}
}
```

**Cookie refresh:**
- `lss_csrf` を再発行して揃える

**Error (401 Unauthorized):**
```json
{
  "detail": "Not authenticated"
}
```

---

### DELETE /auth/session

現在の browser session を破棄する。

**Headers:**
```
X-CSRF-Token: <lss_csrf>
```

**Request:**
- `Cookie: lss_session=...`

**Response (204 No Content):**
- body なし
- `lss_session` / `lss_csrf` を失効

**Error:**
- `401 Unauthorized`
- `403 Forbidden`

---

### POST /auth/token

CLI / API client 用 Bearer JWT を発行する。

**Request:**
```json
{
  "username": "user1",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 28800
}
```

**Error (401 Unauthorized):**
```json
{
  "detail": "Invalid username or password"
}
```

---

## Project API

### GET /projects

プロジェクト一覧を取得する。

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "医療文書NER",
      "description": "医療分野の固有表現抽出",
      "meta": {},
      "summary": {
        "labels_count": 12,
        "documents_count": 248,
        "pending_documents_count": 5,
        "updated_at": "2026-03-11T01:23:45Z"
      }
    },
    {
      "id": "uuid",
      "name": "法律文書NER",
      "description": "法律文書からの固有表現抽出",
      "meta": {},
      "summary": {
        "labels_count": 8,
        "documents_count": 90,
        "pending_documents_count": 0,
        "updated_at": "2026-03-08T10:00:00Z"
      }
    }
  ]
}
```

**注記:**
- `summary.labels_count`: project 配下 label の総数
- `summary.documents_count`: project 配下 document の総数
- `summary.pending_documents_count`: `document.status != verified` の document 総数
- `summary.updated_at`: 各 document の `updated_at` の最大値。document が 0 件なら `null`
- 一覧順は backend の既定ソートで返る
  - `pending_documents_count` 降順
  - `updated_at` 降順
  - `name` 昇順

---

### POST /projects

新しいプロジェクトを作成する。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "医療文書NER",
  "description": "医療分野の固有表現抽出",
  "meta": {}
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "name": "医療文書NER",
  "description": "医療分野の固有表現抽出",
  "meta": {}
}
```

**Error (400 Bad Request):**
```json
{
  "detail": "Project name already exists"
}
```

---

### GET /projects/{project_id}

特定のプロジェクトの詳細を取得する。

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "医療文書NER",
  "description": "医療分野の固有表現抽出",
  "meta": {}
}
```

**Error (404 Not Found):**
```json
{
  "detail": "Project not found"
}
```

```json
{
  "detail": "Label not found"
}
```

---

### PATCH /projects/{project_id}

プロジェクト情報を更新する。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "医療文書NER v2",
  "description": "医療分野の固有表現抽出（改訂版）",
  "meta": {}
}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "医療文書NER v2",
  "description": "医療分野の固有表現抽出（改訂版）",
  "meta": {}
}
```

---

### PUT /projects/{project_id}/settings

settings 画面の project フォームを全項目まとめて上書き保存する。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "医療文書NER v2",
  "description": "医療分野の固有表現抽出（改訂版）",
  "meta": {
    "guideline": "共通ガイドライン"
  }
}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "医療文書NER v2",
  "description": "医療分野の固有表現抽出（改訂版）",
  "meta": {
    "guideline": "共通ガイドライン"
  }
}
```

**注記:**
- `name` / `description` / `meta` はすべて必須
- 省略フィールドは保持されない。settings 画面の完全な現在値を送る
- `PATCH /projects/{project_id}` は残るが、settings 画面からはこの API を想定する

---

### PUT /projects/{project_id}/settings/atomic

settings 画面の project フォームと label 一覧を 1 リクエストで原子的に上書き保存する。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "医療文書NER v2",
  "description": "医療分野の固有表現抽出（改訂版）",
  "meta": {
    "guideline": "共通ガイドライン"
  },
  "labels": [
    {
      "id": "uuid-existing",
      "name": "疾患名",
      "color": "#FF5733",
      "description": "疾患や病気の名前",
      "shortcut": "1",
      "meta": {}
    },
    {
      "id": null,
      "name": "薬剤名",
      "color": "#33FF57",
      "description": "薬品や医薬品の名前",
      "shortcut": null,
      "meta": {}
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "project": {
    "id": "uuid",
    "name": "医療文書NER v2",
    "description": "医療分野の固有表現抽出（改訂版）",
    "meta": {
      "guideline": "共通ガイドライン"
    }
  },
  "labels": [
    {
      "id": "uuid-existing",
      "project_id": "uuid",
      "project_name": "医療文書NER v2",
      "name": "疾患名",
      "color": "#FF5733",
      "description": "疾患や病気の名前",
      "shortcut": "1",
      "meta": {}
    },
    {
      "id": "uuid-new",
      "project_id": "uuid",
      "project_name": "医療文書NER v2",
      "name": "薬剤名",
      "color": "#33FF57",
      "description": "薬品や医薬品の名前",
      "shortcut": null,
      "meta": {}
    }
  ]
}
```

**注記:**
- `name` / `description` / `meta` / `labels` はすべて必須
- project 更新と labels 同期を同一トランザクションで扱う
- `labels` は最終状態全件を表す。request に含まれない既存 label は削除される
- `id: null` は新規 label として作成される
- response の `labels` は `GET /projects/{project_id}/labels` と同じ形で返す
- browser settings 画面は partial success を避けたいときにこの API を使う想定

**Error (404 Not Found):**
```json
{
  "detail": "Project not found"
}
```

---

### DELETE /projects/{project_id}

プロジェクトを削除する。関連する全てのラベル、ドキュメント、アノテーションも削除される。

**Headers:**
```
Authorization: Bearer <token>
```

**Response (204 No Content)**

**Error (404 Not Found):**
```json
{
  "detail": "Project not found"
}
```

---

## Label API

### GET /projects/{project_id}/labels

プロジェクトの全ラベルを取得する。

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "labels": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "name": "疾患名",
      "color": "#FF5733",
      "description": "疾患や病気の名前",
      "shortcut": "d",
      "meta": {}
    },
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "name": "薬剤名",
      "color": "#33FF57",
      "description": "薬品や医薬品の名前",
      "shortcut": "m",
      "meta": {}
    }
  ]
}
```

---

### PUT /projects/{project_id}/labels

project 配下の label 一覧を現在値で上書き保存する。request の `labels` は最終状態全件を表す。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "labels": [
    {
      "id": "uuid",
      "name": "疾患名",
      "color": "#FF6644",
      "description": "更新後の説明",
      "shortcut": "d",
      "meta": {}
    },
    {
      "id": null,
      "name": "薬剤名",
      "color": "#33FF57",
      "description": "薬品や医薬品の名前",
      "shortcut": "m",
      "meta": {}
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "labels": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "name": "疾患名",
      "color": "#FF6644",
      "description": "更新後の説明",
      "shortcut": "d",
      "meta": {}
    },
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "name": "薬剤名",
      "color": "#33FF57",
      "description": "薬品や医薬品の名前",
      "shortcut": "m",
      "meta": {}
    }
  ]
}
```

**注記:**
- `id = null` は新規 label 作成
- request に含まれない既存 label は削除
- payload 内 duplicate name / duplicate id は `400`
- unknown id は `404`

---

### POST /projects/{project_id}/labels

新しいラベルを作成する。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "疾患名",
  "color": "#FF5733",
  "description": "疾患や病気の名前",
  "shortcut": "d",
  "meta": {}
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "project_name": "医療文書NER",
  "name": "疾患名",
  "color": "#FF5733",
  "description": "疾患や病気の名前",
  "shortcut": "d",
  "meta": {}
}
```

**Error (400 Bad Request):**
```json
{
  "detail": "Label name already exists in this project"
}
```

---

### GET /projects/{project_id}/labels/{label_id}

特定のラベルの詳細を取得する。

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "project_name": "医療文書NER",
  "name": "疾患名",
  "color": "#FF5733",
  "description": "疾患や病気の名前。例：糖尿病、高血圧など",
  "shortcut": "d",
  "meta": {}
}
```

---

### GET /projects/{project_id}/labels/{label_id}/examples

指定ラベルのアノテーション例を、同一プロジェクト内のドキュメントを横断して取得する。将来的な LLM 連携やガイドライン補助での事例取得も想定する。

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `offset` (integer, optional): `sample=sequential` 時にスキップする件数（デフォルト: 0）
- `limit` (integer, optional): 取得上限（デフォルト: 50, 最小: 1, 最大: 100）
- `status` (string, optional): `pending` / `verified` / `all`（デフォルト: `verified`）
- `sample` (string, optional): `sequential` / `random`（デフォルト: `sequential`）
- `seed` (integer, optional): `sample=random` のときの再現性制御
- `context_window` (integer, optional): 前後文脈の文字数（デフォルト: 20, 最小: 0, 最大: 200）

**Response (200 OK):**
```json
{
  "examples": [
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
  ],
  "total_matched": 18,
  "offset_applied": 0,
  "limit": 50,
  "status": "verified",
  "sample": "sequential",
  "seed": null,
  "context_window": 20
}
```

**Error (404 Not Found):**
```json
{
  "detail": "Label not found"
}
```

**Error (422 Unprocessable Entity):**
```json
{
  "detail": "validation error"
}
```

**注記:**
- `status` 未指定時は `verified` のみ返す
- `status=all` のときに `pending` と `verified` の両方を返す
- `sample=sequential` は `document_name ASC, start ASC, id ASC` の安定順で返す
- `sample=random` は重複なし抽出で返す
- `sample=random` の場合、`offset` は無効で `offset_applied` は常に `0`
- `seed` を指定すると `sample=random` の結果を再現可能
- 実装上は `sample=sequential` の絞り込みとページングを SQL 側で処理し、service は前後文脈生成とレスポンス整形を担う

---

### GET /projects/{project_id}/labels/{label_id}/surface-groups

指定ラベルのアノテーションを、`span_text` の完全一致ごとに集約して取得する。Workspace 右ペインの `同一ラベルの他アノテーション` 向けの API である。

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `offset` (integer, optional): スキップする件数（デフォルト: 0）
- `limit` (integer, optional): 取得上限（デフォルト: 50, 最小: 1, 最大: 100）
- `status` (string, optional): `pending` / `verified` / `all`（デフォルト: `verified`）
- `context_window` (integer, optional): representative 事例の前後文脈文字数（デフォルト: 20, 最小: 0, 最大: 200）
- `exclude_annotation_id` (string, optional): 現在選択中 annotation を一覧から除外したいときに使う

**Response (200 OK):**
```json
{
  "items": [
    {
      "surface_text": "糖尿病",
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
  ],
  "total": 36,
  "offset": 0,
  "limit": 50,
  "status": "verified",
  "context_window": 20,
  "exclude_annotation_id": null
}
```

**注記:**
- `duplicate_count` は同一 `surface_text` に完全一致する annotation 件数
- `representative` は該当グループの表示代表であり、優先順は `verified`、次に `document_name ASC`、`start ASC`、`annotation_id ASC`
- 実装上は repository が SQL で絞り込み・集約・ページングを行い、service は representative の前後文脈生成とレスポンス整形のみを担う

---

### PATCH /projects/{project_id}/labels/{label_id}

ラベル情報を更新する。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "description": "疾患や病気の名前。ICD-10コードに準拠",
  "color": "#FF6644"
}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "project_name": "医療文書NER",
  "name": "疾患名",
  "color": "#FF6644",
  "description": "疾患や病気の名前。ICD-10コードに準拠",
  "shortcut": "d",
  "meta": {}
}
```

---

### DELETE /projects/{project_id}/labels/{label_id}

ラベルを削除する。このラベルを使用している全てのアノテーションも削除される。

**Headers:**
```
Authorization: Bearer <token>
```

**Response (204 No Content)**

**Error (404 Not Found):**
```json
{
  "detail": "Label not found"
}
```

---

## Document API

### GET /projects/{project_id}/documents

プロジェクト内のドキュメント一覧を取得する。

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `offset` (integer, optional): スキップする件数（デフォルト: 0）
- `limit` (integer, optional): 取得する最大件数（デフォルト: 50, 最大: 100）
- `search` (string, optional): `Document.text` に対する単純な部分一致検索。大文字小文字差は無視し、`%` / `_` も通常文字として扱う
- `sort` (string, optional): `created` / `pending` / `updated` / `name`（デフォルト: `created`）

**Response (200 OK):**
```json
{
  "documents": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "document_name": "患者記録_001",
      "text": "患者は頭痛を訴え、アスピリンを処方された。既往歴に糖尿病あり。",
      "status": "pending",
      "created_at": "2026-03-11T01:23:45Z",
      "updated_at": "2026-03-11T01:23:45Z",
      "meta": {
        "source": "hospital_records"
      }
    },
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "document_name": "患者記録_002",
      "text": "患者は腹痛で来院。検査の結果、胃潰瘍と診断。",
      "status": "verified",
      "created_at": "2026-03-10T10:00:00Z",
      "updated_at": "2026-03-11T08:00:00Z",
      "meta": {}
    }
  ],
  "total": 120,
  "pending_total": 48,
  "offset": 0,
  "limit": 50,
  "search": "",
  "sort": "created"
}
```

**注記:**
- `offset/limit` 方式のページングを採用（シンプルさを優先）
- `pending_total` は検索条件に一致した document 集合のうち `status != "verified"` の件数
- `search` は `document_name` ではなく `text` にのみ適用する
- `search` は SQL LIKE ではなく、`%` / `_` も通常文字として扱う
- `sort=pending` は `pending` を先頭に寄せ、その後 `document_name ASC` で並べる
- `sort=updated` は `updated_at` 降順を基本とする
- `sort=created` は `created_at` 昇順を基本とする

---

### POST /projects/{project_id}/documents

新しいドキュメントを作成する。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "document_name": "患者記録_001",
  "text": "患者は頭痛を訴え、アスピリンを処方された。既往歴に糖尿病あり。",
  "meta": {
    "source": "hospital_records",
    "date": "2024-01-15"
  }
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "project_name": "医療文書NER",
  "document_name": "患者記録_001",
  "text": "患者は頭痛を訴え、アスピリンを処方された。既往歴に糖尿病あり。",
  "status": "pending",
  "created_at": "2026-03-11T01:23:45Z",
  "updated_at": "2026-03-11T01:23:45Z",
  "meta": {
    "source": "hospital_records",
    "date": "2024-01-15"
  }
}
```

**Error (400 Bad Request):**
```json
{
  "detail": "Document name already exists in this project"
}
```

---

### GET /projects/{project_id}/documents/{document_id}/navigation

現在の検索条件・並び順における、対象 document の前後関係を取得する。

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `search` (string, optional): `GET /projects/{project_id}/documents` と同じ検索条件
- `sort` (string, optional): `created` / `pending` / `updated` / `name`（デフォルト: `created`）

**Response (200 OK):**
```json
{
  "current_document_id": "uuid-current",
  "prev_document_id": "uuid-prev",
  "next_document_id": "uuid-next",
  "next_pending_document_id": "uuid-next-pending",
  "search": "target",
  "sort": "name"
}
```

**注記:**
- `prev_document_id` / `next_document_id` は現在の `search` / `sort` 適用後の隣接 document を表す
- `next_pending_document_id` は現在位置より後方にある最初の `status != "verified"` document を返す
- `next_pending_document_id` は前方への wrap をしない
- 候補が存在しない場合は `null` を返す

**Error (404 Not Found):**
```json
{
  "detail": "Document not found in current filtered documents"
}
```

```json
{
  "detail": "Document not found"
}
```

---

### GET /projects/{project_id}/documents/{document_id}

特定のドキュメントの詳細（アノテーション含む）を取得する。

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "project_name": "医療文書NER",
  "document_name": "患者記録_001",
  "text": "患者は頭痛を訴え、アスピリンを処方された。既往歴に糖尿病あり。",
  "status": "pending",
  "created_at": "2026-03-11T01:23:45Z",
  "updated_at": "2026-03-11T01:23:45Z",
  "annotations": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "document_name": "患者記録_001",
      "label_id": "uuid",
      "label_name": "症状",
      "start": 3,
      "end": 5,
      "span_text": "頭痛",
      "comment": "",
      "status": "verified",
      "meta": {}
    },
    {
      "id": "uuid",
      "document_id": "uuid",
      "document_name": "患者記録_001",
      "label_id": "uuid",
      "label_name": "薬剤名",
      "start": 9,
      "end": 14,
      "span_text": "アスピリン",
      "comment": "",
      "status": "verified",
      "meta": {}
    },
    {
      "id": "uuid",
      "document_id": "uuid",
      "document_name": "患者記録_001",
      "label_id": "uuid",
      "label_name": "疾患名",
      "start": 24,
      "end": 27,
      "span_text": "糖尿病",
      "comment": "",
      "status": "pending",
      "meta": {
        "confidence": 0.85,
        "source": "llm_pre_annotation"
      }
    }
  ],
  "meta": {
    "source": "hospital_records"
  }
}
```

**注記:**
- `annotations` は一旦全件返す設計
- 将来的にクエリパラメータで条件を絞る機能を追加する可能性がある（例: `?label_id=xxx`, `?status=verified`）

---

### PATCH /projects/{project_id}/documents/{document_id}

ドキュメントのメタデータを更新する。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "document_name": "患者記録_001_revised",
  "meta": {
    "source": "hospital_records",
    "date": "2024-01-15",
    "reviewed": true
  }
}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "project_name": "医療文書NER",
  "document_name": "患者記録_001_revised",
  "text": "患者は頭痛を訴え、アスピリンを処方された。既往歴に糖尿病あり。",
  "status": "pending",
  "created_at": "2026-03-11T01:23:45Z",
  "updated_at": "2026-03-12T02:00:00Z",
  "meta": {
    "source": "hospital_records",
    "date": "2024-01-15",
    "reviewed": true
  }
}
```

**注記:**
- `text` フィールドは更新不可（既存のアノテーションが壊れるため）
- `document_name` と `meta` のみ更新可能

---

### PUT /projects/{project_id}/documents/{document_id}/bundle

現在の document に対する annotation 一覧を一括保存する。request の `annotations` はその document の最終状態全件を表す。通常の Save では現在状態をそのまま送り、Submit では frontend が `pending` を `verified` に変換したうえで同じ endpoint に送る。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "submit": true,
  "annotations": [
    {
      "id": "uuid",
      "label_id": "uuid",
      "start": 0,
      "end": 5,
      "span_text": "Hello",
      "comment": "updated",
      "status": "verified",
      "meta": {
        "source": "bundle"
      }
    },
    {
      "id": null,
      "label_id": "uuid",
      "start": 6,
      "end": 11,
      "span_text": "world",
      "comment": "",
      "status": "pending",
      "meta": {}
    }
  ]
}
```

**Response (200 OK):**
- `GET /projects/{project_id}/documents/{document_id}` と同じ full document を返す

**注記:**
- request に含まれない既存 annotation は削除される
- `id: null` は新規 annotation として作成される
- 既存 annotation の `label_id/start/end/span_text` は変更不可
- `updated_at` は backend が管理する
- `submit` は optional で、未指定時は `false`
- annotation が 1 件以上ある場合、document `status` は保存後の annotation 一覧から backend が再計算する
- annotation が 0 件の場合
  - `submit=false` なら既存 document `status` を維持する
  - `submit=true` なら document `status` を `verified` にする

---

### DELETE /projects/{project_id}/documents/{document_id}

ドキュメントを削除する。関連する全てのアノテーションも削除される。

**Headers:**
```
Authorization: Bearer <token>
```

**Response (204 No Content)**

**Error (404 Not Found):**
```json
{
  "detail": "Document not found"
}
```

---

## Annotation API

### GET /projects/{project_id}/annotations/search

表層文字列を条件に、annotation をプロジェクト横断で検索する。Workspace 右ペインの `同一表層の他アノテーション` 向け API である。

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `text` (string, required): 検索対象の表層
- `status` (string, optional): `pending` / `verified` / `all`（デフォルト: `verified`）
- `label_id` (string, optional): 指定時は他ラベル事例を上位に寄せるための比較基準として使う
- `exclude_annotation_id` (string, optional): 現在選択中 annotation を除外したいときに使う
- `offset` (integer, optional): スキップする件数（デフォルト: 0）
- `limit` (integer, optional): 取得上限（デフォルト: 50, 最小: 1, 最大: 100）
- `context_window` (integer, optional): 前後文脈の文字数（デフォルト: 20, 最小: 0, 最大: 200）

**Response (200 OK):**
```json
{
  "items": [
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
  ],
  "total": 14,
  "offset": 0,
  "limit": 50,
  "text": "糖尿病",
  "status": "all",
  "context_window": 20,
  "label_id": "uuid",
  "exclude_annotation_id": null
}
```

**注記:**
- `text` は `span_text` への完全一致として扱う
- `label_id` 指定時は、同一表層の中で「他ラベルの事例」を先に返す

---

### POST /projects/{project_id}/documents/{document_id}/annotations

新しいアノテーションを作成する。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "label_id": "uuid",
  "start": 3,
  "end": 5,
  "span_text": "頭痛",
  "comment": "典型的な症状表現",
  "status": "verified",
  "meta": {}
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "document_id": "uuid",
  "document_name": "患者記録_001",
  "label_id": "uuid",
  "label_name": "症状",
  "start": 3,
  "end": 5,
  "span_text": "頭痛",
  "comment": "典型的な症状表現",
  "status": "verified",
  "meta": {}
}
```

**Error (400 Bad Request):**
```json
{
  "detail": "span_text does not match the specified range"
}
```

**注記:**
- `span_text` の整合性チェック: リクエストの `span_text` が `document.text[start:end]` と一致するかを検証
- `status` は必須（`pending` または `verified`）
- 同一ドキュメント内で、同一ラベルの区間重複は不可（400）
  - 判定は半開区間 `[start, end)` を使用
  - 判定式は `existing.start < new.end && existing.end > new.start`
  - 隣接区間（`existing.end == new.start`）は重複ではない
  - 異なるラベル同士の区間重複は許可

---

### POST /projects/{project_id}/documents/{document_id}/annotations/bulk

複数のアノテーションを一括で作成する（事前アノテーション用）。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "annotations": [
    {
      "label_id": "uuid",
      "start": 3,
      "end": 5,
      "span_text": "頭痛",
      "comment": "",
      "status": "pending",
      "meta": {
        "confidence": 0.95,
        "source": "llm_pre_annotation"
      }
    },
    {
      "label_id": "uuid",
      "start": 24,
      "end": 27,
      "span_text": "糖尿病",
      "comment": "",
      "status": "pending",
      "meta": {
        "confidence": 0.88,
        "source": "llm_pre_annotation"
      }
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "created": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "document_name": "患者記録_001",
      "label_id": "uuid",
      "label_name": "症状",
      "start": 3,
      "end": 5,
      "span_text": "頭痛",
      "comment": "",
      "status": "pending",
      "meta": {
        "confidence": 0.95,
        "source": "llm_pre_annotation"
      }
    },
    {
      "id": "uuid",
      "document_id": "uuid",
      "document_name": "患者記録_001",
      "label_id": "uuid",
      "label_name": "疾患名",
      "start": 24,
      "end": 27,
      "span_text": "糖尿病",
      "comment": "",
      "status": "pending",
      "meta": {
        "confidence": 0.88,
        "source": "llm_pre_annotation"
      }
    }
  ],
  "errors": []
}
```

**注記:**
- LLMや外部ツールからの事前アノテーション投入を想定
- バルク作成は all-or-nothing で処理し、1件でも不正があれば 400 を返す
- 同一ドキュメント内で、同一ラベルの区間重複は不可（400）
  - 判定は半開区間 `[start, end)` を使用
  - 判定式は `existing.start < new.end && existing.end > new.start`
  - 隣接区間（`existing.end == new.start`）は重複ではない
  - 異なるラベル同士の区間重複は許可

---

### GET /projects/{project_id}/documents/{document_id}/annotations/{annotation_id}

特定のアノテーションの詳細を取得する。

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "document_id": "uuid",
  "document_name": "患者記録_001",
  "label_id": "uuid",
  "label_name": "症状",
  "start": 3,
  "end": 5,
  "span_text": "頭痛",
  "comment": "典型的な症状表現",
  "status": "verified",
  "meta": {}
}
```

---

### PATCH /projects/{project_id}/documents/{document_id}/annotations/{annotation_id}

アノテーションを更新する。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "comment": "確認済み：典型的な症状表現",
  "status": "verified",
  "meta": {
    "reviewer": "user1"
  }
}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "document_id": "uuid",
  "document_name": "患者記録_001",
  "label_id": "uuid",
  "label_name": "症状",
  "start": 3,
  "end": 5,
  "span_text": "頭痛",
  "comment": "確認済み：典型的な症状表現",
  "status": "verified",
  "meta": {
    "reviewer": "user1"
  }
}
```

**注記:**
- `start`, `end`, `span_text`, `label_id` は更新不可（既存のアノテーションが壊れるため）
- `comment`, `status`, `meta` のみ更新可能

---

### DELETE /projects/{project_id}/documents/{document_id}/annotations/{annotation_id}

アノテーションを削除する。

**Headers:**
```
Authorization: Bearer <token>
```

**Response (204 No Content)**

**Error (404 Not Found):**
```json
{
  "detail": "Annotation not found"
}
```

---

## Import/Export API

### POST /projects/{project_id}/export

プロジェクト全体をエクスポートする。

**Headers:**
```
Authorization: Bearer <token>
```

**Request (Optional):**
```json
{
  "include_pending": true,
  "include_verified": true
}
```

**Response (200 OK):**
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
      "color": "#FF5733",
      "description": "疾患や病気の名前",
      "shortcut": "d",
      "meta": {}
    },
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "name": "薬剤名",
      "color": "#33FF57",
      "description": "薬品や医薬品の名前",
      "shortcut": "m",
      "meta": {}
    }
  ],
  "documents": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "document_name": "患者記録_001",
      "text": "患者は頭痛を訴え、アスピリンを処方された。既往歴に糖尿病あり。",
      "status": "pending",
      "created_at": "2026-03-11T01:23:45Z",
      "updated_at": "2026-03-11T01:23:45Z",
      "annotations": [
        {
          "id": "uuid",
          "document_id": "uuid",
          "document_name": "患者記録_001",
          "label_id": "uuid",
          "label_name": "症状",
          "start": 3,
          "end": 5,
          "span_text": "頭痛",
          "comment": "",
          "status": "verified",
          "meta": {}
        },
        {
          "id": "uuid",
          "document_id": "uuid",
          "document_name": "患者記録_001",
          "label_id": "uuid",
          "label_name": "疾患名",
          "start": 24,
          "end": 27,
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
    "format": "layered-span-studio/export",
    "version": "1.0"
  }
}
```

**注記:**
- `json-schema.md` で定義した Export 形式に準拠
- ファイルとしてダウンロードする場合は `Content-Disposition: attachment` ヘッダーを付与

---

### POST /projects/import

Export JSON から新しいプロジェクトを作成してインポートする。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
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
      "color": "#FF5733",
      "description": "疾患や病気の名前",
      "shortcut": "d",
      "meta": {}
    }
  ],
  "documents": [
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
          "start": 24,
          "end": 27,
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
    "format": "layered-span-studio/export",
    "version": "1.0"
  }
}
```

**Response (201 Created):**
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

**注記:**
- Export JSON と同じ payload 形式をそのまま受け付ける
- payload の `project.name` / `project.description` / `project.meta` を新規プロジェクトの初期値として使う
- payload の `id`（project/labels/documents/annotations）や `project_id` / `document_id` / `label_id` は無視し、新しい UUID を生成する
- 同名プロジェクトが既に存在する場合は、自動で `"(imported)"`, `"(imported 2)"` ... の suffix を付けて一意な名前にする
- `documents[].created_at` / `documents[].updated_at` は timezone 付き ISO 8601 必須。受理後は UTC (`Z`) に正規化して保存する
- `documents[].updated_at >= documents[].created_at` が必須
- payload の `labels` / `documents` / `annotations` に不整合がある場合は、インポート全体を中断する（400）

---

### POST /projects/import/preflight

新規プロジェクト import の dry-run を実行する。project は作成しない。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
- `POST /projects/import` と同じ payload を受け付ける

**Response (200 OK):**
```json
{
  "ok": true,
  "resolved_project_name": "医療文書NER (imported)",
  "imported": {
    "labels": 1,
    "documents": 1,
    "annotations": 1
  },
  "errors": []
}
```

```json
{
  "ok": false,
  "resolved_project_name": null,
  "imported": {
    "labels": 1,
    "documents": 1,
    "annotations": 1
  },
  "errors": [
    {
      "message": "Label description is required"
    }
  ]
}
```

**注記:**
- top-level payload が壊れていても 422 ではなく同じ response 契約で返す
- `resolved_project_name` は name 重複解決後に実際に採用される予定名
- `ok=false` のときも `imported` には payload から読める件数を返す
- preflight 実行後も project 一覧や DB 状態は変化しない

---

### POST /projects/{project_id}/import

既存プロジェクトに対して、labels / documents / annotations を追記インポートする。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
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
      "color": "#FF5733",
      "description": "疾患や病気の名前",
      "shortcut": "d",
      "meta": {}
    }
  ],
  "documents": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "project_name": "医療文書NER",
      "document_name": "患者記録_001",
      "text": "患者は頭痛を訴え、アスピリンを処方された。既往歴に糖尿病あり。",
      "status": "pending",
      "created_at": "2026-03-11T01:23:45Z",
      "updated_at": "2026-03-11T01:23:45Z",
      "annotations": [
        {
          "id": "uuid",
          "document_id": "uuid",
          "document_name": "患者記録_001",
          "label_id": "uuid",
          "label_name": "疾患名",
          "start": 24,
          "end": 27,
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
    "format": "layered-span-studio/export",
    "version": "1.0"
  }
}
```

**Response (200 OK):**
```json
{
  "imported": {
    "labels": 1,
    "documents": 1,
    "annotations": 1
  },
  "errors": []
}
```

**注記:**
- URL の `project_id` が正。payload の `project.id` や各エンティティの `project_id` は無視
- payload の `project.name` / `project.description` / `project.meta` は受け取るが、既存プロジェクト情報の更新には使わない
- インポート時は `id`（project/labels/documents/annotations）を無視し、新しい UUID を生成
- payload の `labels` に既存ラベル名と同名が含まれている場合は、競合としてインポート全体を中断（400）
- `documents[].created_at` / `documents[].updated_at` は timezone 付き ISO 8601 必須。受理後は UTC (`Z`) に正規化して保存する
- `documents[].updated_at >= documents[].created_at` が必須
- `label_name` は「既存ラベル」または「今回 payload に含めた新規ラベル」を参照可能
- 同一ドキュメント内で、同一ラベルの区間重複は不可（400）
  - 判定は半開区間 `[start, end)` を使用
  - 判定式は `existing.start < new.end && existing.end > new.start`
  - 隣接区間（`existing.end == new.start`）は重複ではない
- 異なるラベル同士の区間重複は許可
- 不整合データがある場合は部分成功せず、インポート全体を中断（400）

---

### POST /projects/{project_id}/import/preflight

既存 project への append import の dry-run を実行する。labels / documents / annotations はまだ作成しない。

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
- `POST /projects/{project_id}/import` と同じ payload を受け付ける

**Response (200 OK):**
```json
{
  "ok": true,
  "imported": {
    "labels": 1,
    "documents": 1,
    "annotations": 1
  },
  "errors": []
}
```

```json
{
  "ok": false,
  "imported": {
    "labels": 1,
    "documents": 1,
    "annotations": 1
  },
  "errors": [
    {
      "message": "Label name already exists in this project"
    }
  ]
}
```

**注記:**
- top-level payload が壊れていても 422 ではなく同じ response 契約で返す
- `ok=false` のときも `imported` には payload から読める件数を返す
- conflict 判定は backend に保存済みの label / document 一覧を基準に行う
- preflight 実行後も target project の labels / documents は変化しない

**Error (404 Not Found):**
```json
{
  "detail": "Project not found"
}
```

---

## エラーレスポンス

全てのエラーレスポンスは以下の形式に従う。

```json
{
  "detail": "エラーメッセージ"
}
```

### HTTPステータスコード

- `200 OK`: 成功
- `201 Created`: リソース作成成功
- `204 No Content`: 削除成功
- `400 Bad Request`: リクエストが不正
- `401 Unauthorized`: 認証が必要
- `403 Forbidden`: 権限がない
- `404 Not Found`: リソースが見つからない
- `500 Internal Server Error`: サーバーエラー

---

## 設計方針

### ページング

- Document一覧には `offset/limit` 方式を採用
- Document一覧は `search` / `sort` を同時指定可能
- 右ペイン向けの `surface-groups` / `annotations/search` も `offset/limit` を持つ
- `surface-groups` / `annotations/search` は全件を service にロードせず、repository の SQL で絞り込み・集約・ページングする
- シンプルさを優先し、将来的に cursor 方式への移行も検討可能

### データの不変性

- `Document.text` は作成後は不変（既存アノテーションが壊れるのを防ぐため）
- `Annotation` の `start`, `end`, `span_text`, `label_id` も更新不可

### アノテーション全件返却

- Document詳細取得時は annotations を一旦全件返す
- 将来的にクエリパラメータで絞り込み機能を追加する可能性がある

### 整合性チェック

- アノテーション作成時に `span_text` が `document.text[start:end]` と一致するかを検証
- Backend が `document_name`, `label_name` を自動補完（source of truth は `documents`, `labels` テーブル）

---

## 今後の拡張

以下の機能は将来的に追加を検討する。

1. **Document一覧の検索・フィルタリング**
   - `?document_name=xxx`
   - `?meta.source=xxx`

2. **Annotation一覧の絞り込み**
   - `?label_id=xxx`
   - `?status=pending`

3. **Label単位でのAnnotation取得**
   - `GET /projects/{project_id}/documents/{document_id}/layers/{label_id}/annotations`
   - ツールの特色である「レイヤー単位の独立したスパン管理」を反映

4. **統計情報API**
   - プロジェクトの進捗状況
   - ラベルごとのアノテーション数
   - pending/verified の割合

5. **バッチ操作**
   - 複数アノテーションの一括更新
   - 複数ドキュメントの一括削除
