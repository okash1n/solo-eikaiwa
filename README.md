# learn-english

毎日5分から回せる、自分専用の英会話ジム。録音した声をローカルで文字起こしし、AIが会話相手とコーチを務め、練習履歴が貯まっていく — すべて自分の Mac の上で。
A local-first, research-grounded English speaking practice app for daily self-study on macOS.

個人開発のツールを公開しているものです。Issue / PR は歓迎しますが、対応は保証しません。

## できること

### 🔊 クイックドリル（5〜10分）— 毎日のメイン

1日1本、5〜10分で終わる単品ドリル。研究上、総学習時間より「頻度と完了」が上達に効くため、これが日々のデフォルト導線です。

- **音読ウォームアップ（6分）** — 今日のお題の表現チャンクを声に出して準備。各表現は🔊ボタンでネイティブ音声を聞ける
- **4/3/2ミニ（8分）** — 同じ話を制限時間を縮めながら2回話す流暢性トレーニング。話す前に「表現・話の骨組み・モデルトーク」の準備フェーズがあり、ラウンド間には AI が言い間違いを日本語で解説
- **実務ロールプレイ（10分）** — 会議・ベンダー対応などのシナリオで AI と役割練習
- **シャドーイング（5分）** — AI が生成した短いモデルトークに重ねて発話

### 📋 強化セッション（60分 / 30分・週1〜2回）

音読ウォームアップ → 4/3/2 → ロールプレイ → シャドーイング → 振り返り、の5ブロック通し練習。振り返りでは今日の発話から AI が改善ポイントをまとめます。

### 💬 自由会話

英語でただ話す。録音ボタンを押して話すと、ローカルで文字起こしされ、AI が音声で返してきます。

### 📖 暗記例文300

会話でそのまま使える文法・言い回しを網羅したオリジナル300文（文法・機能25分類 × 日常/ビジネス/IT）。**日本語を見て声に出す → 答え合わせ（音声つき）→ 3段階の自己評価**という産出リトリーバル型で、評価に応じて 1→3→7→14→30→60日 の間隔反復（SRS）が次の出題日を決めます。一覧モードでは全文をフィルタ・音声つきで眺められます。

### 📚 ライブラリと練習記録

- 生成されたモデルトークは自動でライブラリに保存され、あとから本文確認・再再生できる
- ホームの GitHub 風カレンダーと練習記録（今週◯日・累計◯日）で継続が見える。連続日数を煽る演出は意図的に置いていません（切れたときのモチベーション低下が研究で示されているため）
- UI はデフォルト英語。サイドバーの **EN / 日本語** トグルでいつでも切り替え可能

## 学習設計の根拠

セッション構成は思いつきではなく、第二言語習得（SLA）研究のメタ分析・原典を3票の敵対的検証にかけた[リサーチレポート3本](docs/research/)に基づいています。核になっている知見:

- **4/3/2 時間圧反復**が発話速度・流暢性を向上させる（準備フェーズと明示的フィードバックの併用でさらに効果）
- **産出リトリーバル**（思い出して口に出す）は受容型学習より記憶定着に有効
- **間隔反復**は複雑なアルゴリズム不要。長めの固定間隔で十分
- **頻度 > 総時間**。1日サボっても無害、1週間空くと有害 — だから「短くても毎日」

詳細は[設計ドキュメント](docs/superpowers/specs/2026-07-05-learn-english-system-design.md) §5（方法論10原則）へ。

## 仕組みとプライバシー

```
ブラウザ録音 → whisper.cpp（ローカルSTT） → Claude（会話相手・コーチ） → OpenAI TTS（なければ macOS say）
```

- **音声はマシンから出ません**。外部に送られるのは発話のテキスト（Claude へ）と AI 応答のテキスト（TTS 用、キー設定時のみ）だけ
- 学習データ（録音・トランスクリプト・進捗・SRS状態・キャッシュ）はすべて `data/` のローカルファイルで、**リポジトリには一切コミットされない**
- API サーバは 127.0.0.1 バインドのみ（外部非公開）
- 対話 AI は Claude Agent SDK 経由であなたの Claude Pro/Max サブスクリプションを使うため、**Anthropic API キーは不要**

