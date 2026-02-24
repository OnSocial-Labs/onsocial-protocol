use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract() -> Contract {
    new_contract()
}

fn make_standalone_token(contract: &mut Contract, owner_account: &AccountId) -> String {
    testing_env!(context(owner_account.clone()).build());
    let metadata = TokenMetadata {
        title: Some("Standalone".into()),
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

fn list_and_setup_auction(contract: &mut Contract, seller: &AccountId) -> String {
    let tid = make_standalone_token(contract, seller);
    testing_env!(context(seller.clone()).build());
    contract
        .execute(make_request(Action::ListNativeScarceAuction {
            token_id: tid.clone(),
            params: AuctionListing {
                reserve_price: U128(1_000),
                min_bid_increment: U128(100),
                expires_at: None,
                auction_duration_ns: Some(60_000_000_000), // 60s
                anti_snipe_extension_ns: 0,
                buy_now_price: None,
            },
        }))
        .unwrap();
    tid
}

// ─── SettleAuction ──────────────────────────────────────────────────────────

#[test]
fn settle_auction_after_expiry_happy() {
    let mut contract = setup_contract();
    let tid = list_and_setup_auction(&mut contract, &owner());

    // Place a bid to start the timer (payment action needs deposit)
    testing_env!(context_with_deposit(buyer(), 1_000).build());
    contract
        .execute(make_request(Action::PlaceBid {
            token_id: tid.clone(),
            amount: U128(1_000),
        }))
        .unwrap();

    // Advance time past auction end
    testing_env!(
        context_with_deposit(buyer(), 0)
            .block_timestamp(1_700_000_000_000_000_000 + 120_000_000_000) // well past 60s
            .build()
    );

    contract
        .execute(make_request(Action::SettleAuction {
            token_id: tid.clone(),
        }))
        .unwrap();

    // Sale should be removed
    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    assert!(!contract.sales.contains_key(&sale_id));
    // Token transferred to buyer
    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.owner_id, buyer());
}

#[test]
fn settle_auction_before_expiry_fails() {
    let mut contract = setup_contract();
    let tid = list_and_setup_auction(&mut contract, &owner());

    // Place bid to start timer
    testing_env!(context_with_deposit(buyer(), 1_000).build());
    contract
        .execute(make_request(Action::PlaceBid {
            token_id: tid.clone(),
            amount: U128(1_000),
        }))
        .unwrap();

    // Don't advance time → still active
    let err = contract
        .execute(make_request(Action::SettleAuction {
            token_id: tid.clone(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn settle_auction_no_bids_fails() {
    let mut contract = setup_contract();
    let tid = list_and_setup_auction(&mut contract, &owner());

    // Foundation-style: no bids → no expiry → can't settle
    testing_env!(context(owner()).build());
    let err = contract
        .execute(make_request(Action::SettleAuction {
            token_id: tid.clone(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// ─── DelistScarce (external NFT delisting) ──────────────────────────────────

#[test]
fn delist_scarce_not_found_fails() {
    let contract_id: AccountId = "marketplace.near".parse().unwrap();
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let err = contract
        .execute(make_request(Action::DelistScarce {
            scarce_contract_id: contract_id,
            token_id: "nonexistent".to_string(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn delist_scarce_wrong_owner_fails() {
    let mut contract = setup_contract();
    let tid = make_standalone_token(&mut contract, &owner());
    testing_env!(context(owner()).build());
    contract
        .execute(make_request(Action::ListNativeScarce {
            token_id: tid.clone(),
            price: U128(1_000),
            expires_at: None,
        }))
        .unwrap();

    let contract_id: AccountId = "marketplace.near".parse().unwrap();
    testing_env!(context_with_deposit(buyer(), 1).build());
    let err = contract
        .execute(make_request(Action::DelistScarce {
            scarce_contract_id: contract_id,
            token_id: tid,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn delist_scarce_happy() {
    let mut contract = setup_contract();
    let tid = make_standalone_token(&mut contract, &owner());
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::ListNativeScarce {
            token_id: tid.clone(),
            price: U128(1_000),
            expires_at: None,
        }))
        .unwrap();

    let contract_id: AccountId = "marketplace.near".parse().unwrap();
    contract
        .execute(make_request(Action::DelistScarce {
            scarce_contract_id: contract_id.clone(),
            token_id: tid.clone(),
        }))
        .unwrap();

    let sale_id = Contract::make_sale_id(&contract_id, &tid);
    assert!(!contract.sales.contains_key(&sale_id));
}
