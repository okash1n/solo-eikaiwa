# 教材ラダー拡充 設計ドキュメント（v0.26 候補）

- 起点: ユーザー指示（2026-07-09）「段階的にレベルアップしていけるよう、様々なレベル帯の各メニューの教材を予め生成してリポジトリに同梱。音声は OpenAI API 可」
- 設計プロセス: 棚卸し調査（`.superpowers/sdd/content-inventory-2026-07-09.md`）→ **Claude × Codex(GPT-5.5 xhigh) 2ラウンド議論**（`.superpowers/sdd/content-ladder-debate-r{1,2}-{prompt,codex}.md`）で収束
- 前提リリース: v0.25 口語最適化パック（spoken-style ブロック + spoken-register 検証器 + 多聴6本再生成）

## 1. 解くべき問題（棚卸しの確定所見）

1. **daily ドメインは stage5-6 で topics/scenarios が完全ゼロ**。`rotation.ts` は在庫ゼロの domain を無警告でスキップして他 domain へ振替、全 domain ゼロなら帯無視の全体フォールバック — 進級した学習者が**気づかないまま**選んだ覚えのない教材へ流れる（質的に最悪の穴）
2. business も薄い（topics s6=1・scenarios s1=1 = 実質毎回同じ）
3. listening は 3domain×2帯の全セルが各1本 = 冗長度ゼロ（「選択肢の制限が効く」という研究知見の前提すら満たさない）
4. **4/3/2 prepPack と model talk は毎回 LLM 生成**（model_talks テーブルは Library 画面用の保存のみで POST 経路の再利用ゼロ — Codex 指摘をコードで実証済み、index.ts:81-86）
5. 検証インフラは listening 用 spoken-register チェックのみ。topics/scenarios/prepPack/model talk に口語検証なし
6. 既存 stage-curriculum-ia 計画（2026-07-07・未実装）は本拡充が**実質的前提条件**（fluency 帯の roleplay 主役設計が daily 空白を暗黙回避している傍証あり）

## 2. 設計原則（研究根拠・議論合意）

- **提示数と在庫の区別**: restricted choice（d=0.50 vs 自由 0.32）は「提示数」の知見。UI は 2-3 件提示 + 在庫は hidden rotation
- **帯は3値 [1,2]/[3,4]/[5,6]**（foundation/development/fluency）= stage-curriculum-ia と同一語彙。教材 frontmatter は従来どおり stage 範囲 [min,max] を正とし、3帯は quota 集計・UI 専用レイヤー（責務分離）
- **quota は帯×domain の均等**（空白セルだけ厚くするのは発見済みバグへの過適合 — Codex 裁定採用）。広範囲 bridge 教材（例 [1,4]）は quota 集計外
- 検証は**各 stage で適合数を確認**（[5,6] の1本は s5/s6 両方を満たす）
- 手修正禁止 → 全生成物に機械検証 + FAIL 時再生成の閉ループ（v0.25 の regen 運用を一般化）

## 3. 確定数量表（Codex 最終確認済み）

| type | foundation d/b/i | development d/b/i | fluency d/b/i | total |
|---|---:|---:|---:|---:|
| topics | 4/4/4 | 4/4/4 | 4/4/4 | 36（現26） |
| scenarios | 3/3/3 | 3/3/3 | 3/3/3 | 27（現18） |
| listening | 4/4/4 | 4/4/4 | 4/4/4 | 36（現6・LISTENING_PLAN 3帯化） |
| prepPack | topic×range内stage | 同左 | 同左 | 約72（新規同梱） |
| model talk | topic×range内stage | 同左 | 同左 | 約72（新規同梱） |
| spoken function 例文 | 30 | 30 | 30 | +90（計390） |

- 既存教材は資産として残す（quota の不足分だけ追加生成）。既存の広範囲 frontmatter はそのまま・quota 外扱い
- spoken function 例文 = 依頼・断り・聞き返し・言い換え・相槌等（domain 非依存・帯別 30）

## 4. 同梱形式と3層ルックアップ