## はじめる

### 前提条件

- macOS（Apple Silicon 推奨）
- [Bun](https://bun.sh) ≥ 1.3
- Homebrew（whisper-cpp / ffmpeg の導入に使用）
- [Claude Code](https://claude.com/claude-code) CLI にログイン済みであること
- 任意: OpenAI API キー（高品質TTS用。なければ macOS `say` で動作）
- Chrome 系ブラウザ推奨（録音が audio/webm 固定のため。Safari 非対応）

### セットアップ（初回のみ）

```bash
./scripts/setup.sh   # brew 依存・whisperモデル(約1.6GB)DL・bun install
```

任意で `app/.env` に OpenAI キーを設定（環境変数参照も可）:

```
OPENAI_API_KEY=$YOUR_OPENAI_KEY_ENV_VAR
```

任意: 暗記例文300の音声を一括生成しておく（初回のみ・要 OPENAI_API_KEY。数十円程度・再実行安全）:

```bash
cd app && bun ../scripts/generate-sentence-audio.ts
```

### 起動: 常駐（推奨）

launchd の LaunchAgent として API サーバを常駐させ、ビルド済みクライアントを共有 Caddy デーモンが静的配信します。ログイン時に自動起動し、クラッシュ時は自動再起動。

```bash
./scripts/install-daemon.sh   # クライアントビルド → LaunchAgent 登録 → ヘルスチェック
```

初回、または Caddyfile を変更した場合のみ、共有 Caddy デーモンへの反映を手動実行（sudo が必要なため自動化していません）:

```bash
sudo launchctl kickstart -k system/com.local.https.caddy
```

ブラウザで https://learn-english を開く。

- 状態確認: `./scripts/status-daemon.sh` / 停止・解除: `./scripts/uninstall-daemon.sh`
- クライアントのコードを変更したら再ビルドが必要（`./scripts/install-daemon.sh` 再実行が簡単）
- Firefox で証明書警告が出る場合: `about:config` で `security.enterprise_roots.enabled` を `true` に（Firefox は macOS キーチェーンを標準では参照しないため）

### 起動: 開発

```bash
cd app && bun run dev        # APIサーバ :3111（127.0.0.1 のみ）
cd app/client && bun run dev # UI :5173（/api をプロキシ）
```

ブラウザで http://localhost:5173 を開く。常駐運用（https://learn-english）とは独立して動きます。ポート3111は共用なので、常駐と開発サーバは同時に起動できません。

## 自分用にカスタマイズする

お題・シナリオ（`content/topics/` / `content/scenarios/`）は frontmatter 付き Markdown ファイル1枚です。既存ファイルを真似て追加すれば、自動で least-recently-used ローテーションに入ります。同梱のお題はサンプルなので、自分の仕事・関心に合わせて差し替えてください。

```markdown
---
id: my-topic
kind: topic
title: "My topic"
title_ja: "私のお題"
---
Talk about:
- English hint — 日本語の補足
```

暗記例文（`content/sentences/sentences300.json`）も同じ発想で差し替え・追記できます（`no` の一意性だけ保つこと）。

## テスト

```bash
cd app && bun test           # サーバユニット/契約テスト
cd app && bun run typecheck
cd app/client && bun run build
./scripts/smoke-stt.sh       # STT 実機スモーク
```

## ドキュメント

- [設計ドキュメント](docs/superpowers/specs/2026-07-05-learn-english-system-design.md) — システム構成と学習方法論（10原則）
- [リサーチレポート](docs/research/) — 流暢性・語彙・チャンク・シャドーイング・AI会話・継続/習慣化の検証済み知見
- [実装計画](docs/superpowers/plans/) — 各マイルストーンの実装計画
- [CHANGELOG](CHANGELOG.md)

## ロードマップ

- **M3**: セッション中に詰まった表現の自動チャンク収集と SRS 統合
- **M4**: スピーキングメトリクス（調音速度・節内ポーズ・繰り返し頻度）と進捗ダッシュボード
- **M5**: 月次アセスメント・コンテンツ生成パイプライン

## ライセンス

[MIT](LICENSE)
