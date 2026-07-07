# P6: エビデンス駆動のインプット&語彙強化（次期開発計画）

- 日付: 2026-07-07
- 根拠: [学習科学リサーチ第4弾 Fit & Gap](../../research/2026-07-07-learning-science-fit-gap.md)（検証済み9知見・Gap 4件）
- 検証: 本計画はドラフト段階で architect エージェントによる実コード整合性チェックを実施済み（P6-4 のアンカー誤り・content.ts の非 additive 性ほか5件を修正反映済み）
- 位置づけ: UX一貫性計画（P1〜P5/R1〜R5）の後継。**実施は残キューの P5+R5 完了後**（P6-1/P6-4 は小粒のため P5+R5 ブランチへの同乗可）
- 原則: R1〜R4 で確立した規約に**最初から**従う（新エンドポイント=機能別ルータ・新fetch=api/ドメインモジュール・新画面文言=named型サブ辞書 EN/JA・ストア=ensureSchema+insertReturningId・クライアントは useLoad/useExplain/usePlayRow/resolveSupport を再利用）。研究制約（情報的フィードバックのみ・データ非削除・自動表示なし）は全項目で維持

## P6-1: 生成・会話プロンプトの語彙レベリング（小・最優先）

**根拠**: 95%カバレッジ≈2,000〜3,000語族で非母語話者の聴解が安定（知見5）。
**内容**: 既存プロンプトには既に "Use plain, high-frequency English (B1 level). No rare idioms." が入っている（converse.ts:8 / coach.ts の roleplayPrompt・MODEL_TALK_SYSTEM）。P6-1 の実態は「新規制約の追加」ではなく**この行を stage 条件付きで強化**すること — stage 1〜3 では "roughly the most common 2,000–3,000 English word families" の明示制約に置換/追記する。

- `coach.ts`（roleplayPrompt / MODEL_TALK_SYSTEM / prepSystem）: stage 引数を受けて低ステージで制約を強める。index.ts の配線クロージャは既に progressStore に触れている（roleplay/modelTalk/prep とも）ため stage 供給は真に additive
- **自由会話は override 経路の新設が必要**（要注意 — 単純な deps 追加では済まない）: 現状 routes/converse.ts は scenarioId があるときだけ systemPrompt override を組み立て、自由会話は converse.ts の定数 PARTNER_SYSTEM_PROMPT にフォールバックする。① PARTNER_SYSTEM_PROMPT を stage 引数の builder 化、② ConverseRoutesDeps に stage 供給項を追加、③ route 側で自由会話用 override を組み立て、の3点セット
- `content-gen.ts`（例文・お題生成 CLI）にも同制約
- テスト: フェイク runner で opts.systemPrompt に制約文言が入ることを assert（content-gen.test.ts に前例あり）
- **やらないこと**: NGSL 等の語彙リスト同梱によるプログラム的カバレッジ検証（YAGNI — プロンプト制約の実効が不十分と観察されてから再検討）

## P6-2: 多聴ミニライブラリ（中の上・新柱）

**根拠**: 多読・多聴 d=0.38、口頭能力へ波及 d=0.42。効く条件は「レベル適合キュレーション」（d=0.50 vs 自由選択 0.32）と「記録」（d=0.47 vs なし 0.28）（知見8）。Four Strands の meaning-focused input 象限が現状空白。
**内容**: レベル適合の短い聴取素材（2〜4分）＋段階的スクリプト表示＋聴取ログ。

- **コンテンツ層 — ContentItem を広げない**（architect 指摘の反映）: parseContentFile は kind を topic/scenario にハード限定しており、ContentItem union は19ファイルに波及するため拡張しない。**独立した `ListeningItem` 型＋ `parseListeningFile` を新設**し、frontmatter パース部（content.ts:38-43 相当）だけを共有ヘルパに切り出して両者で使う。listening の本文は箇条書きでなく散文スクリプトなので本文抽出も別実装。`content/listening/*.md`（frontmatter: `level`帯・`domain`・`title_ja`）、`paths.ts` に LISTENING_DIR（既存と同型）
- **初期素材**: 生成 CLI（`scripts/generate-content.ts` に `listening` モード追加、P6-1 のレベリング制約込み）で生成 → 人手確認して commit
- **音声 — 逐次プレイヤーは小規模新設**: TTS はテキスト sha256 単位キャッシュ＋入力上限があるため**段落分割が必須**。段落ごとの `playTtsCached` はキャッシュ流用で済むが、**段落を順次再生する制御（await 連鎖・停止処理）は新規コード**（既存 Shadowing は単発再生のみ）
- **サーバ**: `routes/listening.ts` 新設（R1 規約: makeListeningRoutes・狭い deps・合成1行・交差1項＋ index.ts の realDeps 配線数行）。素材一覧・本文取得・聴取ログ記録の3エンドポイント。ログは新 `listening-store.ts`（ensureListeningSchema + insertReturningId、db.ts に import 1・呼び出し1）
- **クライアント**: `ListeningScreen` 新設。nav 追加は5箇所（Mode union / navItems / 描画分岐 / import / NavStrings キー）＋新 `ListeningScreenStrings`（EN/JA）。一覧（stage 適合フィルタ既定・全表示可）→ 再生（スクリプトは隠し既定・表示ボタン・訳解説は useExplain 流用 — パターンは ShadowingScreen 参照、ただし文言規律は P4 後の辞書方式）→ 聴取記録（回数表示は情報的・目標なし）。fetch は `api/listening.ts`（バレルに export 1行）
- **研究制約**: ログは記録と情報表示のみ（「今週n本聴いた」）。ノルマ・未達表示なし
- **リデザイン統合はしない**: シャドーイング素材（ContentItem 起点のモデルトーク生成）と供給経路が別であり、無理な統合は既存挙動を壊す。素材形式の将来流用余地だけ残す

