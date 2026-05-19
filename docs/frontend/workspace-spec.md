# Workspace UI/UX 仕様（初版）

最終更新: 2026-05-19

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
- 狭い画面幅でも Workspace の 3 ペイン構成は維持する。header は固定し、header 配下の本文 3 ペイン領域のみを横スクロール可能とする。
- 狭い画面幅で本文領域が横スクロール状態でも、各ペイン内の縦スクロールは独立して維持する。

## 3. 左ペイン仕様（Document 一覧）

- Document 一覧は縦スクロール可能とする。
- Document 一覧は backend の一覧 API をページングしながら段階読み込みする。
- Workspace 表示中は、一定間隔とタブ復帰時に Document 一覧 API の先頭ページを再取得し、backend / CLI / API client 経由で追加された Document を左ペインへ反映する。再取得時も一覧ウィンドウ外へ十分離れた行は可能な限り保持する。
- 左ペインの一覧ウィンドウは、現在の検索条件・並び順に沿った連続区間として扱う。選択中 Document だけを物理的な並び順から外して先頭固定表示しない。
- 左ペインは全件を同時保持しなくてよく、表示ウィンドウ外へ十分離れた行は frontend メモリから破棄してよい。ただし中央ペインの現在選択中 Document 本体は、左ペインの表示ウィンドウとは独立して保持する。
- 一覧下端付近までスクロールした場合は後続ページを読み込み、一覧上端付近まで戻った場合は前ページが存在すれば前方ページを読み込む。
- 前方ページを prepend した場合は、prepend 前に可視領域先頭付近にあった Document 行をアンカーとして `scrollTop` を補正し、ユーザーから見たスクロール位置が読み込み行数分だけジャンプしないようにする。
- ページ追加で保持件数が上限を超えた場合は、スクロール方向と反対側の十分離れた行を破棄してよい。
- 選択中 Document が現在の一覧ウィンドウ内に存在する場合は、該当行を視覚的に強調表示する。
- 左ペイン上部に `pending / docs` 件数を表示する。
- 左ペイン上部に本文検索入力を置き、入力中は一覧へ即時反映する。
- 検索対象は Document 本文と `id` とする。`document_name` は識別用の表示名として扱い、検索対象に含めない。
- 検索は単純な部分一致とし、英字の大文字小文字差は無視する。`%` / `_` に特別な意味は持たせない。
- 本文検索と並び順は frontend 内の手元キャッシュではなく、backend の Document 一覧 API に対して適用する。
- 検索結果一覧では `document_name` に加え、一致箇所を含む本文抜粋を表示し、抜粋内の一致箇所をハイライト表示する。
- 左ペインの各 Doc 行は hover 時にフローティングウィンドウを表示し、より長い本文プレビューを読めるようにする。検索中は一致箇所周辺を優先し、未検索時は本文冒頭を表示する。
- 入力検証エラーや Import 失敗などのフィードバックは、`alert` ではなく非ブロッキング通知で表示する。
- 検索中に現在選択中 Document が検索結果から外れた場合でも、中央ペインの表示は維持する。その代わり左ペインで「現在表示中の Doc は検索結果外」であることを案内し、検索クリア導線を出す。
- 現在選択中 Document が一覧ウィンドウ外へ退避した場合、左ペイン上部にスクロール枠と接続した小さな「選択中Documentへ戻る」導線を表示する。操作時は、選択中 Document を含む一覧ウィンドウを再取得する。
- 現在選択中 Document が一覧ウィンドウ内にあるがスクロール可視領域外にある場合も、同じ「選択中Documentへ戻る」導線を表示する。操作時は既存行を最小移動で可視領域内へ戻し、一覧ウィンドウは再取得しない。
- 並び順は切り替え可能とする。候補は以下とする。
  - 作成順
  - 未完了優先（status）
  - 最終更新順
  - `document_name` 順
- 並び順の切り替えは検索結果集合に対して適用する。
- Create Document は常設フォームにしない。
- 左ペイン上部の `+` ボタンからモーダルを開いて作成する。
- 左ペイン各 Doc 行の右端に削除ボタンを置く。
- 削除ボタンは、現在選択中 Doc では常時表示、非選択 Doc では hover または keyboard focus 時に表示する。
- Doc 削除は確認ダイアログ必須とし、対象 `document_name` を明示する。
- 削除時は配下 annotation も同時に削除する。
- 現在選択中 Doc に未保存変更がある場合でも削除は可能とし、確認ダイアログ内で「未保存の変更も破棄される」ことを明示する。
- 現在選択中 Doc を削除した後は、削除直前の左ペイン表示順に基づいて次の Doc、なければ前の Doc、どちらもなければ empty state へ遷移する。
- 削除後の遷移判定では `pending` / `verified` を考慮しない。
- 現在選択中 Document の `status` が `verified` であっても、`status` / `comment` / `meta` の編集で未保存状態になった場合は、表示上 `pending` として扱う。
- 左ペイン上部の `pending / docs` には、未保存変更中の `verified` Document を加算して表示する。
- `Shift+J` / `Shift+K` での pendingOnly 遷移は、表示上の `pending` 判定に基づいて行う。

