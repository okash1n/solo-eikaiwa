//! 半自動アップデート: 起動時チェック → ネイティブダイアログ → 1クリック更新 → 再起動。
//! 更新UXは全てRust側（ダイアログ・メニュー）で完結させる。本体UI（localhost配信のwebview）
//! へのIPCはゼロ権限のまま（capabilities/default.json のコメント参照）。

/// 手動DL先。適用失敗・チェック失敗時の情報的な案内に使う。
pub(crate) const RELEASES_URL: &str = "https://github.com/btajp/solo-eikaiwa/releases";

/// ダイアログ文言の言語。クライアント側i18n（webview内）とは独立した、ネイティブUI専用の選択。
#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum Lang {
    Ja,
    En,
}

/// システムロケール文字列からダイアログ言語を選ぶ。`ja*` のみ日本語、他は英語。
pub(crate) fn pick_lang(locale: Option<&str>) -> Lang {
    match locale {
        Some(l) if l.starts_with("ja") => Lang::Ja,
        _ => Lang::En,
    }
}

/// 確認ダイアログ（2ボタン）用の文言一式。
pub(crate) struct PromptText {
    pub title: String,
    pub body: String,
    pub ok: String,
    pub cancel: String,
}

/// 情報ダイアログ（1ボタン）用の文言。
pub(crate) struct InfoText {
    pub title: String,
    pub body: String,
}

/// 新版検知時の確認ダイアログ。更新は必ずユーザーの明示クリックで実行する（研究制約）。
pub(crate) fn update_prompt_text(lang: Lang, current: &str, latest: &str) -> PromptText {
    match lang {
        Lang::Ja => PromptText {
            title: "アップデート".to_string(),
            body: format!(
                "solo-eikaiwa v{latest} が利用可能です（現在 v{current}）。\n\
                 今すぐダウンロードして更新しますか？\n更新後は自動で再起動します。"
            ),
            ok: "更新する".to_string(),
            cancel: "今回はしない".to_string(),
        },
        Lang::En => PromptText {
            title: "Update Available".to_string(),
            body: format!(
                "solo-eikaiwa v{latest} is available (you have v{current}).\n\
                 Download and install now?\nThe app will restart automatically."
            ),
            ok: "Update".to_string(),
            cancel: "Not Now".to_string(),
        },
    }
}

/// 手動チェックで「最新だった」場合の情報表示。
pub(crate) fn manual_latest_text(lang: Lang, current: &str) -> InfoText {
    match lang {
        Lang::Ja => InfoText {
            title: "アップデート".to_string(),
            body: format!("お使いのバージョン（v{current}）が最新です。"),
        },
        Lang::En => InfoText {
            title: "Up to Date".to_string(),
            body: format!("You're on the latest version (v{current})."),
        },
    }
}

/// 更新の適用（DL・差し替え）に失敗した場合の情報表示。
/// App Translocation（/Applications 未移動）が典型原因のため、移動のヒントも添える。
pub(crate) fn install_failed_text(lang: Lang) -> InfoText {
    match lang {
        Lang::Ja => InfoText {
            title: "アップデート".to_string(),
            body: format!(
                "自動更新を完了できませんでした。\n最新版は以下から手動でダウンロードできます:\n{RELEASES_URL}\n\
                 （アプリを /Applications に移動してから起動すると自動更新できるようになります）"
            ),
        },
        Lang::En => InfoText {
            title: "Update".to_string(),
            body: format!(
                "The update could not be installed automatically.\nYou can download the latest version manually:\n{RELEASES_URL}\n\
                 (Moving the app into /Applications enables automatic updates.)"
            ),
        },
    }
}

/// 手動チェックで確認自体ができなかった（オフライン等）場合の情報表示。
/// 「更新に失敗した」と誤解させないよう、適用失敗（`install_failed_text`）とは別文言にする。
pub(crate) fn manual_check_failed_text(lang: Lang) -> InfoText {
    match lang {
        Lang::Ja => InfoText {
            title: "アップデート".to_string(),
            body: format!(
                "アップデートを確認できませんでした（ネットワーク接続をご確認ください）。\n\
                 最新版の有無は以下でも確認できます:\n{RELEASES_URL}"
            ),
        },
        Lang::En => InfoText {
            title: "Update".to_string(),
            body: format!(
                "Could not check for updates (please check your network connection).\n\
                 You can also check the latest release here:\n{RELEASES_URL}"
            ),
        },
    }
}

