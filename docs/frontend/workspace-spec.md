# Workspace UI/UX 仕様（初版）

最終更新: 2026-03-10

## 1. 目的

- Project 選択後の作業を 1 画面に集約する。
- Layered Span Studio の「Layered」を視覚的にも操作的にも体験できる UI にする。
- Document 切り替え、Label 切り替え、Annotation 編集を高速に行える構成にする。

## 2. レイアウト（3ペイン）

1. 左ペイン: Document 一覧
2. 中央ペイン: Document Annotation Canvas
3. 右ペイン: 作業支援エリア

- 画面上にはペイン名をそのまま示す見出しテキストを表示しない。
- Project スコープ画面は以下 2 画面で構成する。
  - Workspace
  - Project Settings

## 3. 左ペイン仕様（Document 一覧）

- Document 一覧は縦スクロール可能とする。
- Document 一覧は backend の一覧 API をページングしながら段階読み込みする。
- 左ペインは全件を同時保持しなくてよく、表示ウィンドウ外へ十分離れた行は frontend メモリから破棄してよい。ただし現在選択中 Document は保持対象から外さない。
- 選択中 Document は視覚的に強調表示する。
- 左ペイン上部に `pending / docs` 件数を表示する。
- 左ペイン上部に本文検索入力を置き、入力中は一覧へ即時反映する。
- 検索対象は Document 本文とする。`document_name` は識別用の表示名として扱い、検索対象に含めない。
- 検索は単純な部分一致とし、英字の大文字小文字差は無視する。
- 本文検索と並び順は frontend 内の手元キャッシュではなく、backend の Document 一覧 API に対して適用する。
- 検索結果一覧では `document_name` に加え、一致箇所を含む本文抜粋を表示し、抜粋内の一致箇所をハイライト表示する。
- 左ペインの各 Doc 行は hover 時にフローティングウィンドウを表示し、より長い本文プレビューを読めるようにする。検索中は一致箇所周辺を優先し、未検索時は本文冒頭を表示する。
- 入力検証エラーや Import 失敗などのフィードバックは、`alert` ではなく非ブロッキング通知で表示する。
- 検索中に現在選択中 Document が検索結果から外れた場合でも、中央ペインの表示は維持する。その代わり左ペインで「現在表示中の Doc は検索結果外」であることを案内し、検索クリア導線を出す。
- 現在選択中 Document が一覧ウィンドウ外へ退避した場合でも、必要に応じて左ペイン先頭へ固定表示してアクセス可能にする。
- 並び順は切り替え可能とする。候補は以下とする。
  - 作成順
  - 未完了優先（status）
  - 最終更新順
  - `document_name` 順
- 並び順の切り替えは検索結果集合に対して適用する。
- Create Document は常設フォームにしない。
- 左ペイン上部の `+` ボタンからモーダルを開いて作成する。

## 4. 中央ペイン仕様（Annotation Canvas）

- 上部に Label Selector を置く。
- Label Selector は横スクロール可能とする。
- Label は単一選択とする（注目ラベルは1つ）。
- 中央ペインは現在選択中 Document の本文と annotations を表示対象とし、左ペインの仮想化や古い行の破棄とは独立して保持する。
- 本文フォントサイズは `18px` とする。
- Label Selector の表示色は各 Label の色定義に合わせる（マーカー色と統一）。
- Layered 表示ルールは以下で確定する。
  - 注目 Label: 対応 span を塗りで表示する。
  - 非注目 Label: 対応 span を下線で表示する。
  - 非注目 Label が複数重なる区間は、ラベルごとの下線を多段で表示する（1本に統合しない）。
  - 下線レーン間隔は十分に離し、重複時でも線同士を視認できること（現実装は `4.4px` ピッチ）。
  - 下線のクリック判定は線幅より広いヒット帯を持たせること（現実装は `5px` 高のヒット帯）。
  - 重複数が多い場合でも下線は省略せず、対応する全ラベル分を表示する。
  - 下線は文字領域へ侵食させず、文字下の余白側に描画する。
  - 重複時は下線を下方向へ積層し、どの線も視認可能な間隔を維持する。
  - 下線は hover/選択状態を強調表示し、非対象線は相対的に弱めて可読性を維持する。
  - hover 中ラベル名は本文上部固定ではなく、マウスカーソル近傍のツールチップで表示する。
  - 注目 Label の塗り区間を hover した場合は、区間上部中央付近にラベル名ツールチップを表示する。
  - 同一 Annotation の下線は、重複区間の有無にかかわらず同一レーンで連続表示し、途中で段差を作らない。
  - 選択枠は下線領域を含めず本文範囲にのみ描画し、重複区間でも枠線が段差にならないようにする。
  - 折り返し（改行）を跨ぐ Annotation でも、下線のクリック判定と選択枠の描画は行フラグメント単位で正しく動作すること。
  - 重複区間でも注目 Label の塗りは連続して見えるようにし、途中で切れて再開始する見え方を避ける。
  - 選択中 Annotation の枠線は区間全体で連続して見えるようにし、重複境界で分断して見せない。