## 4. 中央ペイン仕様（Annotation Canvas）

- 上部に Label Selector を置く。
- Label Selector は幅に応じて最大 3 行まで折り返し、3 行を超える場合は領域内で縦スクロール可能とする。
- Label は単一選択とする（注目ラベルは1つ）。
- 中央ペインは現在選択中 Document の本文と annotations を表示対象とし、左ペインの仮想化や古い行の破棄とは独立して保持する。
- frontend が保持する Document 詳細（本文と annotations）は、現在選択中 Document、未保存変更中 Document、直近利用 Document の短期 cache に限定する。cache から破棄する場合は、対応する snapshot も同じ方針で破棄する。
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
- ラベル切り替えは下線クリックで行う。下線クリック時は、対応する Annotation も同時に選択する。下線区間の文字本体をクリックしてもラベルは切り替えない。
- 注目 Label の塗り区間クリックは、ラベル切り替えは行わず、対象 Annotation を選択する。
- Annotation Canvas の非アノテーション領域（空白）クリックで、選択中 Annotation を解除する。
- Workspace 初期表示時は Annotation 未選択状態で開始する。
- Document 切り替え直後は Annotation 未選択状態で開始する。
- 既存 Annotation の直接更新可能範囲は以下に限定する。
  - `comment`
  - `status`
  - `meta`
- Label 切り替えは既存 Annotation の直接更新ではなく、旧 Annotation の削除と新 Label の Annotation 作成として扱う。
- `start/end/span_text` の直接編集は行わない。

## 5. 右ペイン仕様（2タブ）

- 右ペイン上部に以下 2 タブを置く。
  - `関連例`
  - `注釈一覧`
- Workspace 初期表示時および Document 切り替え直後は、右ペインのアクティブタブを `関連例` とする。
- `関連例` タブは以下で構成する。
  - ラベル基準カード: 現在注目中 Label の判定基準を短く表示する。見出しは `"{label.name} アノテーション基準"` とする。
  - `同一ラベルの他アノテーション` セクション: 現在注目中 Label に付いた他アノテーションを、backend の `surface-groups` API を主に使って取得・表示する。
  - `同一表層の他アノテーション` セクション: 選択中 Annotation の `span_text`、または現在のテキスト選択プレビューと完全一致する他 Annotation を、backend の project 横断検索 API で取得して表示する。
- ラベル基準カードは、`関連例` タブ内のラベル基準カード、同一ラベル、同一表層の 3 領域を等分した高さを最大 height とする。基準文が短い場合は自然な高さで表示し、長い場合はカード本文だけを内部スクロール可能にする。
- `同一ラベルの他アノテーション` と `同一表層の他アノテーション` は、それぞれ独立した内部スクロール領域を持つ。
- `同一ラベルの他アノテーション` と `同一表層の他アノテーション` は、初期表示を 8 件とし、スクロールで末尾に達したらさらに 8 件ずつ自動追加表示する。
- 右ペインの関連例は、左ペインや中央ペインで現在 frontend が保持している Document 集合には依存しない。
- 追加表示の処理中は、スクロール領域下部に小さく読み込み中表示を出す。
- 追加表示が最後まで完了したら、スクロール領域下部に小さく `以上で全て` と表示する。
- `同一表層の他アノテーション` 内では、他 Label の事例だけを行内バッジ等で強調表示する。
- `関連例` 内の各項目は短い抜粋を常時表示し、hover 時はより長い周辺文脈を Tooltip 形式の詳細表示で確認できるようにする。
- `同一ラベルの他アノテーション` は同一表層を件数集約して表示し、hover 時のフローティングウィンドウでは backend の project 横断検索 API を補助的に使って、該当する複数 Document の事例を並べて表示する。
- 中央ペイン下部には、Annotation 選択中のみ選択中 Annotation dock を表示する。
- 選択中 Annotation dock の上段には、選択中 Annotation の見出し、`status`、`span_text` を 1 行で表示する。
- 選択中 Annotation dock の主操作列には、Label 切り替え、次の `pending` Annotation への移動、`verified` 化、詳細開閉ボタンを配置する。
- 選択中 Annotation dock の詳細領域には、`status` / `comment` / `meta` 編集と削除を配置し、開閉状態は Annotation 選択が変わっても維持する。
- Label 切り替えは backend の既存 Annotation immutable 契約に合わせ、保存時には旧 Annotation の削除と新 Label の Annotation 作成として扱う。
- `注釈一覧` タブは、現在選択中 Doc の Annotation を Label ごとに表示する一覧のみで構成する。
- Doc アノテーション一覧は Label ごとのアコーディオン形式とする。
- Doc アノテーション一覧には、現在選択中 Doc に Annotation が存在する Label のみ表示する。
- 現在選択中 Doc に Annotation が存在しない場合は、一覧カード内に空状態を表示する。
- 各 Label グループ内の Annotation は `start`（span の開始 index）昇順で表示し、同一 `start` の場合は `end` 昇順で扱う。
- 各 Annotation 行には `status` バッジを表示する。
- 文脈表示は前後 10 文字固定で生成し、`span_text` 以外（前後文脈）は灰色で表示する。
- 一覧カード内の Label 色は、Label Selector と本文マーカー色に合わせて統一する。
- Doc 切り替えや Annotation 移動時は、Doc アノテーション一覧で選択行が可視領域内になるよう自動スクロールする。
- 注釈一覧タブは Doc 内 Annotation の一覧・選択に集中し、選択中 Annotation の編集フォームは持たない。

