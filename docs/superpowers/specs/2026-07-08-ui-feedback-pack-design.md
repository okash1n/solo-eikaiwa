# アプリUI改善パック 設計ドキュメント（フィードバック一括対応 A）

- Status: 承認済み（2026-07-08 ユーザー承認。spec レビューは省略指示・実装まで自走）
- 起点: ユーザーフィードバック — 草がアクセスだけで生える / 設定が1ページ縦積み / 言語・文字サイズ切替が遠い / プリセットの選択状態が不明 / 用途別モデルの推奨理由がない / メニュー日本語がわかりにくい
- リリース: v0.22.0（パックB「LP+ファビコン」と同一リリース）
- 決定事項: バランスプリセットは「会話=ローカル / コーチング・生成・測定=Claude」へ変更。i18n 文言凍結規約は廃止（A-7）

## A-1. 練習カレンダーのXP濃淡（GitHub風5段階）

現状の問題（調査確定）: 草は「その日のセッションログファイル存在」の二値（`session-log.ts:50`）。セッションを開いただけ（XP 0）で草が生え、SRS採点だけの日（XPあり・ログなし）は草が生えない。

### サーバ（TDD 必須）

- `ProgressStore` に `xpByDay(): Record<string, number>` を追加。`SELECT ymd, SUM(amount) FROM xp_events GROUP BY ymd`（全 kind 合計。ymd はローカル日付列をそのまま使い ts から導出しない）
- `ensureProgressSchema` に `CREATE INDEX IF NOT EXISTS idx_xp_events_ymd ON xp_events(ymd)` を追加（IF NOT EXISTS のみ・マイグレーション機構は作らない規約に適合）
- `GET /api/progress/days` のレスポンスを `{ days: string[], xpByDay: Record<string, number> }` に拡張。`days` = ログ日 ∪ XPあり日（昇順・重複なし）。**フィールド追加**であり `days` の型は変えない
- 配線: `ProgressRoutesDeps` に `xpByDay` を1項追加 → `RouteDeps` 交差型 → `index.ts` → `__tests__/helpers/route-deps.ts` の `makeFakeProgressStore`（satisfies でコンパイル強制される）
- テスト: `progress-store.test.ts` に xpByDay の日別合計（複数 kind・複数日、`seedBlockXpDay` の先例を流用）、`routes-progress.test.ts` の完全一致 expect を新形へ更新 + 和集合（ログのみ日・XPのみ日・両方日）のケース

### クライアント

- `api/progress.ts` の `fetchPracticeDays` を `Promise<{ days: string[]; xpByDay: Record<string, number> }>` に変更。消費3箇所（`App.tsx` の PracticeStat 2参照・`StartScreen.tsx`）を追随。PracticeStat の日数は新 `days`（SRSのみの日も含む）で数える — 情報的表示として妥当
- レベル判定（`StartScreen.tsx` 純関数）: その日が `days` に含まれ、XP が `0/undefined` → L1、`1–19` → L2、`20–49` → L3、`50+` → L4。根拠: クイック5–10XP / 30分メニュー30XP / フル完走57XP / SRS込み最大100前後
- セルは `data-level="1..4"` 属性で塗る。`is-today`（outline）と `is-future`（非表示）は直交のまま維持。tooltip は `ymd`、XP>0 の日は `${ymd} · ${xp} XP`
- CSS: `tokens.css` に `--cal-l1: color-mix(in srgb, var(--accent) 25%, var(--surface))` / l2=50% / l3=75% / `--cal-l4: var(--accent)` を定義（`--accent`/`--surface` が両テーマで切り替わるため自動でダーク対応。tokens.css の規約コメントに従いライト/ダーク両ブロックに明記してもよい）。`app.css` は `.day[data-level="1"] { background: var(--cal-l1) }` 等、変数参照のみ
- 凡例: 「少 □▪▪▪■ 多」の GitHub 風に変更。新キー `calendar.legendLess`（JA「少」/EN "Less"）・`calendar.legendMore`（JA「多」/EN "More"）。旧キー `calendar.practiced` / `calendar.notYet` は型・EN・JA とも削除

### 制約

