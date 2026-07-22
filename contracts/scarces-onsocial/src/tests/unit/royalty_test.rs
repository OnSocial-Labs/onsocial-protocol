use crate::tests::test_utils::*;
use crate::*;
use near_sdk::testing_env;
use std::collections::HashMap;

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
    assert_eq!(
        *result
            .get(&"artist.near".parse::<AccountId>().unwrap())
            .unwrap(),
        500
    );
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
    assert_eq!(
        *result
            .get(&"band.near".parse::<AccountId>().unwrap())
            .unwrap(),
        1000
    );
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
    assert_eq!(
        *result
            .get(&"platform.near".parse::<AccountId>().unwrap())
            .unwrap(),
        200
    );
    assert_eq!(
        *result
            .get(&"creator.near".parse::<AccountId>().unwrap())
            .unwrap(),
        300
    );
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
    assert_eq!(*result.get(&shared).unwrap(), 500);
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
    creator_royalty.insert("b.near".parse::<AccountId>().unwrap(), 2_500u32);

    let result = contract
        .merge_royalties(Some(&app), Some(creator_royalty))
        .unwrap()
        .unwrap();
    let total: u32 = result.values().sum();
    assert_eq!(total, MAX_ROYALTY_BPS);
}

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

    let payout = contract
        .compute_payout(&token, &seller, 1_000_000, Some(10))
        .unwrap();
    assert_eq!(payout.payout.len(), 1);
    assert_eq!(payout.payout.get(&seller).unwrap().0, 1_000_000);
}

#[test]
fn payout_single_royalty_recipient() {
    let contract = new_contract();
    let seller: AccountId = "seller.near".parse().unwrap();
    let recipient: AccountId = "artist.near".parse().unwrap();

    let mut royalty = HashMap::new();
    royalty.insert(recipient.clone(), 1000u32);

    let token = make_token(Some(royalty));
    let balance: u128 = 10_000;
    let payout = contract
        .compute_payout(&token, &seller, balance, Some(10))
        .unwrap();

    let royalty_amt = balance * 1000 / 10_000;
    assert_eq!(payout.payout.get(&recipient).unwrap().0, royalty_amt);
    assert_eq!(payout.payout.get(&seller).unwrap().0, balance - royalty_amt);
}

#[test]
fn payout_seller_is_also_royalty_recipient() {
    let contract = new_contract();
    let seller: AccountId = "seller.near".parse().unwrap();

    let mut royalty = HashMap::new();
    royalty.insert(seller.clone(), 500u32);

    let token = make_token(Some(royalty));
    let balance: u128 = 10_000;
    let payout = contract
        .compute_payout(&token, &seller, balance, Some(10))
        .unwrap();

    let royalty_amt = balance * 500 / 10_000;
    let remainder = balance - royalty_amt;
    assert_eq!(
        payout.payout.get(&seller).unwrap().0,
        royalty_amt + remainder
    );
}

#[test]
fn payout_too_many_recipients_fails() {
    let contract = new_contract();
    let seller: AccountId = "seller.near".parse().unwrap();

    let mut royalty = HashMap::new();
    for i in 0..3 {
        royalty.insert(format!("r{}.near", i).parse::<AccountId>().unwrap(), 100u32);
    }

    let token = make_token(Some(royalty));
    let result = contract.compute_payout(&token, &seller, 10_000, Some(3));
    assert!(matches!(result, Err(MarketplaceError::InvalidInput(_))));
}

#[test]
fn payout_zero_balance() {
    let contract = new_contract();
    let seller: AccountId = "seller.near".parse().unwrap();
    let token = make_token(None);

    let payout = contract
        .compute_payout(&token, &seller, 0, Some(10))
        .unwrap();
    let total: u128 = payout.payout.values().map(|v| v.0).sum();
    assert_eq!(total, 0);
}

#[test]
fn payout_large_balance_does_not_overflow() {
    let contract = new_contract();
    let seller: AccountId = "seller.near".parse().unwrap();
    let recipient: AccountId = "artist.near".parse().unwrap();

    let mut royalty = HashMap::new();
    royalty.insert(recipient.clone(), 5000u32);

    let token = make_token(Some(royalty));
    let payout = contract
        .compute_payout(&token, &seller, u128::MAX, Some(10))
        .unwrap();
    let total = Contract::payout_total(&payout).unwrap();

    assert_eq!(total, u128::MAX);
    assert!(payout.payout.get(&recipient).unwrap().0 > 0);
    assert!(payout.payout.get(&seller).unwrap().0 > 0);
}

#[test]
fn settle_secondary_emits_royalty_paid() {
    use near_sdk::test_utils::get_logs;

    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    let seller: AccountId = "seller.near".parse().unwrap();
    let buyer: AccountId = "buyer.near".parse().unwrap();
    let mut royalty = HashMap::new();
    royalty.insert(creator(), 1000u32);

    let mut token = make_token(Some(royalty));
    token.owner_id = seller.clone();
    contract.scarces_by_id.insert("s:1".into(), token);

    let sale_price: u128 = 1_000_000_000_000_000_000_000_000; // 1 NEAR
    let _ = contract
        .settle_secondary_sale("s:1", sale_price, &seller, &buyer)
        .unwrap();

    let fee = sale_price * (DEFAULT_TOTAL_FEE_BPS as u128) / 10_000;
    let after_fee = sale_price - fee;
    let expected_royalty = after_fee * 1000 / 10_000;

    let logs = get_logs();
    let royalty_log = logs
        .iter()
        .find(|l| l.contains("royalty_paid"))
        .expect("expected royalty_paid event");
    let json = royalty_log
        .strip_prefix("EVENT_JSON:")
        .expect("EVENT_JSON prefix");
    assert!(json.contains("\"operation\":\"royalty_paid\""));
    assert!(json.contains(&format!("\"creator_payment\":\"{expected_royalty}\"")));
    assert!(json.contains(&format!("\"creator_id\":\"{}\"", creator())));
    assert!(
        !json.contains(&format!("\"creator_payment\":\"{after_fee}\"")),
        "royalty_paid must be royalty-only, not seller residual"
    );
}

#[test]
fn settle_secondary_creator_seller_still_emits_royalty_only() {
    use near_sdk::test_utils::get_logs;

    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    let buyer: AccountId = "buyer.near".parse().unwrap();
    let mut royalty = HashMap::new();
    royalty.insert(creator(), 1000u32);

    let mut token = make_token(Some(royalty));
    token.owner_id = creator();
    contract.scarces_by_id.insert("s:2".into(), token);

    let sale_price: u128 = 1_000_000_000_000_000_000_000_000;
    let _ = contract
        .settle_secondary_sale("s:2", sale_price, &creator(), &buyer)
        .unwrap();

    let fee = sale_price * (DEFAULT_TOTAL_FEE_BPS as u128) / 10_000;
    let after_fee = sale_price - fee;
    let expected_royalty = after_fee * 1000 / 10_000;

    let logs = get_logs();
    let royalty_log = logs
        .iter()
        .find(|l| l.contains("royalty_paid"))
        .expect("expected royalty_paid event");
    assert!(royalty_log.contains(&format!("\"creator_payment\":\"{expected_royalty}\"")));
}
