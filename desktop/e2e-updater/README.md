# updater 実機 E2E（ローカル・Apple 資格情報不要）

tauri-plugin-updater の「チェック → DL → 差し替え → 自動再起動 → sidecar 入れ替わり」を
ローカル HTTP 配信で通しで検証する手順。ad-hoc 署名のままでよい（updater の署名検証は
minisign であり Apple 署名と独立。quarantine が付かないため Gatekeeper も再評価しない）。

overlay 2つ:

- `old.conf.json` — 更新される側。endpoint をローカルに差し替えるだけ（version は committed のまま）
- `new.conf.json` — 更新後になる側。`version: 99.0.0` + updater アーティファクト生成を有効化

`dangerousInsecureTransportProtocol` は http://127.0.0.1 配信のための E2E 専用設定。
**本番 config（tauri.conf.json）には絶対に入れない。**

## 手順

```bash
./desktop/build-sidecar.sh   # 未実行なら
cd desktop/src-tauri
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/solo-eikaiwa-updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

# 1) 新バージョン（v99.0.0）をビルドして tar.gz + .sig + latest.json を配信ディレクトリへ
cargo tauri build --bundles app --config ../e2e-updater/new.conf.json
mkdir -p /tmp/solo-e2e
cp target/release/bundle/macos/solo-eikaiwa.app.tar.gz /tmp/solo-e2e/
SIG=$(cat target/release/bundle/macos/solo-eikaiwa.app.tar.gz.sig)
printf '{"version":"99.0.0","platforms":{"darwin-aarch64":{"signature":"%s","url":"http://127.0.0.1:8930/solo-eikaiwa.app.tar.gz"}}}' "$SIG" > /tmp/solo-e2e/latest.json

# 2) 旧バージョン（現行 version）をビルドして書き込み可能な場所に置く
#    ⚠️ 必ず /private/tmp（実パス）配下に置き、実パスで起動すること。/tmp は /private/tmp への
#    symlink であり、updaterプラグインは実行パスにsymlinkが含まれると
#    「StartingBinary found current_exe() that contains a symlink」で拒否する（2026-07-10実測）。
cargo tauri build --bundles app --config ../e2e-updater/old.conf.json
mkdir -p /private/tmp/solo-e2e-app
cp -R target/release/bundle/macos/solo-eikaiwa.app /private/tmp/solo-e2e-app/

# 3) 配信して起動（自動承認フックで更新・再起動の確認ダイアログをスキップ。ダイアログ自体の確認は手動smoke時に）
#    ⚠️ 過去のE2Eインスタンスが残っていると 3112 を専有して sidecar 検証が乱れる。
#    事前に pkill -f solo-e2e-app しておく。
(cd /tmp/solo-e2e && python3 -m http.server 8930 &)
SOLO_EIKAIWA_NO_ATTACH=1 SOLO_EIKAIWA_UPDATER_AUTO=1 /private/tmp/solo-e2e-app/solo-eikaiwa.app/Contents/MacOS/app &
```

## 合格条件

1. 起動後まもなく更新が自動適用され、アプリが自動で再起動する（stdoutに
   `updater: downloading and installing v99.0.0` → `updater: installed v99.0.0; waiting for restart choice` →
   `updater: SOLO_EIKAIWA_UPDATER_AUTO=1 (E2E hook); restarting after install`）
2. `plutil -p /private/tmp/solo-e2e-app/solo-eikaiwa.app/Contents/Info.plist | grep ShortVersion` → `99.0.0`
3. `pgrep -fl solo-server` → 更新をまたいで旧 sidecar が残っていない（新アプリの1本のみ）
4. 手動確認（任意）: `SOLO_EIKAIWA_UPDATER_AUTO` を付けずに起動すると更新確認ダイアログが出て、
   「今回はしない」で何も起きず、次回起動時にまた1回だけ聞かれる。更新を適用した場合は、再起動前にも
   「今すぐ再起動」/「あとで再起動」の確認が出る

## 実施記録

- 2026-07-10: 0.28.0 → 99.0.0 で全行程 PASS（check → 自動承認 → DL → minisign 検証 →
  差し替え → 自動再起動 → 再チェックで最新判定）。symlink 拒否と多重インスタンスの
  ポート専有を実測し、上記の注意書きに反映済み。

## 後始末

```bash
pkill -f "http.server 8930"; pkill -f "solo-e2e-app"
# /private/tmp/solo-e2e* はOS再起動で消える（手動で消す場合は Finder か rm を自分で実行）
```
