# TODO メモ

本文章では完了したタスクの記述は削除する。本文章が不必要に膨らむのを防ぐためだ。

最終更新: 2026-03-09
## Frontend モック TODO

### High


### Mid

- [ ] 範囲選択時に「同一表層の他アノテーション」へ他ラベル候補も出す
  span を確定する前の段階でも、その表層に既に付いている他ラベルを右ペインで参照できるようにし、ラベル選択の判断材料を増やす
- [ ] Import / Export まわりの失敗時 UX を改善する
  JSON 不正、重複名、backend 由来の検証エラーなどを、操作を止めずに理解できる導線へ寄せる
- [ ] 狭い画面幅での横スクロールレイアウトを検討する
  画面幅が不足したときに 3 ペインが縦積みへ崩れて操作性が落ちるため、横スクロールで各ペイン幅を保つ案をモックで検証する
- [ ] Project Settings のデザインを見直す
  Workspace に比べて情報整理や視線誘導が弱くなりやすいため、フォーム密度・カード構成・操作導線を点検する
- [ ] Projects 一覧画面のデザインを見直す
  初回導入導線と既存 project の一覧性を両立できているかを確認し、視覚的な優先順位を整える
- [ ] `docs/frontend/mock/index.html` に、Import / Export の通知 UX 改善を検討する TODO コメントを追加する
  実装ファイル側にも意図を残し、あとで alert 置換や通知設計を進めやすくする
- [ ] 関連アノテーション表示に使う backend API の接続方針を整理する
  `GET /projects/{project_id}/labels/{label_id}/examples` は既にあるので、まずはこの API を前提に UI を考える。必要件数・並び順・文脈長が足りるかを確認する
- [ ] frontend と API の接続抜けを点検する
  現在の画面仕様に対して未接続の API、逆に不足している API、追加したほうがよい API がないかを洗い出す

### Low

- [ ] Label 削除や Submit など、破壊的・確定的操作に確認 UI を入れるか議論する
  誤操作防止を優先するか、Undo 前提で速度を優先するかを整理し、確認ダイアログの要否を決める
- [ ] Annotation 編集カードの `comment` / `status` / `meta` の保存タイミングを整理する
  `input` 即反映、`blur` 確定、Save 時反映のどれを正とするかを決め、React 化しやすい仕様に寄せる
- [ ] キーボード操作時のフォーカス状態の視覚フィードバックをどう見せるか議論する
  未選択状態からの復帰やショートカット移動直後に、今どの Doc / Label / Annotation が対象か分かる見せ方を決める

## Backend TODO

### High

- [ ] `Document status` を backend に持たせるか検討する
  frontend は Submit で Document を `verified` にする前提だが、現状の API / DB には `status` が存在しない。frontend 仕様確定後に、`documents` テーブル・API モデル・更新フローへ追加するか判断する
- [ ] `createdAt` / `updatedAt` 相当のフィールドを backend に持たせるか検討する
  frontend モックの Doc 並び替えは `作成順` / `最終更新順` を前提にしているが、現状 backend では保持していない。仕様確定後に DB と API を拡張するか、frontend 側の sort 仕様を縮めるか決める

### Mid

- [ ] Project Settings の `guideline` / `shortcutHelpEnabled` を backend の first-class field にするか検討する
  現在モックでは `project.meta` に退避している。`project` の専用フィールドにするか、`meta` のまま運用するかを決める
- [ ] Import バリデーションを frontend と揃える前提整理をする
  backend は label の `color` / `description` を必須で検証している。frontend モックと同じ制約にするのではなく、最終的にどちらを正とするかを決める
- [ ] 表層文字列で関連例を横断検索する API が必要か検討する
  現状は `GET /projects/{project_id}/labels/{label_id}/examples` があるが、任意の表層文字列をキーに関連アノテーションを引く API は見当たらない。モックで必要性が固まったら API 設計に進む
