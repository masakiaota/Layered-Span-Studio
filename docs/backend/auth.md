# 認証・認可（Backend）

このドキュメントは Layered Span Studio の API レベルの認証/認可と、認証系データの持ち方を定義する。

前提:
- Browser と CLI / API client は、使いやすさと安全性が異なるため認証方式を分ける。
- Browser 向けは same-origin 前提で運用する。開発時は frontend dev server が `/api` を backend に proxy する。
- 権限設計は当面最小で、「認証済みなら全 API を使える」とする。

## 採用方式

### Browser

- `HttpOnly Cookie + server session`
- Browser は `lss_session` Cookie を自動送信する
- frontend は `localStorage` に認証情報を保存しない
- 更新系 request では CSRF 対策として `X-CSRF-Token` を付ける

### CLI / API client

- `Authorization: Bearer <JWT>`
- `POST /auth/token` で短命 JWT を取得する
- JWT の即時失効や denylist は今回入れない

## Auth API

### `POST /auth/session`

Browser session を作成する。

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
  "id": "uuid",
  "username": "alice",
  "meta": {}
}
```

#### Set-Cookie

- `lss_session=<opaque-session-id>; HttpOnly; SameSite=Lax; Path=/`
- `lss_csrf=<random-token>; SameSite=Lax; Path=/`

補足:
- `Secure` は HTTPS 環境で付与する
- `lss_csrf` は JS から読める Cookie で、unsafe method の `X-CSRF-Token` に転写して使う

#### Error

- `401 Unauthorized`: username/password が不正

---

### `GET /auth/session`

現在の Browser session に紐づく user を返す。

#### Cookie

- `lss_session=<opaque-session-id>`

#### Response JSON（200）

```json
{
  "id": "uuid",
  "username": "alice",
  "meta": {}
}
```

#### Side Effect

- 有効な session がある場合、`lss_csrf` Cookie を再発行する

#### Error

- `401 Unauthorized`: session なし、期限切れ、無効 session

---

### `DELETE /auth/session`

Browser session を破棄する。

#### Cookie / Header

- `lss_session=<opaque-session-id>`
- `X-CSRF-Token: <lss_csrf の値>`

#### Response（204）

- body なし
- `lss_session` と `lss_csrf` を失効させる

#### Error

- `403 Forbidden`: CSRF token 不一致

---

### `POST /auth/token`

CLI / API client 向け Bearer JWT を発行する。

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

#### Error

- `401 Unauthorized`: username/password が不正

## 保護 API の認証ルール

- `POST /auth/session`
- `GET /auth/session`
- `DELETE /auth/session`
- `POST /auth/token`

以外の API は原則認証必須とする。

認証判定の優先順位:
1. `Authorization: Bearer <token>` があれば Bearer JWT として検証する
2. Authorization が無い場合のみ `lss_session` Cookie を見る
3. invalid Bearer が来た場合は session cookie にフォールバックしない

## CSRF

Browser session 利用時のみ、unsafe method に CSRF 対策をかける。

- 対象外: `GET`, `HEAD`, `OPTIONS`
- 対象: `POST`, `PUT`, `PATCH`, `DELETE`

検証方法:
- frontend は `lss_csrf` Cookie の値を読む
- unsafe method で `X-CSRF-Token` header に同じ値を付ける
- backend は cookie と header の一致を検証する

JWT 認証時は CSRF 検証を行わない。

## Cookie 属性

- `lss_session`
  - `HttpOnly=true`
  - `SameSite=Lax`
  - `Path=/`
  - `Max-Age=28800`
  - `Secure=true` は HTTPS 環境のみ
- `lss_csrf`
  - `HttpOnly=false`
  - `SameSite=Lax`
  - `Path=/`
  - `Max-Age=28800`
  - `Secure=true` は HTTPS 環境のみ

`Domain` は host-only cookie とし、明示指定しない。

## JWT の中身

最小で次を含める。

- `sub`: user_id
- `iat`: 発行時刻
- `exp`: 有効期限

JWT は短命運用とし、logout による即時失効は今回導入しない。

## ユーザー名・パスワードの保存方法

- パスワードは平文保存しない
- 保存するのは `password_hash` のみ
- 現行実装では `argon2` を使う

## 認証系データの保存先

認証系データは `backend/data/app.db` に集約する。

- `users`: ユーザー情報
- `sessions`: Browser session

プロジェクトごとの `database.db` とは分離する。

## 今後追加しやすい要素

- refresh token
- sliding session expiration
- password change
- role / project membership
