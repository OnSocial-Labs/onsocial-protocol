use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;
use std::collections::HashMap;

// --- Helpers ---

fn setup_contract() -> Contract {
    new_contract()
}

fn default_metadata() -> scarce::types::TokenMetadata {
    scarce::types::TokenMetadata {
        title: Some("Payout Test".into()),
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
    }
}

fn quick_mint(contract: &mut Contract, minter: &AccountId) -> String {
    testing_env!(context(minter.clone()).build());
    let action = Action::QuickMint {
        metadata: default_metadata(),
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
    };
    contract
        .execute(make_request(action))
        .unwrap()
        .as_str()
        .unwrap()
        .to_string()
}

fn quick_mint_with_royalty(
    contract: &mut Contract,
    minter: &AccountId,
    royalty: HashMap<AccountId, u32>,
) -> String {
    testing_env!(context(minter.clone()).build());
    let action = Action::QuickMint {
        metadata: default_metadata(),
        options: scarce::types::ScarceOptions {
            royalty: Some(royalty),
            app_id: None,
            transferable: true,
            burnable: true,
        },
    };
    contract
        .execute(make_request(action))
        .unwrap()
        .as_str()
        .unwrap()
        .to_string()
}

// --- nft_payout ---

#[test]
fn nft_payout_no_royalty() {
    let mut contract = setup_contract();
    let token_id = quick_mint(&mut contract, &buyer());

    testing_env!(context(owner()).build());
    let payout = contract
        .nft_payout(token_id, U128(1_000_000), None)
        .unwrap();

    // All goes to owner when no royalty
    assert_eq!(payout.payout.len(), 1);
    assert_eq!(payout.payout[&buyer()].0, 1_000_000);
}

#[test]
fn nft_payout_with_royalty() {
    let mut contract = setup_contract();
    let mut royalty = HashMap::new();
    royalty.insert(creator(), 1000); // 10%
    let token_id = quick_mint_with_royalty(&mut contract, &buyer(), royalty);

    testing_env!(context(owner()).build());
    let payout = contract.nft_payout(token_id, U128(10_000), None).unwrap();

    // Creator gets 10%, buyer (owner) gets 90%
    assert_eq!(payout.payout[&creator()].0, 1_000);
    assert_eq!(payout.payout[&buyer()].0, 9_000);
}

#[test]
fn nft_payout_token_not_found() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());

    let result = contract.nft_payout("nonexistent".into(), U128(100), None);
    assert!(matches!(result, Err(MarketplaceError::NotFound(_))));
}

#[test]
fn nft_payout_max_len_respected() {
    let mut contract = setup_contract();
    let mut royalty = HashMap::new();
    royalty.insert(creator(), 500);
    royalty.insert(owner(), 500);
    let token_id = quick_mint_with_royalty(&mut contract, &buyer(), royalty);

    testing_env!(context(owner()).build());
    // max_len_payout = Some(10) should succeed
    let payout = contract
        .nft_payout(token_id, U128(10_000), Some(10))
        .unwrap();
    assert!(payout.payout.len() <= 10);
}

// --- nft_transfer_payout ---

#[test]
fn nft_transfer_payout_happy() {
    let mut contract = setup_contract();
    let token_id = quick_mint(&mut contract, &buyer());

    // Must be called by owner with 1 yocto
    testing_env!(context_with_deposit(buyer(), 1).build());
    let payout = contract
        .nft_transfer_payout(creator(), token_id.clone(), None, None, U128(1_000), None)
        .unwrap();

    assert_eq!(payout.payout.len(), 1);
    assert_eq!(payout.payout[&buyer()].0, 1_000);

    // Token should now be owned by creator
    let token = contract.nft_token(token_id).unwrap();
    assert_eq!(token.owner_id, creator());
}

#[test]
fn nft_transfer_payout_no_yocto_fails() {
    let mut contract = setup_contract();
    let token_id = quick_mint(&mut contract, &buyer());

    testing_env!(context(buyer()).build());
    let result = contract.nft_transfer_payout(creator(), token_id, None, None, U128(1_000), None);
    assert!(matches!(
        result,
        Err(MarketplaceError::InsufficientDeposit(_))
    ));
}

#[test]
fn nft_transfer_payout_wrong_owner_fails() {
    let mut contract = setup_contract();
    let token_id = quick_mint(&mut contract, &buyer());

    testing_env!(context_with_deposit(creator(), 1).build());
    let result = contract.nft_transfer_payout(owner(), token_id, None, None, U128(1_000), None);
    assert!(matches!(result, Err(MarketplaceError::Unauthorized(_))));
}

#[test]
fn nft_transfer_payout_not_found_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let result = contract.nft_transfer_payout(
        creator(),
        "bad_id".to_string(),
        None,
        None,
        U128(1_000),
        None,
    );
    assert!(matches!(result, Err(MarketplaceError::NotFound(_))));
}
