# learn-english

俺専用の英会話学習システム。設計と根拠は
[docs/superpowers/specs/2026-07-05-learn-english-system-design.md](docs/superpowers/specs/2026-07-05-learn-english-system-design.md) を参照。

## セットアップ（初回のみ）

```bash
./scripts/setup.sh          # brew 依存・whisperモデルDL・bun install
# 任意: app/.env に OPENAI_API_KEY を設定（未設定なら say フォールバック）
```

## 起動

```bash
cd app && bun run dev        # APIサーバ :3111（127.0.0.1 のみ、外部非公開）
cd app/client && bun run dev # UI :5173（/api をプロキシ）
```

ブラウザで http://localhost:5173 を開き、ボタンをクリックして英語で話す。

## テスト

```bash
cd app && bun test           # ユニットテスト
./scripts/smoke-stt.sh       # STT 実機スモーク
```

## データ

- `data/sessions/*.jsonl` — セッションログ（コミット対象）
- `data/recordings/` `data/tts-cache/` `models/` — gitignore