## 6. 保存と確定

- 保存は明示操作で行う。
- browser Workspace の保存単位は Document とする。
- Save / Submit 操作列は中央ペインの右下に置く。
- Submit ボタンは操作列の右端に置く。
- annotation の追加・削除・`comment` / `status` / `meta` 編集は、Save/Submit 前は browser のローカル state に保持する。
- `Save` では未保存編集を backend へ同期し、保存確定後は表示上の status を API 応答に合わせて更新する。  
- `Save` / `Submit` の同期先は `document bundle save` を正とし、browser は annotation 個別 CRUD を通常の保存導線では使わない。
- 同一 Document が保存前に `verified` だった場合でも、未保存編集分は表示上 `pending` として扱い続ける。
- Submit の意味は「Document 確定」であり、以下を実行する。
  - Document の `status` を `verified` に更新
  - 配下 Annotation の `status` を全件 `verified` に更新
- Submit 完了後は次の `pending` Document へ自動で移動する。
- 次の `pending` が存在しない場合は現在 Document に留まる。

## 6.1 i18n 方針

- 説明文、通知、dialog 文言、長い補助テキストは i18n 対象とする。
- `Save` / `Submit` / `Label` / `Next pending` / `Mark verified` のように、十分短く UI 操作語として定着した英語フレーズは無理に翻訳しない。
- 短い英語フレーズを固定表示にする場合でも、aria-label や Tooltip が補足説明として長くなるなら i18n 対象とする。

## 6.2 Project 一覧へ戻る時のガード

- Workspace / Settings から Project 一覧へ戻る操作には未保存確認を表示する。
- 確認ダイアログの選択肢は以下とする。
  - 保存して移動
  - 破棄して移動
  - キャンセル
- URL 直打ち・ブラウザ履歴遷移時のガードは実装対象外とする。

## 6.3 Import / Export（Project List / Project Settings）

- Project List では `New Project` と `Import Project` を並列導線として提供する。
- Project List では検索欄の近くに `並び順` と `昇順 / 降順` の UI を置く。
- Project List の並び順候補は `作成順` `名前順` `ドキュメント数順` `未確定ドキュメント数順` とし、初期値は `作成順 / 降順` とする。
- この並び順は Project List 専用であり、Workspace 左ペインの Document sort 仕様とは独立して扱う。
- `New Project` は Project List 上部から dialog で起動し、`Project name` と `Description` を入力して空の project を作成する。
- `New Project` 完了後は、作成された project の Project Settings へ遷移する。
- Project List では `.json` ファイルから新規 project import を行う。
- Project List の `Import Project` は dialog で起動する。
- Import dialog は modal dialog とし、drag and drop での `.json` 投下と file 選択ボタンの両方を提供する。`.json` 以外は受け付けない。
- Import dialog 内に、`自前データを import 用 JSON にする手順` への外部リンクを置く。
- Project List の Import は backend の `POST /projects/import` の request body と同一形式（`project` / `labels` / `documents` / `meta`）を使う。
- Project List の Import 完了後は、作成された project の Workspace へ遷移する。
- Project List の Import で `project.name` が既存と重複した場合は、backend と同じく `"(imported)"`, `"(imported 2)"` ... を付けて自動改名する。
- Project Settings では、現在 project への追記 Import を `.json` ファイル選択で行う。
- Project Settings の Import は backend の `POST /projects/{project_id}/import` の payload 形式（`project` / `labels` / `documents` / `meta`）と同一にする。
- Project Settings の Import は append 専用であり、`payload.project.*` によって既存 project 本体は更新しない。
- Project Settings の Import 前チェックは、画面上の未保存編集ではなく、backend 上に保存済みの label / document 一覧を基準に重複判定する。
- Project Settings の Import 成功後は、選択済みファイルをクリアし、Workspace / Settings が参照する project bundle を再読込して保存済み状態に揃える。
- Export は Project Settings から `.json` ファイルとしてダウンロードする。
- Export JSON は backend の `POST /projects/{project_id}/export` の response 形式（`project` / `labels` / `documents` / `meta`）と同一にする。
- Export には annotation status フィルタを持たせる（`include_pending` / `include_verified`）。
- Import / Export の単位は project 単位とする。
- Project Settings の Import は backend 検証ルールに合わせ、既存と同名の label / document が含まれる場合は失敗扱いとする。
- Import は部分成功しない（不整合が1件でもあれば全体失敗）。

