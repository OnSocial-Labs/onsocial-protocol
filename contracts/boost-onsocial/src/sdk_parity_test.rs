//! SDK ↔ boost contract `ft_on_transfer` msg parity test.
//!
//! Boost has no unified `Action` enum — its entrypoint is NEP-141
//! `ft_on_transfer(msg: String)` with a JSON payload. This test re-applies the
//! contract's parsing logic (action tag + required fields) to every msg the
//! SDK emits, confirming the wire format is accepted verbatim.
//!
//! Re-generate the fixture with: `pnpm --filter @onsocial/sdk test`.

use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{self, Value};

const FIXTURE_JSON: &str = include_str!("../tests/fixtures/sdk-parity.json");

/// Mirrors `VALID_LOCK_PERIODS` in `lib.rs`.
const VALID_LOCK_PERIODS: &[u64] = &[1, 6, 12, 24, 48];

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct ParityFile {
    schema: String,
    cases: Vec<ParityCase>,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct ParityCase {
    name: String,
    expected_action: String,
    #[serde(default)]
    expected_months: Option<u64>,
    msg: String,
}

#[test]
fn sdk_msg_fixture_matches_contract_parser() {
    let file: ParityFile =
        serde_json::from_str(FIXTURE_JSON).expect("parity fixture must be valid JSON");
    assert_eq!(file.schema, "onsocial.sdk.boost-msg-parity/v1");
    assert!(!file.cases.is_empty(), "parity fixture must contain cases");

    let mut failures: Vec<String> = Vec::new();
    for case in file.cases.iter() {
        let parsed: Value = match serde_json::from_str(&case.msg) {
            Ok(v) => v,
            Err(err) => {
                failures.push(format!(
                    "case `{}`: msg is not valid JSON: {err}",
                    case.name
                ));
                continue;
            }
        };

        let action = match parsed.get("action").and_then(|v| v.as_str()) {
            Some(a) => a,
            None => {
                failures.push(format!(
                    "case `{}`: msg missing string `action` field",
                    case.name
                ));
                continue;
            }
        };

        if action != case.expected_action {
            failures.push(format!(
                "case `{}`: expected action `{}`, got `{}`",
                case.name, case.expected_action, action
            ));
            continue;
        }

        match action {
            "lock" => {
                let months = parsed.get("months").and_then(|v| v.as_u64());
                match (months, case.expected_months) {
                    (Some(m), Some(em)) if m == em => {}
                    (Some(m), Some(em)) => failures.push(format!(
                        "case `{}`: expected months {em}, got {m}",
                        case.name
                    )),
                    (None, _) => failures.push(format!(
                        "case `{}`: lock msg missing `months` u64",
                        case.name
                    )),
                    (_, None) => failures.push(format!(
                        "case `{}`: fixture missing expected_months for lock",
                        case.name
                    )),
                }
                if let Some(m) = months {
                    if !VALID_LOCK_PERIODS.contains(&m) {
                        failures.push(format!(
                            "case `{}`: months {m} not in VALID_LOCK_PERIODS {:?}",
                            case.name, VALID_LOCK_PERIODS
                        ));
                    }
                }
            }
            "credits" | "fund_scheduled" => {}
            other => failures.push(format!(
                "case `{}`: unknown action `{other}` (boost contract would reject)",
                case.name
            )),
        }
    }

    assert!(
        failures.is_empty(),
        "SDK ↔ boost ft_on_transfer msg parity drift detected:\n - {}",
        failures.join("\n - ")
    );
}