- 情報的フィードバックのみ: ノルマ・警告・喪失の演出や文言は導入しない。XP は減らないため過去日の濃さが下がることはない

## A-2. 設定画面のタブ分割（2026-07-08 ユーザー指示で4タブに改訂）

- タブ4枚: **接続**（ローカルLLMのURL/モデル・Codex）/ **用途ごとのモデル**（プリセット+4ロール割当）/ **音声** / **表示**。当初案は接続と割当を1タブにまとめていたが、ユーザー指示「URL指定の画面と用途ごとのモデルの画面はタブで分ける」で分割。接続値と割当の結合は保存ロジック（親コンポーネントの state と buildRolesPayload）側で完結しているため、タブは表示の分割のみ。タブをまたぐ案内文（presetLocalRequired / targetLocalDisabled）は「接続」タブ参照へ文言更新（EN/JA同時）
- タブ state は `useState<"llm" | "voice" | "display">("llm")`。**全入力 state は SettingsScreen 親に保持したまま**タブは条件レンダリングのみ → タブ切替で編集中入力は消えない。初回フェッチの `fetchedRef` ガードはそのまま
- 既存バグ修正を含む: `result` メッセージが言語モデルカード内にしか描画されない → `llmResult` / `ttsResult` に分離し各タブ内に表示。`saving` は共有のまま（同時保存は UI 上発生しない）
- タブ UI は既存 `.lang-toggle` 系のセグメントコントロールを画面上部に配置（`app.css` に `.settings-tabs` を追加してよいが色・寸法は tokens 変数のみ参照）。タブラベルは既存セクション見出しキーを流用できなければ新キー `settings.tabLlm/tabVoice/tabDisplay`（JA: 言語モデル/音声/表示）

## A-3. サイドバーに言語・文字サイズ切替を常設

- 位置: `.sidebar-spacer` の直後（SupportPanel の上）。EN/JA 2択と文字サイズ4段（小/中/大/特大）を `.lang-toggle` 部品で縦積み
- 配線: App.tsx が既に持つ `lang/switchLang/uiScale/setUiScale` を渡すだけ。ラベルは既存キー `appShell.textSize` / `appShell.language` / `uiScale.*` を流用
- 幅 860px 以下（サイドバー横並び化）では非表示（設定 > 表示タブで代替できるため）。設定画面の表示タブは従来どおり残す

## A-4. プリセットのドロップダウン化 + 現在値の自動判定

- `llm-assignments.ts` に純関数 `matchPreset(targets: RoleTargets): PresetId | "custom"` を追加: `(Object.keys(PRESETS) as PresetId[]).find(id => LLM_ROLES.every(r => PRESETS[id][r] === targets[r])) ?? "custom"`。「値一致」であり「適用履歴」ではない（手動で全ロール Claude にすると最高品質と表示される — TTS ボイスの female/male/custom 導出と同型の仕様）
- テスト追加: (a) 3プリセット完全一致 (b) 1ロール差分で custom (c) 往復整合 `buildRolesPayload → サーバ想定応答 → hydrateTargets → matchPreset` が元の PresetId に戻る
- UI: 3ボタンを廃止しネイティブ `<select>` に変更。表示値は state に持たず `matchPreset(targets)` を毎レンダー導出。option は3プリセット + 一致しない時のみ現れる選択不可の「カスタム」（新キー `settings.presetCustom` JA「カスタム」/EN "Custom"）。onChange は PresetId のみ受理して `applyPreset`（即時保存の現挙動は維持）
- バランスの option ラベルは既存キー結合「`presetBalanced`（`presetBalancedBadge`）」= 「バランス（推奨）」/ "Balanced (Recommended)"。select 下に選択中プリセットの説明（既存 Desc キー）と、ローカル未定義時は `presetLocalRequired` を表示。ローカル系 option は `presetEnabled` で disabled
- 既存問題の修正: `applyPreset` の保存失敗時に楽観更新が残る → catch で `fetchLlmSettings` を再取得して実状態へ再 hydrate（`saveFailed` 表示は維持）

## A-5. バランスプリセットの割当変更

