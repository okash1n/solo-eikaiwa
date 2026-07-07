#!/usr/bin/env bash
# solo-eikaiwa API サーバの LaunchAgent 常駐状態を確認する。
set -euo pipefail

LABEL="com.local.solo-eikaiwa.server"
UID_NUM="$(id -u)"

echo "== launchctl 状態 =="
launchctl print "gui/${UID_NUM}/${LABEL}" 2>&1 | grep -E "state|pid|last exit" || echo "未登録、または起動していません"

echo ""
echo "== API ヘルスチェック (127.0.0.1:3111) =="
curl -fsS http://127.0.0.1:3111/api/health 2>&1 || echo "到達できません"

echo ""
echo "== 共有Caddy経由 (https://solo-eikaiwa) =="
curl -sk --resolve solo-eikaiwa:443:127.0.0.1 https://solo-eikaiwa/api/health 2>&1 || echo "到達できません"
