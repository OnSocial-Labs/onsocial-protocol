//! SDK ↔ contract parity round-trip test.
//!
//! Reads the JSON fixture written by `packages/onsocial-sdk` and asserts that
//! every entry deserializes into a `protocol::Request` with the expected
//! `Action` variant. This proves the TypeScript builders emit JSON that the
//! Rust contract types accept verbatim.
//!
//! Re-generate the fixture with: `pnpm --filter @onsocial/sdk test`.

use std::collections::HashSet;

use near_sdk::serde::Deserialize;
use near_sdk::serde_json;

use crate::protocol::Request;

const FIXTURE_JSON: &str = include_str!("../../../tests/fixtures/sdk-parity.json");

/// Every Action variant tag accepted by the contract. Must stay in sync with
/// `Action` in `src/protocol/types.rs`.
const ALL_ACTION_TYPES: &[&str] = &[
    "set",
    "create_group",
    "join_group",
    "leave_group",
    "add_group_member",
    "remove_group_member",
    "approve_join_request",
    "reject_join_request",
    "cancel_join_request",
    "blacklist_group_member",
    "unblacklist_group_member",
    "transfer_group_ownership",
    "set_group_privacy",
    "create_proposal",
    "vote_on_proposal",
    "cancel_proposal",
    "set_permission",
    "set_key_permission",
];

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
    expected_action_type: String,
    request: serde_json::Value,
}

#[test]
fn sdk_fixture_round_trips_into_contract_request() {
    let file: ParityFile =
        serde_json::from_str(FIXTURE_JSON).expect("parity fixture must be valid JSON");
    assert_eq!(file.schema, "onsocial.sdk.parity/v1");
    assert!(!file.cases.is_empty(), "parity fixture must contain cases");

    let mut failures: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for case in file.cases.iter() {
        match serde_json::from_value::<Request>(case.request.clone()) {
            Ok(request) => {
                let actual = request.action.action_type();
                if actual != case.expected_action_type {
                    failures.push(format!(
                        "case `{}`: expected action_type `{}`, got `{}`",
                        case.name, case.expected_action_type, actual
                    ));
                }
                seen.insert(actual.to_string());
            }
            Err(err) => failures.push(format!(
                "case `{}`: failed to deserialize Request: {err}",
                case.name
            )),
        }
    }

    let declared: HashSet<&str> = ALL_ACTION_TYPES.iter().copied().collect();
    let missing: Vec<&str> = ALL_ACTION_TYPES
        .iter()
        .copied()
        .filter(|t| !seen.contains(*t))
        .collect();
    let stray: Vec<String> = seen
        .iter()
        .filter(|t| !declared.contains(t.as_str()))
        .cloned()
        .collect();

    if !missing.is_empty() {
        failures.push(format!(
            "missing parity coverage for Action variants: {}",
            missing.join(", ")
        ));
    }
    if !stray.is_empty() {
        failures.push(format!(
            "fixtures emitted action types unknown to contract: {}",
            stray.join(", ")
        ));
    }

    assert!(
        failures.is_empty(),
        "SDK ↔ contract parity drift detected:\n - {}",
        failures.join("\n - ")
    );
}