- `PRESETS.balanced.generation: "local" → "claude"`（`llm-assignments.ts:19` + 14–15行の根拠コメント更新）。**テスト先行**: `llm-assignments.test.ts` の balanced 期待値を先に更新して赤→緑
- i18n `presetBalancedDesc` を書き換え（EN/JA 同時）: JA「会話はローカルで速さを、コーチング・教材生成・測定は品質を優先して Claude を使います。」/ EN "Conversation runs locally for speed; coaching, content generation, and assessment use Claude for quality."
- README のバランス説明（162行付近・189・192行付近の使い分け）と CHANGELOG を追随
- 明記する仕様: 定義変更後、旧バランス相当の割当（生成=ローカル）は「カスタム」表示になる（正しい挙動）

## A-6. 用途ごとの推奨と理由の表示 + README

- i18n `settings.roleReason: Record<LlmRole, string>` を新設し、`SettingsScreen` の各ロールの `roleDesc` 直下に `text-sm text-muted` で表示

| ロール | JA | EN |
| --- | --- | --- |
| conversation | 推奨: ローカル — 応答が最も速いため。品質が物足りなければ Claude や Codex へ。 | Recommended: local — fastest responses. Switch to Claude or Codex if quality falls short. |
| coaching | 推奨: Claude / Codex — 速度より文章の品質が重要なため。 | Recommended: Claude or Codex — writing quality matters more than speed. |
| generation | 推奨: Claude — 実行頻度が低く、質の高さが最優先のため。 | Recommended: Claude — runs infrequently and quality matters most. |
| assessment | 推奨: Claude — 実行頻度が低く、質の高さが最優先のため。 | Recommended: Claude — runs infrequently and quality matters most. |

- README: ロール表（153–158行）に「推奨」列を追加し、「使い分けの目安」（192行）を同内容に更新。Codex は「プリセットには含まれず手動割当のみ・プロンプトは Claude 向け調整という品質の前提あり」の但し書きを維持
- ユーザー発言中の「Codex（※Typeless）」は意味が確認できなかったため文言に含めない（確認待ち事項）

## A-7. i18n 文言ポリシー改定 + メニュー日本語の見直し

### AGENTS.md の規約改定

現行「**i18n は named 型辞書（`src/i18n.ts`）**: 型 + `STR.en` + `STR.ja` の3点を同時に追加。**既存キーの日本語文言は一字一句変更しない**（変更は明示の合意があるときのみ）。文字列の直書き禁止。」を次に置換:

> **i18n は named 型辞書（`src/i18n.ts`）**: 型 + `STR.en` + `STR.ja` の3点を同時に追加・変更する。文言は利用者のわかりやすさ優先で改善してよいが、**EN/JA を必ず同時に更新**し、ユーザーに見える文言変更はコミットメッセージで明示する。文字列の直書き禁止。

### メニュー文言の対照表（変更は最小限・用語先行→行為先行）

| キー | 現行 JA | 新 JA | EN 追随 |
| --- | --- | --- | --- |
| `drills["ftt-mini"].title` | 4/3/2ミニ | くり返しトーク（4/3/2） | Repeat talk (4/3/2) |
| `drills["ftt-mini"].desc` | 同じ話を2回、時間圧で流暢に | 同じ話を2回、制限時間を短くしながら流暢に | 同趣旨に更新 |
| `nav.listening` | 多聴 | リスニング（多聴） | Listening のまま（要確認・意味が既に明瞭なら不変） |
| `shortSession.title` | 短縮版 | 短縮セッション | Short session 系に整合 |

その他（音読ウォームアップ・シャドーイング・ロールプレイ各種・通しセッション・ナビ各項目）は desc が行為を説明しており識別性維持を優先して変更しない。実装時に EN 側の現文言を確認し、意味がズレる場合のみ追随変更する。

## 不変条件・検証

- 研究制約（情報的フィードバックのみ・XP不減・データ非削除・自動表示なし）は全項目で維持
- 検証ゲート: `cd app && bun test` / `cd app && bun run typecheck` / `cd app/client && bun run build`
- リリース: CHANGELOG（Keep a Changelog・日本語・ユーザー視点）→ README「できること」整合チェック → v0.22.0 タグ → デプロイ（client build + `launchctl kickstart -k gui/$(id -u)/com.local.solo-eikaiwa.server`）
