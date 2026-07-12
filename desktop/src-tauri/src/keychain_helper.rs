use std::io::{Read, Write};

const KEYCHAIN_SERVICE: &str = "solo-eikaiwa";
const ITEM_NOT_FOUND: i32 = -25_300;
const ALLOWED_ACCOUNTS: [&str; 5] = [
    "ANTHROPIC_API_KEY",
    "CODEX_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_COMPAT_API_KEY",
    "TTS_API_KEY",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Action {
    Get,
    Set,
    Delete,
}

fn parse_args(args: &[String]) -> Result<(Action, &str), i32> {
    if args.len() != 2 || !ALLOWED_ACCOUNTS.contains(&args[1].as_str()) {
        return Err(64);
    }
    let action = match args[0].as_str() {
        "get" => Action::Get,
        "set" => Action::Set,
        "delete" => Action::Delete,
        _ => return Err(64),
    };
    Ok((action, &args[1]))
}

fn valid_secret(value: &[u8]) -> bool {
    !value.is_empty()
        && value.len() <= 500
        && value.iter().all(|byte| (0x21..=0x7e).contains(byte))
        && !value
            .iter()
            .any(|byte| matches!(byte, b'"' | b'\'' | b'\\'))
}

#[cfg(target_os = "macos")]
fn run(
    action: Action,
    account: &str,
    input: &mut dyn Read,
    output: &mut dyn Write,
) -> Result<(), i32> {
    use security_framework::passwords::{
        delete_generic_password, get_generic_password, set_generic_password,
    };

    match action {
        Action::Get => match get_generic_password(KEYCHAIN_SERVICE, account) {
            Ok(value) => output.write_all(&value).map_err(|_| 1),
            Err(error) if error.code() == ITEM_NOT_FOUND => Err(44),
            Err(_) => Err(1),
        },
        Action::Set => {
            let mut value = Vec::new();
            input.take(501).read_to_end(&mut value).map_err(|_| 1)?;
            if !valid_secret(&value) {
                return Err(65);
            }
            set_generic_password(KEYCHAIN_SERVICE, account, &value).map_err(|_| 1)
        }
        Action::Delete => match delete_generic_password(KEYCHAIN_SERVICE, account) {
            Ok(()) => Ok(()),
            Err(error) if error.code() == ITEM_NOT_FOUND => Err(44),
            Err(_) => Err(1),
        },
    }
}

#[cfg(not(target_os = "macos"))]
fn run(
    _action: Action,
    _account: &str,
    _input: &mut dyn Read,
    _output: &mut dyn Write,
) -> Result<(), i32> {
    Err(69)
}

pub fn run_from_env() -> i32 {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let (action, account) = match parse_args(&args) {
        Ok(parsed) => parsed,
        Err(code) => return code,
    };
    let mut input = std::io::stdin().lock();
    let mut output = std::io::stdout().lock();
    run(action, account, &mut input, &mut output)
        .err()
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::{parse_args, valid_secret, Action};

    #[test]
    fn accepts_only_known_actions_and_accounts() {
        let args = vec!["get".to_string(), "OPENAI_API_KEY".to_string()];
        assert_eq!(parse_args(&args), Ok((Action::Get, "OPENAI_API_KEY")));
        assert_eq!(
            parse_args(&["export".into(), "OPENAI_API_KEY".into()]),
            Err(64)
        );
        assert_eq!(parse_args(&["get".into(), "OTHER_SECRET".into()]), Err(64));
    }

    #[test]
    fn validates_secret_without_logging_or_shell_quoting() {
        assert!(valid_secret(b"sk-test_123"));
        assert!(!valid_secret(b""));
        assert!(!valid_secret(b"has space"));
        assert!(!valid_secret(b"has\"quote"));
    }
}
