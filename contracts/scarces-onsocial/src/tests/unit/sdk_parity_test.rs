use std::collections::HashSet;

use near_sdk::serde::Deserialize;
use near_sdk::serde_json;

use crate::protocol::Request;

const FIXTURE_JSON: &str = include_str!("../../../tests/fixtures/sdk-parity.json");

const ALL_ACTION_TYPES: &[&str] = &[
    "quick_mint",
    "transfer_scarce",
    "batch_transfer",
    "approve_scarce",
    "revoke_scarce",
    "revoke_all_scarce",
    "burn_scarce",
    "renew_token",
    "revoke_token",
    "redeem_token",
    "claim_refund",
    "create_collection",
    "update_collection_price",
    "update_collection_timing",
    "mint_from_collection",
    "airdrop_from_collection",
    "delete_collection",
    "pause_collection",
    "resume_collection",
    "set_allowlist",
    "remove_from_allowlist",
    "set_collection_metadata",
    "set_collection_app_metadata",
    "withdraw_unclaimed_refunds",
    "list_native_scarce",
    "delist_native_scarce",
    "list_native_scarce_auction",
    "settle_auction",
    "cancel_auction",
    "delist_scarce",
    "update_price",
    "accept_offer",
    "cancel_offer",
    "accept_collection_offer",
    "cancel_collection_offer",
    "create_lazy_listing",
    "cancel_lazy_listing",
    "update_lazy_listing_price",
    "update_lazy_listing_expiry",
    "purchase_from_collection",
    "purchase_lazy_listing",
    "purchase_native_scarce",
    "place_bid",
    "make_offer",
    "make_collection_offer",
    "cancel_collection",
    "fund_app_pool",
    "storage_deposit",
    "register_app",
    "set_spending_cap",
    "storage_withdraw",
    "withdraw_app_pool",
    "withdraw_platform_storage",
    "set_app_config",
    "transfer_app_ownership",
    "add_moderator",
    "remove_moderator",
    "ban_collection",
    "unban_collection",
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
        "SDK ↔ scarces contract parity drift detected:\n - {}",
        failures.join("\n - ")
    );
}