/// メニュー項目「アップデートを確認…」のラベル。
pub(crate) fn check_menu_label(lang: Lang) -> &'static str {
    match lang {
        Lang::Ja => "アップデートを確認…",
        Lang::En => "Check for Updates…",
    }
}

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

/// 更新フローの単一実行ガード。起動時チェックとメニューの手動チェックが同時に走って
/// `download_and_install` が二重実行されるのを防ぐ（`sidecar::SidecarState.starting` と同型の
/// CAS + Drop解放パターン）。install 成功時は restart() でプロセスごと消えるため解放不要。
static UPDATE_FLOW_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

struct FlowGuard;

impl Drop for FlowGuard {
    fn drop(&mut self) {
        UPDATE_FLOW_IN_FLIGHT.store(false, Ordering::SeqCst);
    }
}

fn try_begin_flow() -> Option<FlowGuard> {
    UPDATE_FLOW_IN_FLIGHT
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .ok()
        .map(|_| FlowGuard)
}

/// 現在のシステムロケールからダイアログ言語を決める。
pub(crate) fn current_lang() -> Lang {
    pick_lang(sys_locale::get_locale().as_deref())
}

/// 起動時の自動チェック。非ブロッキング（起動・attach・sidecar spawnを一切待たせない）。
/// 失敗（オフライン・GitHub不達等）はログのみで無言スキップする（起動時にダイアログを出さない）。
pub fn spawn_startup_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = check_and_prompt(app, false).await {
            log::warn!("updater: startup check failed (skipped quietly): {e}");
        }
    });
}

/// メニュー「アップデートを確認…」からの手動チェック。
/// 起動時と違いユーザーが結果を待っているため、「最新」「確認失敗」も必ずダイアログで返す。
pub fn spawn_manual_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = check_and_prompt(app.clone(), true).await {
            log::warn!("updater: manual check failed: {e}");
            let t = manual_check_failed_text(current_lang());
            app.dialog()
                .message(&t.body)
                .title(&t.title)
                .kind(MessageDialogKind::Info)
                .show(|_| {});
        }
    });
}

/// E2E検証専用の自動承認判定（純関数）。値が正確に "1" のときだけ有効（誤爆防止）。
pub(crate) fn should_auto_confirm(env_value: Option<&str>) -> bool {
    env_value == Some("1")
}

/// ネイティブダイアログはスクリプトから操作できないため、実機E2E（desktop/e2e-updater/）では
/// `SOLO_EIKAIWA_UPDATER_AUTO=1` で確認ダイアログをスキップして即インストールする。
/// 配布ユーザーが通常起動で踏むことはない（環境変数を明示設定した場合のみ）。
fn auto_confirm_forced() -> bool {
    should_auto_confirm(std::env::var("SOLO_EIKAIWA_UPDATER_AUTO").ok().as_deref())
}

