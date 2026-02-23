use crate::tests::test_utils::*;
use crate::*;
use std::collections::HashMap;

// --- merge_royalties ---

#[test]
fn merge_both_none() {
    let contract = new_contract();
    let result = contract.merge_royalties(None, None).unwrap();
    assert!(result.is_none());
}

#[test]
fn merge_app_only() {
    let mut contract = new_contract();
    let app: AccountId = "app.near".parse().unwrap();

    let mut app_royalty = HashMap::new();
    app_royalty.insert("artist.near".parse::<AccountId>().unwrap(), 500u32);

    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: owner(),
            balance: U128(0),
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: Some(app_royalty.clone()),
            primary_sale_bps: 0,
            moderators: vec![],
            curated: false,
            metadata: None,
        },
    );

    let result = contract.merge_royalties(Some(&app), None).unwrap().unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(*result.get(&"artist.near".parse::<AccountId>().unwrap()).unwrap(), 500);
}

#[test]
fn merge_creator_only() {
    let contract = new_contract();
    let mut creator_royalty = HashMap::new();
    creator_royalty.insert("band.near".parse::<AccountId>().unwrap(), 1000u32);

    let result = contract
        .merge_royalties(None, Some(creator_royalty))
        .unwrap()
        .unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(*result.get(&"band.near".parse::<AccountId>().unwrap()).unwrap(), 1000);
}

#[test]
fn merge_disjoint_accounts() {
    let mut contract = new_contract();
    let app: AccountId = "app.near".parse().unwrap();

    let mut app_royalty = HashMap::new();
    app_royalty.insert("platform.near".parse::<AccountId>().unwrap(), 200u32);

    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: owner(),
            balance: U128(0),
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: Some(app_royalty),
            primary_sale_bps: 0,
            moderators: vec![],
            curated: false,
            metadata: None,
        },
    );

    let mut creator_royalty = HashMap::new();
    creator_royalty.insert("creator.near".parse::<AccountId>().unwrap(), 300u32);

    let result = contract
        .merge_royalties(Some(&app), Some(creator_royalty))
        .unwrap()
        .unwrap();
    assert_eq!(result.len(), 2);
    assert_eq!(*result.get(&"platform.near".parse::<AccountId>().unwrap()).unwrap(), 200);
    assert_eq!(*result.get(&"creator.near".parse::<AccountId>().unwrap()).unwrap(), 300);
}

#[test]
fn merge_shared_account_summed() {
    let mut contract = new_contract();
    let app: AccountId = "app.near".parse().unwrap();
    let shared: AccountId = "shared.near".parse().unwrap();

    let mut app_royalty = HashMap::new();
    app_royalty.insert(shared.clone(), 200u32);

    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: owner(),
            balance: U128(0),
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: Some(app_royalty),
            primary_sale_bps: 0,
            moderators: vec![],
            curated: false,
            metadata: None,
        },
    );

    let mut creator_royalty = HashMap::new();
    creator_royalty.insert(shared.clone(), 300u32);

    let result = contract
        .merge_royalties(Some(&app), Some(creator_royalty))
        .unwrap()
        .unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(*result.get(&shared).unwrap(), 500); // 200 + 300
}

#[test]
fn merge_exceeds_max_royalty_bps_fails() {
    let mut contract = new_contract();
    let app: AccountId = "app.near".parse().unwrap();

    let mut app_royalty = HashMap::new();
    app_royalty.insert("a.near".parse::<AccountId>().unwrap(), 3_000u32);

    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: owner(),
            balance: U128(0),
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: Some(app_royalty),
            primary_sale_bps: 0,
            moderators: vec![],
            curated: false,
            metadata: None,
        },
    );

    let mut creator_royalty = HashMap::new();
    // 3000 + 2001 = 5001 > MAX_ROYALTY_BPS(5000)
    creator_royalty.insert("b.near".parse::<AccountId>().unwrap(), 2_001u32);

    let err = contract
        .merge_royalties(Some(&app), Some(creator_royalty))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn merge_exactly_max_royalty_bps_ok() {
    let mut contract = new_contract();
    let app: AccountId = "app.near".parse().unwrap();

    let mut app_royalty = HashMap::new();
    app_royalty.insert("a.near".parse::<AccountId>().unwrap(), 2_500u32);

    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: owner(),
            balance: U128(0),
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: Some(app_royalty),
            primary_sale_bps: 0,
            moderators: vec![],
            curated: false,
            metadata: None,
        },
    );

    let mut creator_royalty = HashMap::new();
    creator_royalty.insert("b.near".parse::<AccountId>().unwrap(), 2_500u32); // sum = 5000 exactly

    let result = contract
        .merge_royalties(Some(&app), Some(creator_royalty))
        .unwrap()
        .unwrap();
    let total: u32 = result.values().sum();
    assert_eq!(total, MAX_ROYALTY_BPS);
}