- prepPack / model talk: **`content/topic-assets/{topicId}.json`** — `{ topicId, sourceHash, byStage: { [stage]: { prepPack, modelTalk } } }`。sourceHash = topic 本文のハッシュ（topic 再生成時の stale 検出）+ promptVersion
- 解決順: **同梱 JSON → DB キャッシュ → 実行時生成**（音声の3層と同型）。実行時生成コードパスをバッチ実行して生成（二重実装回避）
- model_talks の単発 reuse 修正は**しない**（sourceHash/promptVersion なしの再利用は stale 化リスク・直後に3層で置換される二度手間 — Codex 裁定採用）

## 5. 検証拡張（タイプ別）

- listening / model talk（連続モノローグ）: spoken-register 3指標を hard fail（帯別閾値）
- prep chunk: 集計でなく **1 chunk 単位**で「完全文・語数・placeholder なし」
- scenarios: **starters（冒頭セリフ）のみ**口語検証。hints/setup には短縮形率を要求しない
- intermediate 帯の較正: 「旧素材 FAIL + 例文300 PASS + v0.25 再生成 listening PASS」を制約に初期は緩めから
- **wave0: カバレッジ検証の恒久化** — 帯×domain×stage の quota 充足を機械チェックする validator（scripts/）を先に固定し、以後の生成の合否判定に使う
- 「完全に既知」条項（4/3/2 の Nation 条件近似・Codex 案）: 各 topic は「学習者が新知識なしで自分の経験を話せる、具体的で一般的な場面」に接地。抽象論・専門知識・時事・希少趣味・個人情報前提は禁止。出力に `experienceAnchor` / `memoryCue` / `commonObjectsOrActions` を含め、anchor 有無・禁止カテゴリ・抽象タイトルを機械チェック

## 6. rotation の情報的注記（研究制約準拠）

- 選定挙動は**変えない**。fallback（domain 振替 / 帯外出題）が起きた事実を metadata 化し、UI は「近いレベルの教材を選びました」程度の**情報的注記**のみ表示（警告調・叱責調禁止）。将来の在庫切れを無音で隠さないため

## 7. 音声同梱（OpenAI API・ユーザー許可済み）

- 対象: **listening 36本 + model talk 全数 + 新規例文90**（gpt-4o-mini-tts / alloy・sentences 方式の sha256 命名を一般化）
- prep chunk 音声は**同梱しない**（短句多数でファイル数過大・押下時 TTS + data/tts-cache で十分）
- 中間リリースする場合は listening 音声= wave2 後、model talk 音声= wave3 後に分割可

## 8. 実行ウェーブ

- wave0: カバレッジ validator + タイプ別検証拡張（コード）
- wave1: **空白セル即応** — daily/business の s5-6 topics+scenarios を [5,6] 素材で先行生成（無警告振替の実害を最短で解消）
- wave2: listening 3帯化（LISTENING_PLAN 改定）+ 36本生成
- wave3: topic-assets（prepPack + model talk 全 topic×range内stage）+ 3層ルックアップ実装
- wave4: spoken function 例文 +90（解説つき）
- wave5: 音声同梱（listening / model talk / 新例文）+ rotation 情報的注記
- 生成は全ウェーブとも `LLM_PROVIDER=claude CLAUDE_MODEL=opus CLAUDE_EFFORT=high` + 検証 FAIL 再生成ループ

## 9. スコープ外（バックログ化）

- 真のパーソナライズ topic（自分の仕事・実際に話した内容からの topic 化 — Nation「完全に既知」条件の本筋対応。新 UX が必要）
- sentences300 のラダー化（stage バンドなし設計の変更は別論点）
- stage-curriculum-ia 計画本体（本拡充の後に実施。3帯語彙は本設計で先取り整合済み）

## 10. コスト見積り

- LLM 生成: topics+10 / scenarios+9 / listening 36 / topic-assets ~72×2 / 例文90 ≒ **250-300 opus 呼び出し**（再生成含む・サブスク）
- TTS: listening 36×250-450語 + model talk ~72 + 例文90 ≒ **数ドル規模**（OpenAI API・従量）