async fn check_and_prompt(app: AppHandle, manual: bool) -> tauri_plugin_updater::Result<()> {
    let Some(_flow_guard) = try_begin_flow() else {
        // 既に別の更新フロー（起動時チェックのDL中など）が進行中。二重DL・二重installを避けて
        // 何もしない（手動起点でも同様: 進行中フローの結果がまもなくダイアログで現れるため）。
        log::info!("updater: another update flow is already in flight; skipping this trigger");
        return Ok(());
    };
    let lang = current_lang();
    let Some(update) = app.updater()?.check().await? else {
        if manual {
            let current = app.package_info().version.to_string();
            let t = manual_latest_text(lang, &current);
            app.dialog()
                .message(&t.body)
                .title(&t.title)
                .kind(MessageDialogKind::Info)
                .show(|_| {});
        }
        return Ok(());
    };

    let confirmed = if auto_confirm_forced() {
        log::warn!("updater: SOLO_EIKAIWA_UPDATER_AUTO=1 (E2E hook); skipping confirmation dialog");
        true
    } else {
        let t = update_prompt_text(lang, &update.current_version, &update.version);
        let dialog = app
            .dialog()
            .message(&t.body)
            .title(&t.title)
            .buttons(MessageDialogButtons::OkCancelCustom(t.ok, t.cancel));
        // blocking_showはメインスレッド禁止（docs.rs明記: 内部でメインスレッドへディスパッチするため
        // メインスレッドで待つとデッドロック）。tokioのblockingプールに逃がして待つ。
        tauri::async_runtime::spawn_blocking(move || dialog.blocking_show())
            .await
            .unwrap_or(false)
    };
    if !confirmed {
        // 「今回はしない」: 何も記録しない・次回起動時にまた1回だけ聞く（情報的・ペナルティなし）。
        log::info!("updater: user declined update to v{}", update.version);
        return Ok(());
    }

    log::info!("updater: downloading and installing v{} ...", update.version);
    match update.download_and_install(|_, _| {}, || {}).await {
        Ok(()) => {
            log::info!("updater: installed v{}; restarting", update.version);
            // 非メインスレッド（asyncタスク）からのrestart()はrequest_exit経由で
            // RunEvent::Exitをコールバックへ配送してから再起動する（tauri 2.11.2
            // src/app.rs:594-603, 1419-1428で確認）。既存のsidecar::kill_on_exitが
            // そこで走るため、旧sidecarの孤児化・旧サーバへの再attachは起きない。
            app.restart();
        }
        Err(e) => {
            log::error!("updater: install failed: {e}");
            let t = install_failed_text(lang);
            app.dialog()
                .message(&t.body)
                .title(&t.title)
                .kind(MessageDialogKind::Info)
                .show(|_| {});
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_lang_ja_for_japanese_locales() {
        assert_eq!(pick_lang(Some("ja")), Lang::Ja);
        assert_eq!(pick_lang(Some("ja-JP")), Lang::Ja);
    }

    #[test]
    fn pick_lang_en_for_others_and_missing() {
        assert_eq!(pick_lang(Some("en-US")), Lang::En);
        assert_eq!(pick_lang(Some("fr")), Lang::En);
        assert_eq!(pick_lang(None), Lang::En);
    }

    #[test]
    fn update_prompt_contains_both_versions() {
        let t = update_prompt_text(Lang::Ja, "0.29.0", "0.30.0");
        assert!(t.body.contains("0.29.0") && t.body.contains("0.30.0"));
        let t = update_prompt_text(Lang::En, "0.29.0", "0.30.0");
        assert!(t.body.contains("0.29.0") && t.body.contains("0.30.0"));
    }

    #[test]
    fn install_failed_text_mentions_releases_url() {
        // 適用失敗時は手動DL先（Releases）を必ず情報的に案内する（研究制約: 警告調・強要なし）
        assert!(install_failed_text(Lang::Ja).body.contains(RELEASES_URL));
        assert!(install_failed_text(Lang::En).body.contains(RELEASES_URL));
    }

    #[test]
    fn manual_latest_text_mentions_current_version() {
        assert!(manual_latest_text(Lang::Ja, "0.29.0").body.contains("0.29.0"));
        assert!(manual_latest_text(Lang::En, "0.29.0").body.contains("0.29.0"));
    }

    #[test]
    fn update_flow_guard_prevents_concurrent_entry() {
        // 起動時チェックと手動チェックの同時実行で download_and_install が二重に走らないこと。
        let g = try_begin_flow().expect("first acquire should succeed");
        assert!(try_begin_flow().is_none(), "second concurrent acquire must fail");
        drop(g);
        assert!(try_begin_flow().is_some(), "acquire after release should succeed");
    }

    #[test]
    fn should_auto_confirm_only_when_env_is_exactly_1() {
        // E2E専用フック: 明示的に "1" を設定したときだけ有効（誤爆防止）。
        assert!(should_auto_confirm(Some("1")));
        assert!(!should_auto_confirm(Some("0")));
        assert!(!should_auto_confirm(Some("true")));
        assert!(!should_auto_confirm(None));
    }

    #[test]
    fn manual_check_failed_text_mentions_releases_url() {
        // 手動チェックの通信失敗は「確認できなかった」事実のみ伝える（更新失敗とは別文言）
        assert!(manual_check_failed_text(Lang::Ja).body.contains(RELEASES_URL));
        assert!(manual_check_failed_text(Lang::En).body.contains(RELEASES_URL));
    }
}