- テキスト選択はドラッグ起点で行う。
- ドラッグ完了時は選択プレビューを表示し、現在選択中 Label への Annotation 追加はプレビュー上のボタンまたは `Enter` で確定する。
- 同一 Label 内で既存 span と重複する範囲は作成不可とする。
- 同一 Label 重複の作成操作時は非ブロッキング通知を表示し、ポップアップで操作を止めない。
- 異なる Label 間の重複 span は許可する（例: 検査値 `CRP 8.4 mg/dL` と単位 `mg/dL`）。
- ラベル切り替えは下線クリックで行う。下線区間の文字本体をクリックしてもラベルは切り替えない。
- 注目 Label の塗り区間クリックは、ラベル切り替えは行わず、対象 Annotation を選択する。
- Annotation Canvas の非アノテーション領域（空白）クリックで、選択中 Annotation を解除する。
- Workspace 初期表示時は Annotation 未選択状態で開始する。
- Document 切り替え直後は Annotation 未選択状態で開始する。
- 既存 Annotation の編集可能範囲は以下に限定する。
  - `comment`
  - `status`
  - `meta`
- `start/end/span_text` の直接編集は行わない。

## 5. 右ペイン仕様（2タブ）

- 右ペイン上部に以下 2 タブを置く。
  - `関連例`
  - `注釈一覧`
- Workspace 初期表示時および Document 切り替え直後は、右ペインのアクティブタブを `関連例` とする。
- `関連例` タブは以下で構成する。
  - ラベル基準カード: 現在注目中 Label の判定基準を短く表示する。見出しは `"{label.name} アノテーション基準"` とする。
  - `同一ラベルの他アノテーション` セクション: 現在注目中 Label に付いた他アノテーションを、backend の project 横断検索 API で取得して表示する。
  - `同一表層の他アノテーション` セクション: 選択中 Annotation の `span_text`、または現在のテキスト選択プレビューに一致する他 Annotation を、backend の project 横断検索 API で取得して表示する。
- `同一ラベルの他アノテーション` と `同一表層の他アノテーション` は、それぞれ独立した内部スクロール領域を持つ。
- `同一ラベルの他アノテーション` と `同一表層の他アノテーション` は、初期表示を 8 件とし、スクロールで末尾に達したらさらに 8 件ずつ自動追加表示する。
- 右ペインの関連例は、左ペインや中央ペインで現在 frontend が保持している Document 集合には依存しない。
- 追加表示の処理中は、スクロール領域下部に小さく読み込み中表示を出す。
- 追加表示が最後まで完了したら、スクロール領域下部に小さく `以上で全て` と表示する。
- `同一表層の他アノテーション` 内では、他 Label の事例だけを行内バッジ等で強調表示する。
- `関連例` 内の各項目は短い抜粋を常時表示し、hover 時はより長い周辺文脈をマウス近傍のフローティングウィンドウで表示する。
- `同一ラベルの他アノテーション` で同じ表層を件数集約している場合、hover 時のフローティングウィンドウでは該当する複数 Document の事例を並べて表示する。
- `注釈一覧` タブは以下で構成する。
  - Comment / Meta カード: 「選択中 Annotation」に紐づく `status` / `comment` / `meta` を表示・編集する。必要に応じて折りたたみ可能とし、開閉 UI は Doc アノテーション一覧と同系統の三角アコーディオン表現で統一する。
  - Doc アノテーション一覧カード: 現在選択中 Doc の Annotation を Label ごとに表示する。
- Doc アノテーション一覧は Label ごとのアコーディオン形式とする。
- 各 Label グループ内の Annotation は `start`（span の開始 index）昇順で表示し、同一 `start` の場合は `end` 昇順で扱う。
- 各 Annotation 行には `status` バッジを表示する。
- 文脈表示は前後 10 文字固定で生成し、`span_text` 以外（前後文脈）は灰色で表示する。
- 一覧カード内の Label 色は、Label Selector と本文マーカー色に合わせて統一する。

## 6. 保存と確定

- 保存は明示操作で行う。
- Save / Submit 操作列は中央ペインの右下に置く。
- Submit ボタンは操作列の右端に置く。
- Submit の意味は「Document 確定」であり、以下を実行する。
  - Document の `status` を `verified` に更新
  - 配下 Annotation の `status` を全件 `verified` に更新
