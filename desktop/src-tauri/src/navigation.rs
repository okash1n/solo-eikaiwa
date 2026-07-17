use tauri::Url;

use crate::sidecar;

/// webview 内で許可するナビゲーションか（自アプリと同梱ページのみ）。
///
/// 配信オリジン(127.0.0.1)には IPC 権限を一切与えない設計のため、クライアントJSは
/// shell.open を呼べない。外部リンクはクライアント側で同一フレーム遷移へ変換され
/// （app/client/src/lib/external-link.ts）、ここで拒否と同時にシステムブラウザで開く。
pub(crate) fn is_internal_nav(url: &Url) -> bool {
    match url.scheme() {
        // 同梱ローディングページ（tauri://localhost）と webview 内部遷移
        "tauri" | "about" | "data" | "blob" => true,
        "http" => {
            url.host_str() == Some("127.0.0.1")
                && url
                    .port_or_known_default()
                    .is_some_and(|p| sidecar::CANDIDATE_PORTS.contains(&p))
        }
        // 自アプリは http のみ。https を含む他は全て外部
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).expect("test url")
    }

    #[test]
    fn allows_app_origin_on_all_candidate_ports() {
        for port in sidecar::CANDIDATE_PORTS {
            assert!(is_internal_nav(&url(&format!("http://127.0.0.1:{port}/#/settings"))));
        }
    }

    #[test]
    fn allows_bundled_loading_page() {
        assert!(is_internal_nav(&url("tauri://localhost/index.html")));
        assert!(is_internal_nav(&url("about:blank")));
    }

    #[test]
    fn rejects_external_http_and_https() {
        assert!(!is_internal_nav(&url("https://github.com/btajp/solo-eikaiwa")));
        assert!(!is_internal_nav(&url("https://btajp.github.io/solo-eikaiwa/")));
        assert!(!is_internal_nav(&url("http://example.com/")));
        // 127.0.0.1 でも候補ポート外は外部扱い（別アプリの可能性）
        assert!(!is_internal_nav(&url("http://127.0.0.1:9999/")));
        // https の 127.0.0.1 は自アプリではない
        assert!(!is_internal_nav(&url("https://127.0.0.1:3111/")));
    }

    #[test]
    fn rejects_other_schemes() {
        assert!(!is_internal_nav(&url("file:///etc/hosts")));
        assert!(!is_internal_nav(&url("mailto:a@example.com")));
    }
}