## P6-3: 聴覚起点リトリーバルモード（小中）

**根拠**: form recall＋聴覚形式の語彙知識が聴解の最良予測子（知見3）。現行の例文練習は ja テキスト起点のみ。
**内容**: 例文練習に「音から」モード（任意・画面内トグル）。

- フロー: TTS を先に再生（英文・ja とも非表示）→ 意味を言う/繰り返す → 表示して答え合わせ → 既存の3段階自己評価（SRS・XP は既存と同一経路）
- 実装: PracticeTab の `Phase` union に `listen` を追加し、初期 phase を `audioFirst ? "listen" : (clozeDefault ? "cloze" : "prompt")` に。**注意（architect 指摘）**: ja/promptText ブロックは現状 phase 非依存で常時レンダリングされているため、`listen` フェーズで**この常時表示ブロックを隠す gating が必須**（単なる分岐追加ではない）
- **適用範囲**: キューは例文と期限到来チャンクの混在なので、audio-first は**チャンクカードにも効く**（チャンクは better 版 en 再生→表示で整合）
- トグルはサポート設定に足さず**画面ローカル**（cloze と同格の練習モード。localStorage キー `sentences.audioFirst`、ui.scale と同型の直読み）
- TTS は reveal と同じ `playTtsCached(current.en)` で足りる

## P6-4: 就寝前レビュー案内（極小）

**根拠**: 学習後睡眠の定着効果（L2 語彙 g=0.31 — 控えめ、知見9）。
**内容**: ローカル時刻が夜（20時以降）のとき、**StartScreen の hero 直下**（architect 検証済みのアンカー — 当初案の「SRS due 表示付近」は StartScreen に存在しないため訂正）に情報的な一言（「寝る前の復習は定着に少し有利です」）。通知・強制・未達表示なし。i18n は **HeroStrings に1キー追加**（EN/JA）。
※ home に due 件数を出す機能拡張は**しない**（別機能になり極小で収まらないため。必要性が出たら別計画）

## P6-5: やらないことの確定（負の意思決定の記録）

1. **SRS アルゴリズムの高度化**（SM-2/FSRS 等）— 等間隔と expanding は統計的に同等（知見2）。現行固定ラダーを維持
2. **新規語彙のインターリーブ提示** — 語彙材料では g=−0.39（知見6）。生成 CLI のカテゴリ単位バッチを維持
3. **偶発学習頼みの語彙設計** — 意図的学習主軸を維持（知見4）
4. **動機づけ理論ベースの機能**（SDT・目標設定・growth mindset）— 2回連続で検証通過ゼロ。情報的フィードバック原則のまま
5. **文法説明の増強** — エビデンス不在（未回答領域）。既存の「もっと詳しく」を維持
6. **NGSL 等語彙リストの同梱検証** / **home の due 件数表示** — 上記各項の注記どおり見送り

## 実施順序

| 順 | 内容 | 規模 | ブランチ |
|---|---|---|---|
| 0 | P5+R5（既存キューの残り） | 小 | feat/p5-r5 |
| 1 | **P6-1** 語彙レベリング（+ **P6-4** 就寝前案内を同乗） | 小 | feat/p6-vocab-leveling |
| 2 | **P6-2** 多聴ミニライブラリ | 中の上 | feat/p6-listening-library |
| 3 | **P6-3** 聴覚起点リトリーバル | 小中 | feat/p6-audio-first |

依存: P6-2 の素材生成は P6-1 のレベリング制約を前提とするため順序固定。P6-3 は独立。

## 未検証の前提（正直な注記）

- 検索練習・分散・意図的学習のエビデンスは語彙・筆記課題が支配的で、口頭産出への適用は**妥当な推論**（Fit&Gap Part 4）
- 「AI 音声対話で習熟度が上がる」直接 RCT は未確立のまま — アプリの中核前提の限界として記録
- 自己評価（3段階 grade）の信頼性は未検証の前提。月次アセスメントの客観指標（調音速度等）が部分的な相殺
