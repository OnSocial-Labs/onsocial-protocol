use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract() -> Contract {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;
    contract
}

fn default_options() -> scarce::types::ScarceOptions {
    scarce::types::ScarceOptions {
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
    }
}

fn quick_mint_and_list(contract: &mut Contract, seller: &AccountId, price: u128) -> String {
    testing_env!(context(seller.clone()).build());
    let action = Action::QuickMint {
        metadata: scarce::types::TokenMetadata {
            title: Some("Sale".into()),
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
        },
        options: default_options(),
    };
    let token_id = contract
        .execute(make_request(action))
        .unwrap()
        .as_str()
        .unwrap()
        .to_string();

    let list_action = Action::ListNativeScarce {
        token_id: token_id.clone(),
        price: U128(price),
        expires_at: None,
    };
    contract.execute(make_request(list_action)).unwrap();
    token_id
}

// --- get_sale ---

#[test]
fn get_sale_returns_listed() {
    let mut contract = setup_contract();
    let token_id = quick_mint_and_list(&mut contract, &buyer(), 5_000);

    testing_env!(context(owner()).build());
    let contract_id: AccountId = "marketplace.near".parse().unwrap();
    let sale = contract.get_sale(contract_id, token_id);
    assert!(sale.is_some());
    assert_eq!(sale.unwrap().sale_conditions.0, 5_000);
}

#[test]
fn get_sale_returns_none_for_unlisted() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    let contract_id: AccountId = "marketplace.near".parse().unwrap();
    assert!(contract.get_sale(contract_id, "bad".into()).is_none());
}

// --- get_supply_sales ---

#[test]
fn get_supply_sales_increments() {
    let mut contract = setup_contract();
    assert_eq!(contract.get_supply_sales(), 0);

    quick_mint_and_list(&mut contract, &buyer(), 1_000);
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_supply_sales(), 1);

    quick_mint_and_list(&mut contract, &buyer(), 2_000);
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_supply_sales(), 2);
}

// --- get_supply_by_owner_id ---

#[test]
fn get_supply_by_owner_zero() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_supply_by_owner_id(buyer()), 0);
}

#[test]
fn get_supply_by_owner_tracks() {
    let mut contract = setup_contract();
    quick_mint_and_list(&mut contract, &buyer(), 1_000);
    quick_mint_and_list(&mut contract, &buyer(), 2_000);
    quick_mint_and_list(&mut contract, &creator(), 3_000);

    testing_env!(context(owner()).build());
    assert_eq!(contract.get_supply_by_owner_id(buyer()), 2);
    assert_eq!(contract.get_supply_by_owner_id(creator()), 1);
}

// --- get_sales_by_owner_id ---

#[test]
fn get_sales_by_owner_empty() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    let sales = contract.get_sales_by_owner_id(buyer(), None, None);
    assert!(sales.is_empty());
}

#[test]
fn get_sales_by_owner_returns_correct() {
    let mut contract = setup_contract();
    quick_mint_and_list(&mut contract, &buyer(), 1_000);
    quick_mint_and_list(&mut contract, &buyer(), 2_000);

    testing_env!(context(owner()).build());
    let sales = contract.get_sales_by_owner_id(buyer(), None, None);
    assert_eq!(sales.len(), 2);
}

// --- get_sales ---

#[test]
fn get_sales_pagination() {
    let mut contract = setup_contract();
    for _ in 0..5 {
        quick_mint_and_list(&mut contract, &buyer(), 1_000);
    }
    testing_env!(context(owner()).build());

    let page1 = contract.get_sales(None, Some(2));
    assert_eq!(page1.len(), 2);

    let page2 = contract.get_sales(Some(2), Some(10));
    assert_eq!(page2.len(), 3);
}

// --- is_sale_expired ---

#[test]
fn is_sale_expired_none_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    let contract_id: AccountId = "marketplace.near".parse().unwrap();
    assert!(contract.is_sale_expired(contract_id, "bad".into()).is_none());
}

#[test]
fn is_sale_expired_false_for_no_expiry() {
    let mut contract = setup_contract();
    let token_id = quick_mint_and_list(&mut contract, &buyer(), 1_000);

    testing_env!(context(owner()).build());
    let contract_id: AccountId = "marketplace.near".parse().unwrap();
    assert_eq!(contract.is_sale_expired(contract_id, token_id), Some(false));
}

// --- get_expired_sales ---

#[test]
fn get_expired_sales_empty_when_none() {
    let mut contract = setup_contract();
    quick_mint_and_list(&mut contract, &buyer(), 1_000);

    testing_env!(context(owner()).build());
    let expired = contract.get_expired_sales(None, None);
    assert!(expired.is_empty());
}

// --- get_auction / get_auctions ---

#[test]
fn get_auction_none_for_non_auction() {
    let mut contract = setup_contract();
    let token_id = quick_mint_and_list(&mut contract, &buyer(), 1_000);

    testing_env!(context(owner()).build());
    assert!(contract.get_auction(token_id).is_none());
}

#[test]
fn get_auction_returns_auction_data() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    // Quick mint
    let action = Action::QuickMint {
        metadata: scarce::types::TokenMetadata {
            title: Some("Auctionable".into()),
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
        },
        options: default_options(),
    };
    let token_id = contract
        .execute(make_request(action))
        .unwrap()
        .as_str()
        .unwrap()
        .to_string();

    // List as auction
    let auction = AuctionListing {
        reserve_price: U128(1_000),
        min_bid_increment: U128(100),
        expires_at: Some(2_000_000_000_000_000_000), // far future
        auction_duration_ns: None,
        anti_snipe_extension_ns: 0,
        buy_now_price: None,
    };
    let list_action = Action::ListNativeScarceAuction {
        token_id: token_id.clone(),
        params: auction,
    };
    contract.execute(make_request(list_action)).unwrap();

    let view = contract.get_auction(token_id).unwrap();
    assert_eq!(view.reserve_price.0, 1_000);
    assert_eq!(view.min_bid_increment.0, 100);
    assert_eq!(view.bid_count, 0);
    assert!(!view.is_ended);
}

#[test]
fn get_auctions_empty() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    let auctions = contract.get_auctions(None, None);
    assert!(auctions.is_empty());
}
