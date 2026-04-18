//! SDK ↔ rewards contract parity round-trip test.
//!
//! Reads the JSON fixture written by `packages/onsocial-sdk` and asserts that
//! every entry deserializes into a `protocol::Request` with the expected
//! `Action` variant. Re-generate with: `pnpm --filter @onsocial/sdk test`.

use near_sdk::serde::Deserialize;
use near_sdk::serde_json;

use crate::protocol::Request;

const FIXTURE_JSON: &str = include_str!("../tests/fixtures/sdk-parity.json");

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
    for case in file.cases.iter() {
        match serde_json::from_value::<Request>(case.request.clone()) {
            Ok(request) => {
                let reserialized = serde_json::to_value(&request.action)
                    .expect("Action must round-trip back to JSON");
                let actual = reserialized
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("<missing-type-tag>");
                if actual != case.expected_action_type {
                    failures.push(format!(
                        "case `{}`: expected action_type `{}`, got `{}`",
                        case.name, case.expected_action_type, actual
                    ));
                }
            }
            Err(err) => failures.push(format!(
                "case `{}`: failed to deserialize Request: {err}",
                case.name
            )),
        }
    }

    assert!(
        failures.is_empty(),
        "SDK ↔ rewards contract parity drift detected:\n - {}",
        failures.join("\n - ")
    );
}