// --- compute_payout ---

fn make_token(royalty: Option<HashMap<AccountId, u32>>) -> Scarce {
    Scarce {
        owner_id: buyer(),
        creator_id: creator(),
        minter_id: creator(),
        metadata: scarce::types::TokenMetadata {
            title: Some("Test".into()),
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
        approved_account_ids: HashMap::new(),
        royalty,
        revoked_at: None,
        revocation_memo: None,
        redeemed_at: None,
        redeem_count: 0,
        paid_price: U128(0),
        refunded: false,
        transferable: None,
        burnable: None,
        app_id: None,
    }
}

#[test]
fn payout_no_royalty_all_to_seller() {
    let contract = new_contract();
    let seller: AccountId = "seller.near".parse().unwrap();
    let token = make_token(None);

    let payout = contract.compute_payout(&token, &seller, 1_000_000, 10).unwrap();
    assert_eq!(payout.payout.len(), 1);
    assert_eq!(payout.payout.get(&seller).unwrap().0, 1_000_000);
}

#[test]
fn payout_single_royalty_recipient() {
    let contract = new_contract();
    let seller: AccountId = "seller.near".parse().unwrap();
    let recipient: AccountId = "artist.near".parse().unwrap();

    let mut royalty = HashMap::new();
    royalty.insert(recipient.clone(), 1000u32); // 10%

    let token = make_token(Some(royalty));
    let balance: u128 = 10_000;
    let payout = contract.compute_payout(&token, &seller, balance, 10).unwrap();

    let royalty_amt = balance * 1000 / 10_000; // 1000
    assert_eq!(payout.payout.get(&recipient).unwrap().0, royalty_amt);
    // seller gets remainder
    assert_eq!(payout.payout.get(&seller).unwrap().0, balance - royalty_amt);
}

#[test]
fn payout_seller_is_also_royalty_recipient() {
    let contract = new_contract();
    let seller: AccountId = "seller.near".parse().unwrap();

    let mut royalty = HashMap::new();
    royalty.insert(seller.clone(), 500u32); // 5%

    let token = make_token(Some(royalty));
    let balance: u128 = 10_000;
    let payout = contract.compute_payout(&token, &seller, balance, 10).unwrap();

    // Seller's royalty share + remainder combined into one entry
    let royalty_amt = balance * 500 / 10_000; // 500
    let remainder = balance - royalty_amt; // 9500
    assert_eq!(payout.payout.get(&seller).unwrap().0, royalty_amt + remainder);
}

#[test]
fn payout_too_many_recipients_fails() {
    let contract = new_contract();
    let seller: AccountId = "seller.near".parse().unwrap();

    let mut royalty = HashMap::new();
    // max_len = 3 but we'll have 3 royalty recipients + 1 owner = 4 > max_len
    for i in 0..3 {
        royalty.insert(format!("r{}.near", i).parse::<AccountId>().unwrap(), 100u32);
    }

    let token = make_token(Some(royalty));
    let result = contract
        .compute_payout(&token, &seller, 10_000, 3);
    assert!(matches!(result, Err(MarketplaceError::InvalidInput(_))));
}

#[test]
fn payout_zero_balance() {
    let contract = new_contract();
    let seller: AccountId = "seller.near".parse().unwrap();
    let token = make_token(None);

    let payout = contract.compute_payout(&token, &seller, 0, 10).unwrap();
    // 0 balance → empty or trivial payout
    let total: u128 = payout.payout.values().map(|v| v.0).sum();
    assert_eq!(total, 0);
}