## 6.4 Project Settings 画面

- Project scope 共通 header では、左側に project 名と説明文、中央に `Workspace / Project Settings` 切り替え、右側に言語切替、現在の username、logout 導線をまとめて表示する。
- Project 名と説明文を編集可能にする。
- Label定義管理を行う（追加 / 編集 / 削除 / 表示順変更）。
- Label 表示順変更は、一覧左端のグラブハンドルを縦方向にドラッグして行う。ドラッグ中は周囲の Label 行が並び替え位置へ滑って移動するアニメーションを付ける。
- 表示順保存後は Workspace の Label Selector、右ペインの Annotation グループ順、label 切り替えショートカット順に反映する。
- Label削除時は対応するAnnotationも同時に除去する。
- プロジェクトガイドライン文言を編集可能にする。
- Import / Export カードを同画面内に配置する。
- Import カード内では「現在 project への追記 import」であることを明示する。
- 画面最下部に赤系の `Danger Zone` を置き、Project 全体の削除導線を配置する。
- Project 削除は確認ダイアログ必須とし、対象 `project.name`、配下 document / annotation / label も削除されること、元に戻せないことを明示する。
- Project 削除成功後は Project List へ遷移する。
- `label.shortcut` は backend / API のデータ項目としては保持するが、現行 frontend では編集 UI と直接割り当て操作を提供しない。将来の操作設計と合わせて検討する。
- locale は `ja` / `en` / `zh-CN` の 3 種類を提供し、初回表示時は browser language が `ja*` なら `ja`、`zh-cn*` / `zh-sg*` / `zh-hans*` なら `zh-CN`、それ以外は `en` を既定とする。ユーザーが明示切替した場合は、その選択を localStorage に保存して以後の表示に優先適用する。

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
  - 現在選択中 Document が左ペインの一覧ウィンドウ外にある状態で `J/K/Shift+J/Shift+K` を実行した場合は、現在のスクロール位置ではなく選択中 Document の前後関係を基準に移動し、移動先 Document を含む一覧ウィンドウへ戻す。
  - `J/K`、`Shift+J/Shift+K`、`N/P`、`↑/↓` の移動後は、対象リスト上で選択アイテム（Doc/Annotation）が最小移動で可視域内に入ることを保証する。Doc 移動時は、選択行を可視域へ戻す自動スクロール中に「選択中Documentへ戻る」導線を一時表示しない。
  - Annotation 選択時は、選択経路（`N/P`、`↑/↓`、`Next pending`、右ペイン一覧、本文中の span / 下線クリック）に関わらず、本文側でも選択 Annotation とその一行下が可視域に入ることを保証する。すでに可視域内に収まっている場合はスクロール位置を維持し、収まっていない場合だけ周辺文脈が見える位置へ滑らかにスクロールする。
  - `H/L/←/→` の移動後は、Label Selector 上で注目 Label が最小移動で可視域内に入ることを保証する。
  - `H/L/←/→` によるLabel切り替え時は、Annotation選択をリセットする。
  - `[ / ]` は右ペインのタブ切り替えに使い、選択中 Annotation は維持する。
  - `N/P` は現在選択中Label内のみを対象とし、未選択状態では先頭（`N`）/末尾（`P`）から開始する。
  - `↑/↓` は Doc アノテーション一覧の表示順に従って移動し、group 端では隣接 group へ継続する。
  - Undo/Redo 実行時は、現在選択中のDocを維持し、別Docへ自動切り替えしない。