- Submit 完了後は次の `pending` Document へ自動で移動する。
- 次の `pending` が存在しない場合は現在 Document に留まる。

## 6.1 Project 一覧へ戻る時のガード

- Workspace / Settings から Project 一覧へ戻る操作には未保存確認を表示する。
- 確認ダイアログの選択肢は以下とする。
  - 保存して移動
  - 破棄して移動
  - キャンセル
- URL 直打ち・ブラウザ履歴遷移時のガードは実装対象外とする。

## 6.2 Import / Export（Project List / Project Settings）

- Project List では `.json` ファイルから新規 project import を行う。
- Project List の Import は backend の `POST /projects/import` の request body と同一形式（`project` / `labels` / `documents` / `meta`）を使う。
- Project List の Import 完了後は、作成された project の Workspace へ遷移する。
- Project List の Import で `project.name` が既存と重複した場合は、backend と同じく `"(imported)"`, `"(imported 2)"` ... を付けて自動改名する。
- Project Settings では、現在 project への追記 Import を `.json` ファイル選択で行う。
- Project Settings の Import は backend の `POST /projects/{project_id}/import` の payload 形式（`project` / `labels` / `documents` / `meta`）と同一にする。
- Project Settings の Import は append 専用であり、`payload.project.*` によって既存 project 本体は更新しない。
- Export は Project Settings から `.json` ファイルとしてダウンロードする。
- Export JSON は backend の `POST /projects/{project_id}/export` の response 形式（`project` / `labels` / `documents` / `meta`）と同一にする。
- Export には annotation status フィルタを持たせる（`include_pending` / `include_verified`）。
- Import / Export の単位は project 単位とする。
- Project Settings の Import は backend 検証ルールに合わせ、既存と同名の label / document が含まれる場合は失敗扱いとする。
- Import は部分成功しない（不整合が1件でもあれば全体失敗）。

## 6.3 Project Settings 画面

- Project 名と説明文を編集可能にする。
- Label定義管理を行う（追加 / 編集 / 削除）。
- Label削除時は対応するAnnotationも同時に除去する。
- プロジェクトガイドライン文言を編集可能にする。
- Import / Export カードを同画面内に配置する。
- Import カード内では「現在 project への追記 import」であることを明示する。
- `label.shortcut` は backend / API のデータ項目としては保持するが、現行 frontend では編集 UI と直接割り当て操作を提供しない。将来の操作設計と合わせて検討する。

## 7. キーボードショートカット

- Save / Submit
  - `Cmd+S`: Save
  - `Cmd+Enter`: Submit（Document + 配下Annotationを`verified`化し、次の`pending` Docへ移動）
  - `Cmd+Z`: Undo（直前操作を取り消す）
  - `Cmd+Y` / `Cmd+Shift+Z`: Redo（取り消しをやり直す）
- Doc移動
  - `J`: 次のDoc
  - `K`: 前のDoc
  - `Shift+J`: 次の`pending` Doc
  - `Shift+K`: 前の`pending` Doc
- Label移動
  - `H`: 前Label
  - `L`: 次Label
  - `←`: 前Label
  - `→`: 次Label
- 右ペイン切り替え
  - `[`: 前タブ（`関連例`）
  - `]`: 次タブ（`注釈一覧`）
- Annotation操作
  - `Enter`: 範囲選択プレビューが出ているとき、Annotation を確定する
  - `N`: 現在選択中Label内で次のAnnotationを選択
  - `P`: 現在選択中Label内で前のAnnotationを選択
  - `↓`: Doc アノテーション一覧順で次のAnnotationを選択する。現在グループ末尾なら次のLabelグループ先頭へ進む
  - `↑`: Doc アノテーション一覧順で前のAnnotationを選択する。現在グループ先頭なら前のLabelグループ末尾へ進む
  - `Esc`: 選択中Annotationを解除
  - `Delete` / `Backspace`: 選択中Annotationを削除
- 補助
  - `?`: ショートカット一覧パネルを開閉
- 適用ルール
  - `input` / `textarea` / `select` フォーカス中はショートカットを無効化する。
  - Doc 検索中の `J/K/Shift+J/Shift+K` は、検索結果一覧の中だけを移動対象にする。
  - `H/L/←/→` によるLabel切り替え時は、Annotation選択をリセットする。
  - `[ / ]` は右ペインのタブ切り替えに使い、選択中 Annotation は維持する。
  - `N/P` は現在選択中Label内のみを対象とし、未選択状態では先頭（`N`）/末尾（`P`）から開始する。
  - `↑/↓` は Doc アノテーション一覧の表示順に従って移動し、group 端では隣接 group へ継続する。
  - Undo/Redo 実行時は、現在選択中のDocを維持し、別Docへ自動切り替えしない。
