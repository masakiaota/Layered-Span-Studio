# 認証・認可（Backend）

このドキュメントは Layered Span Studio の **APIレベルの認証/認可** と、**ユーザー名・パスワードの保存方法** を定義します。

前提:
- フロントエンド/バックエンドが同一サーバーで動く可能性があっても、APIはUIを介さず直接叩けます。したがって「フロントにログイン画面がある」だけでは防御になりません。
- まずはシンプルに始めます（権限設計は最小）。

## 目的

- **認証**: username/passwordでログインし、以後のAPI呼び出しに対して「ログイン済みユーザー」を識別できるようにする
- **認可**: 当面は「ログイン済みなら全APIを利用可能」。将来、プロジェクト単位の権限制御に拡張できる形にする

## 採用方式（Bearer Token / JWT）

### 概要

1. クライアントが `POST /auth/login` に username/password を送る
2. バックエンドが認証できたら **アクセストークン（JWT）** を返す
3. 以後のリクエストはヘッダ `Authorization: Bearer <token>` を付けて呼ぶ

### トークンの性質

- **短命**（例: 8時間）
- **署名付き**（改ざん検知）
- トークンがあればAPIを呼べるため、クライアント側での扱いは慎重に行う

## API仕様（最小セット）

### `POST /auth/login`

#### Request JSON

```json
{
  "username": "alice",
  "password": "password"
}
```

#### Response JSON（200）

```json
{
  "access_token": "jwt-string",
  "token_type": "bearer",
  "expires_in": 28800
}
```

- `expires_in`: 秒（例: 8時間 = 28800）

#### Error

- 401: username/passwordが不正

---

### `GET /auth/me`

#### Headers

- `Authorization: Bearer <access_token>`

#### Response JSON（200）

```json
{
  "id": "uuid",
  "username": "alice",
  "meta": {}
}
```

#### Error

- 401: トークンなし、期限切れ、署名不正

---

## 保護ルール（どのAPIが認証必須か）

- `POST /auth/login` は **認証不要**
- それ以外は原則 **認証必須**
  - トークンがない場合は 401

## 認可（いまは最小）

現時点では「認証できたユーザーは全操作が可能」です。

将来の拡張（必要になってから）:
- `role`（admin/annotatorなど）
- projectごとのアクセス制御（project_membershipsテーブル等）

## JWTの中身（claims）

最小で次を含めます:
- `sub`: user_id（UUID文字列）
- `exp`: 有効期限（UNIX time）
- `iat`: 発行時刻（任意）

必要になったら追加:
- `username`（デバッグ用途）
- `roles`（権限）

## ユーザー名・パスワードの保存方法

### 絶対に守ること

- **パスワードを平文で保存しない**
- 保存するのは **ハッシュ** のみ（`password_hash`）

### 推奨ハッシュ方式

- `argon2`（現行実装）
  - saltはライブラリに任せる
  - パラメータはライブラリ既定値を基準に運用

補足:
- `bcrypt` でも実装可能だが、現在の実装では `argon2-cffi` を使用している

### ユーザー保存先（アプリ全体で共通）

ユーザーは「プロジェクトごと」ではなく「アプリ全体」で共通にします。

例:

```
backend/data/
└── app.db   # users 等（認証系を集約）
```

プロジェクトDB（`backend/data/projects/{project_id}/database.db`）とは分ける想定です。

### `users` テーブル（案）

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  meta TEXT
);
```

メモ:
- `meta` は任意JSON（将来の拡張用）

## シークレット管理（JWT署名鍵）

- JWTの署名鍵は **環境変数** で管理します（例: `JWT_SECRET`）
- リポジトリにコミットしない

運用メモ:
- 本番相当で運用するなら、HTTPS（TLS）前提にする

## クライアント側のトークン取り扱い（最低限の方針）

- まずはシンプルにするため、トークンはクライアントで保持する
- 現行 frontend 実装では、Bearer JWT を `localStorage` に保存している
- ただしこれは暫定方針であり、リポジトリ管理の `TODO.md` にある通り見直し対象である
  - Browser 向けは `HttpOnly Cookie` ベースのサーバセッション方式を第一候補として検討する
  - CLI / API クライアント用途を残すため、Bearer JWT の併用可否も含めて再設計する
- `localStorage` 継続時は利便性が高い一方、XSS 対策が重要になる

## 今後追加しやすい要素

- refresh token（長期ログイン）
- logout（トークンの失効管理）
- パスワード変更
- 管理者ユーザー作成フロー（初回セットアップ）
