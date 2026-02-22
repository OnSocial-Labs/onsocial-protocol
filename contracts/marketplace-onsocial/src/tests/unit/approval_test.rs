use crate::tests::test_utils::*;
use crate::*;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract() -> Contract {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;
    contract
}

fn mint_token_via_execute(contract: &mut Contract, token_owner: &AccountId) -> String {
    testing_env!(context(token_owner.clone()).build());
    let metadata = TokenMetadata {
        title: Some("Test Token".to_string()),
        description: None,
        media: None,
        media_hash: None,
        copies: None,
        issued_at: None,
        expires_at: None,
        starts_at: None,
        updated_at: None,
        extra: None,
        reference: None,
        reference_hash: None,
    };
    let options = ScarceOptions {
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
    };
    let result = contract
        .execute(make_request(Action::QuickMint { metadata, options }))
        .unwrap();
    result.as_str().unwrap().to_string()
}

// ─── ApproveScarce ──────────────────────────────────────────────────────────

#[test]
fn approve_scarce_happy() {
    let mut contract = setup_contract();
    let tid = mint_token_via_execute(&mut contract, &owner());

    contract
        .execute(make_request(Action::ApproveScarce {
            token_id: tid.clone(),
            account_id: buyer(),
            msg: None,
        }))
        .unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert!(token.approved_account_ids.contains_key(&buyer()));
}

#[test]
fn approve_scarce_not_owner_fails() {
    let mut contract = setup_contract();
    let tid = mint_token_via_execute(&mut contract, &owner());
    testing_env!(context(buyer()).build());

    let err = contract
        .execute(make_request(Action::ApproveScarce {
            token_id: tid,
            account_id: creator(),
            msg: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn approve_scarce_token_not_found_fails() {
    let mut contract = setup_contract();
    testing_env!(context(owner()).build());

    let err = contract
        .execute(make_request(Action::ApproveScarce {
            token_id: "nope".to_string(),
            account_id: buyer(),
            msg: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn approve_scarce_soulbound_fails() {
    let mut contract = setup_contract();
    // Soulbound minting requires internal_mint with overrides (no public Action)
    let ctx = MintContext {
        owner_id: owner(),
        creator_id: owner(),
        minter_id: owner(),
    };
    let metadata = TokenMetadata {
        title: Some("Soulbound".to_string()),
        description: None,
        media: None,
        media_hash: None,
        copies: None,
        issued_at: None,
        expires_at: None,
        starts_at: None,
        updated_at: None,
        extra: None,
        reference: None,
        reference_hash: None,
    };
    let ovr = ScarceOverrides {
        transferable: Some(false),
        ..Default::default()
    };
    contract
        .internal_mint("soul1".to_string(), ctx, metadata, Some(ovr))
        .unwrap();

    testing_env!(context(owner()).build());
    let err = contract
        .execute(make_request(Action::ApproveScarce {
            token_id: "soul1".to_string(),
            account_id: buyer(),
            msg: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// ─── RevokeScarce ───────────────────────────────────────────────────────────

#[test]
fn revoke_scarce_happy() {
    let mut contract = setup_contract();
    let tid = mint_token_via_execute(&mut contract, &owner());
    contract
        .execute(make_request(Action::ApproveScarce {
            token_id: tid.clone(),
            account_id: buyer(),
            msg: None,
        }))
        .unwrap();

    contract
        .execute(make_request(Action::RevokeScarce {
            token_id: tid.clone(),
            account_id: buyer(),
        }))
        .unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert!(!token.approved_account_ids.contains_key(&buyer()));
}

#[test]
fn revoke_scarce_not_owner_fails() {
    let mut contract = setup_contract();
    let tid = mint_token_via_execute(&mut contract, &owner());
    contract
        .execute(make_request(Action::ApproveScarce {
            token_id: tid.clone(),
            account_id: buyer(),
            msg: None,
        }))
        .unwrap();
    testing_env!(context(buyer()).build());

    let err = contract
        .execute(make_request(Action::RevokeScarce {
            token_id: tid,
            account_id: buyer(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn revoke_scarce_token_not_found_fails() {
    let mut contract = setup_contract();
    testing_env!(context(owner()).build());

    let err = contract
        .execute(make_request(Action::RevokeScarce {
            token_id: "nope".to_string(),
            account_id: buyer(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// ─── RevokeAllScarce ────────────────────────────────────────────────────────

#[test]
fn revoke_all_scarce_happy() {
    let mut contract = setup_contract();
    let tid = mint_token_via_execute(&mut contract, &owner());
    contract
        .execute(make_request(Action::ApproveScarce {
            token_id: tid.clone(),
            account_id: buyer(),
            msg: None,
        }))
        .unwrap();
    contract
        .execute(make_request(Action::ApproveScarce {
            token_id: tid.clone(),
            account_id: creator(),
            msg: None,
        }))
        .unwrap();

    contract
        .execute(make_request(Action::RevokeAllScarce {
            token_id: tid.clone(),
        }))
        .unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert!(token.approved_account_ids.is_empty());
}

#[test]
fn revoke_all_scarce_not_owner_fails() {
    let mut contract = setup_contract();
    let tid = mint_token_via_execute(&mut contract, &owner());
    testing_env!(context(buyer()).build());

    let err = contract
        .execute(make_request(Action::RevokeAllScarce {
            token_id: tid,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn revoke_all_scarce_token_not_found_fails() {
    let mut contract = setup_contract();
    testing_env!(context(owner()).build());

    let err = contract
        .execute(make_request(Action::RevokeAllScarce {
            token_id: "nope".to_string(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}
