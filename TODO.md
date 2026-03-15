# TODO

完了した項目はこのファイルから削除する。
旧モック前提で不要になった項目や、すでに合意・反映済みの項目は整理済みである。
このファイルでは「次にやるべきこと」を重要度順に並べる。

## High

- 認証方式を `localStorage + Bearer JWT` から見直す
  - Browser 向けは `HttpOnly Cookie` ベースのサーバセッション方式を第一候補として検討する
  - CLI や API クライアントからの利用を維持するため、Bearer JWT の併用可否も含めて設計する
  - `login / me / logout / CSRF / CORS / Cookie 属性` まで含めて backend / frontend / docs の仕様を先に固める
  - frontend の `localStorage` 依存を外す方針を決める
  - backend / frontend / docs をまたぐ改修になるため、着手時は別ブランチで進める
## Mid

- アイコン作りたい。faviconも必要だし。
- docs の整理 (ハイレベル)
- LLM つなぎこみのデモを作成する
- frontend の回帰テストで未カバー領域を埋める
  - `Vitest` + React Testing Library は導入済みなので、未保存変更ダイアログ、画面遷移ガード、backend エラー経路を優先して固定する
- 狭い画面幅での 3 ペインレイアウトをどう扱うか検討する
  - 横スクロール維持、簡易レスポンシブ、専用レイアウト切替のどれを正とするか決める
  - まずは最小対応として、どの画面幅まで desktop 前提で許容するかを決める
- frontend と API の接続抜けを点検する
  - 現在の画面仕様に対して未接続の API、逆に不足している API がないかを洗い出す
  - 未使用 API を整理し、逆に画面側がローカル処理で抱えている責務を API に寄せる必要がないか確認する
- Project に紐づく Guideline が本当に必要か見直す
  - 不要であれば、Project から削除する方向で整理する
  - 現状は Workspace の基準表示が実質 `label.description` 中心なので、役割の重複を整理する
- Annotation 編集カードの `comment` / `status` / `meta` の保存タイミングを整理する
  - `input` 即反映、`blur` 確定、Save 時反映のどれを正とするかを決める
  - 現在のローカル即反映 + Save/Submit 永続化を正式仕様にするか見直す

## Low

- backend のリファクタリング
- frontend のリファクタリング
- docs の整理 (実装レベル)
- Document 検索は現在シンプルな部分一致にしている
  - 将来的に必要であれば、別ブランチで全文検索や検索インデックスの導入を検討する
  - 抜粋・ハイライト・preview を含めた検索体験全体をまとめて再設計する
- Label 削除や Submit など、破壊的・確定的操作に確認 UI を入れるか議論する
  - 誤操作防止を優先するか、Undo 前提で速度を優先するかを整理する
- キーボード操作時のフォーカス状態の視覚フィードバックをどう見せるか議論する
  - 今どの Doc / Label / Annotation が操作対象かをより直感的に示す方法を検討する
- Project Settings 画面の情報整理と見た目を見直す
  - Workspace に比べたときの視線誘導やフォーム密度を点検する
- Projects 一覧画面の情報整理と見た目を見直す
  - 初回導入導線と既存 project 一覧の見やすさを両立できているか確認する
