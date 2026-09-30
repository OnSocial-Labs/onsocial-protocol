use crate::dollar::parse_pyth_price;
use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::test_utils::get_created_receipts;
use near_sdk::{testing_env, AccountId, PromiseResult};
use std::collections::HashMap;

const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const ONE_DOLLAR_E6: u128 = 1_000_000;
const PYTH_ONE_DOLLAR: u128 = 100_000_000;
const PRICE_ID: &str = "c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750";

fn seller() -> AccountId {
    creator()
}

fn purchaser() -> AccountId {
    buyer()
}

fn royalty_account() -> AccountId {
    near_sdk::test_utils::accounts(3)
}

fn pyth_account() -> AccountId {
    "pyth.test.near".parse().unwrap()
}

fn metadata(title: &str) -> TokenMetadata {
    TokenMetadata {
        title: Some(title.into()),
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

fn options(royalty: Option<HashMap<AccountId, u32>>) -> ScarceOptions {
    ScarceOptions {
        royalty,
        app_id: None,
        transferable: true,
        burnable: true,
    }
}

fn mint(contract: &mut Contract, owner_account: &AccountId, royalty_bps: Option<u32>) -> String {
    testing_env!(context(owner_account.clone()).build());
    let royalty = royalty_bps.map(|bps| {
        let mut map = HashMap::new();
        map.insert(royalty_account(), bps);
        map
    });
    contract
        .quick_mint(owner_account, metadata("Dollar"), options(royalty))
        .unwrap()
}

fn list_dollars(
    contract: &mut Contract,
    owner_account: &AccountId,
    token_id: &str,
    min_near: u128,
) {
    testing_env!(context(owner_account.clone()).build());
    contract
        .execute(make_request(Action::ListNativeScarce {
            token_id: token_id.to_string(),
            price: U128(1),
            expires_at: None,
            usd_e6: Some(U128(ONE_DOLLAR_E6)),
            min_near: Some(U128(min_near)),
        }))
        .unwrap();
}

fn set_oracle(contract: &mut Contract) {
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .set_dollar_oracle(pyth_account(), PRICE_ID.into(), 3_600, 100)
        .unwrap();
}

fn pyth_json(price: u128, conf: u128) -> String {
    format!(r#"{{"price":"{price}","conf":"{conf}","expo":-8,"publish_time":1}}"#)
}

fn settle_with_price(
    contract: &mut Contract,
    token_id: &str,
    price_json: &str,
    max_near: u128,
    payment: u128,
) {
    testing_env!(
        context(purchaser()).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        HashMap::new(),
        vec![PromiseResult::Successful(price_json.as_bytes().to_vec())],
    );
    contract.dollar_settle(
        purchaser(),
        DOLLAR_SCOPE_SALE.into(),
        token_id.to_string(),
        1,
        U128(max_near),
        U128(payment),
    );
}

fn purchase_err(result: Result<near_sdk::Promise, MarketplaceError>) -> String {
    match result {
        Ok(_) => panic!("expected the purchase to be refused"),
        Err(err) => err.to_string(),
    }
}

fn transferred_to(account: &AccountId) -> u128 {
    get_created_receipts()
        .into_iter()
        .filter(|receipt| &receipt.receiver_id == account)
        .flat_map(|receipt| receipt.actions)
        .filter_map(|action| match action {
            near_sdk::mock::MockAction::Transfer { deposit, .. } => Some(deposit.as_yoctonear()),
            _ => None,
        })
        .sum()
}

fn collection(id: &str, start_price: Option<u128>, royalty_bps: Option<u32>) -> CollectionConfig {
    let royalty = royalty_bps.map(|bps| {
        let mut map = HashMap::new();
        map.insert(royalty_account(), bps);
        map
    });
    CollectionConfig {
        collection_id: id.to_string(),
        total_supply: 10,
        metadata_template: r#"{"title":"Drop"}"#.to_string(),
        price_near: U128(1),
        start_time: None,
        end_time: None,
        options: options(royalty),
        renewable: false,
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: start_price.map(U128),
        allowlist_price: None,
        max_per_purchase: None,
        random_assignment: false,
    }
}

#[test]
fn owner_stores_the_pyth_feed() {
    let mut contract = new_contract();
    set_oracle(&mut contract);

    let oracle = contract.get_dollar_oracle().unwrap();
    assert_eq!(oracle.pyth_contract, pyth_account());
    assert_eq!(oracle.price_id, PRICE_ID);
    assert_eq!(oracle.max_age_seconds, 3_600);
    assert_eq!(oracle.max_conf_bps, 100);
}

#[test]
fn oracle_rejects_a_bad_feed() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let err = contract
        .set_dollar_oracle(pyth_account(), "abcd".into(), 60, 100)
        .unwrap_err();
    assert!(err.to_string().contains("32 bytes"));

    let err = contract
        .set_dollar_oracle(pyth_account(), PRICE_ID.into(), 0, 100)
        .unwrap_err();
    assert!(err.to_string().contains("1 hour"));

    let err = contract
        .set_dollar_oracle(pyth_account(), PRICE_ID.into(), 60, 0)
        .unwrap_err();
    assert!(err.to_string().contains("1000 bps"));

    testing_env!(context_with_deposit(seller(), 1).build());
    let err = contract
        .set_dollar_oracle(pyth_account(), PRICE_ID.into(), 60, 100)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));

    testing_env!(context(owner()).build());
    let err = contract
        .set_dollar_oracle(pyth_account(), PRICE_ID.into(), 60, 100)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

#[test]
fn dollar_list_stores_the_sticker_and_a_one_yocto_floor() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), None);
    list_dollars(&mut contract, &seller(), &token_id, 0);

    let sticker = contract
        .get_dollar_price(DOLLAR_SCOPE_SALE.into(), token_id.clone())
        .unwrap();
    assert_eq!(sticker.usd_e6.0, ONE_DOLLAR_E6);
    assert_eq!(sticker.min_near.0, 0);

    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &token_id);
    assert_eq!(contract.sales.get(&sale_id).unwrap().sale_conditions.0, 1);
}

#[test]
fn near_purchase_of_a_dollar_listing_is_refused() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), None);
    list_dollars(&mut contract, &seller(), &token_id, 0);

    testing_env!(context_with_deposit(purchaser(), ONE_NEAR).build());
    let err = contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: token_id.clone(),
        }))
        .unwrap_err();
    assert!(err.to_string().contains("priced in dollars"));
    assert_eq!(contract.nft_token(token_id).unwrap().owner_id, seller());
}

#[test]
fn relisting_in_near_clears_the_sticker() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), None);
    list_dollars(&mut contract, &seller(), &token_id, 0);

    testing_env!(context_with_deposit(seller(), 1).build());
    contract
        .execute(make_request(Action::UpdatePrice {
            scarce_contract_id: "marketplace.near".parse().unwrap(),
            token_id: token_id.clone(),
            price: U128(1_000),
            usd_e6: None,
            min_near: None,
        }))
        .unwrap();

    assert!(contract
        .get_dollar_price(DOLLAR_SCOPE_SALE.into(), token_id.clone())
        .is_none());

    testing_env!(context_with_deposit(purchaser(), 1_000).build());
    contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: token_id.clone(),
        }))
        .unwrap();
    assert_eq!(contract.nft_token(token_id).unwrap().owner_id, purchaser());
}

#[test]
fn delist_clears_the_sticker() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), None);
    list_dollars(&mut contract, &seller(), &token_id, 0);

    testing_env!(context_with_deposit(seller(), 1).build());
    contract
        .execute(make_request(Action::DelistNativeScarce {
            token_id: token_id.clone(),
        }))
        .unwrap();
    assert!(contract
        .get_dollar_price(DOLLAR_SCOPE_SALE.into(), token_id)
        .is_none());
}

#[test]
fn auctions_and_a_zero_sticker_stay_in_near() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), None);
    testing_env!(context(seller()).build());
    contract
        .execute(make_request(Action::ListNativeScarceAuction {
            token_id: token_id.clone(),
            params: AuctionListing {
                reserve_price: U128(1_000),
                min_bid_increment: U128(100),
                expires_at: None,
                auction_duration_ns: Some(60_000_000_000),
                anti_snipe_extension_ns: 0,
                buy_now_price: None,
            },
        }))
        .unwrap();

    testing_env!(context_with_deposit(seller(), 1).build());
    let err = contract
        .execute(make_request(Action::UpdatePrice {
            scarce_contract_id: "marketplace.near".parse().unwrap(),
            token_id: token_id.clone(),
            price: U128(1),
            usd_e6: Some(U128(ONE_DOLLAR_E6)),
            min_near: None,
        }))
        .unwrap_err();
    assert!(err.to_string().contains("Auctions stay priced in NEAR"));

    let mut dutch = collection("dutch", Some(5_000), None);
    dutch.start_time = Some(1_700_000_000_000_000_000);
    dutch.end_time = Some(1_800_000_000_000_000_000);
    contract.create_collection(&seller(), dutch).unwrap();
    testing_env!(context_with_deposit(seller(), 1).build());
    let err = contract
        .execute(make_request(Action::UpdateCollectionPrice {
            collection_id: "dutch".into(),
            new_price_near: U128(1),
            usd_e6: Some(U128(ONE_DOLLAR_E6)),
            min_near: None,
        }))
        .unwrap_err();
    assert!(err.to_string().contains("Dutch auction"));

    let fresh = mint(&mut contract, &seller(), None);
    testing_env!(context(seller()).build());
    let err = contract
        .execute(make_request(Action::ListNativeScarce {
            token_id: fresh,
            price: U128(1),
            expires_at: None,
            usd_e6: Some(U128(0)),
            min_near: None,
        }))
        .unwrap_err();
    assert!(err.to_string().contains("greater than 0"));
}

#[test]
fn purchase_dollar_checks_the_update_and_the_deposit() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), None);
    list_dollars(&mut contract, &seller(), &token_id, 0);
    set_oracle(&mut contract);

    testing_env!(context_with_deposit(purchaser(), ONE_NEAR).build());
    let err = purchase_err(contract.purchase_dollar(
        DOLLAR_SCOPE_SALE.into(),
        token_id.clone(),
        1,
        U128(ONE_NEAR),
        U128(1),
        "zz".into(),
    ));
    assert!(err.contains("price update"));

    let err = purchase_err(contract.purchase_dollar(
        DOLLAR_SCOPE_SALE.into(),
        "missing".into(),
        1,
        U128(ONE_NEAR),
        U128(1),
        "aa".into(),
    ));
    assert!(err.contains("priced in NEAR"));

    let err = purchase_err(contract.purchase_dollar(
        DOLLAR_SCOPE_COLLECTION.into(),
        "col".into(),
        0,
        U128(ONE_NEAR),
        U128(1),
        "aa".into(),
    ));
    assert!(err.contains("Quantity"));

    testing_env!(context_with_deposit(purchaser(), 10).build());
    let err = purchase_err(contract.purchase_dollar(
        DOLLAR_SCOPE_SALE.into(),
        token_id.clone(),
        1,
        U128(ONE_NEAR),
        U128(1),
        "aa".into(),
    ));
    assert!(err.contains("maximum NEAR"));

    testing_env!(context_with_deposit(purchaser(), ONE_NEAR + 1).build());
    assert!(contract
        .purchase_dollar(
            DOLLAR_SCOPE_SALE.into(),
            token_id,
            0,
            U128(ONE_NEAR),
            U128(1),
            "0xAA".into(),
        )
        .is_ok());
}

#[test]
fn settle_charges_the_dollar_price_and_refunds_the_rest() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), Some(1_000));
    list_dollars(&mut contract, &seller(), &token_id, 0);
    set_oracle(&mut contract);

    let unit = Contract::yocto_for_usd(ONE_DOLLAR_E6, PYTH_ONE_DOLLAR, -8).unwrap();
    assert_eq!(unit, ONE_NEAR);
    let max_near = unit * 1_005 / 1_000;
    let payment = max_near + ONE_NEAR;

    settle_with_price(
        &mut contract,
        &token_id,
        &pyth_json(PYTH_ONE_DOLLAR, 1_000),
        max_near,
        payment,
    );

    assert_eq!(
        contract.nft_token(token_id.clone()).unwrap().owner_id,
        purchaser()
    );
    assert!(contract
        .get_dollar_price(DOLLAR_SCOPE_SALE.into(), token_id.clone())
        .is_none());
    assert!(contract.dollar_unit_override.is_none());
    assert_eq!(contract.pending_attached_balance, 0);
    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &token_id);
    assert!(!contract.sales.contains_key(&sale_id));

    let total_fee = unit * (DEFAULT_TOTAL_FEE_BPS as u128) / 10_000;
    let revenue = total_fee - unit * (DEFAULT_PLATFORM_STORAGE_FEE_BPS as u128) / 10_000;
    let after_fee = unit - total_fee;
    let royalty = after_fee * 1_000 / 10_000;
    assert_eq!(transferred_to(&purchaser()), payment - unit);
    assert_eq!(transferred_to(&royalty_account()), royalty);
    assert_eq!(transferred_to(&seller()), after_fee - royalty);
    assert_eq!(transferred_to(&owner()), revenue);
    assert!(royalty > 1);
}

#[test]
fn half_percent_stop_refunds_without_moving_the_scarce() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), None);
    list_dollars(&mut contract, &seller(), &token_id, 0);
    set_oracle(&mut contract);

    let max_near = ONE_NEAR * 1_005 / 1_000;
    let moved = Contract::yocto_for_usd(ONE_DOLLAR_E6, 99_000_000, -8).unwrap();
    assert!(moved > max_near);
    settle_with_price(
        &mut contract,
        &token_id,
        &pyth_json(99_000_000, 1_000),
        max_near,
        max_near,
    );

    assert_eq!(
        contract.nft_token(token_id.clone()).unwrap().owner_id,
        seller()
    );
    assert!(contract
        .get_dollar_price(DOLLAR_SCOPE_SALE.into(), token_id)
        .is_some());
    assert_eq!(transferred_to(&purchaser()), max_near);
}

#[test]
fn seller_minimum_and_a_wide_price_refund() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), None);
    list_dollars(&mut contract, &seller(), &token_id, ONE_NEAR * 2);
    set_oracle(&mut contract);

    settle_with_price(
        &mut contract,
        &token_id,
        &pyth_json(PYTH_ONE_DOLLAR, 1_000),
        ONE_NEAR * 3,
        ONE_NEAR * 3,
    );
    assert_eq!(
        contract.nft_token(token_id.clone()).unwrap().owner_id,
        seller()
    );
    assert_eq!(transferred_to(&purchaser()), ONE_NEAR * 3);

    let wide = mint(&mut contract, &seller(), None);
    list_dollars(&mut contract, &seller(), &wide, 0);
    settle_with_price(
        &mut contract,
        &wide,
        &pyth_json(PYTH_ONE_DOLLAR, 2_000_000),
        ONE_NEAR * 2,
        ONE_NEAR * 2,
    );
    assert_eq!(contract.nft_token(wide.clone()).unwrap().owner_id, seller());
    assert_eq!(transferred_to(&purchaser()), ONE_NEAR * 2);
}

#[test]
fn a_failed_pyth_read_refunds_the_payment() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), None);
    list_dollars(&mut contract, &seller(), &token_id, 0);
    set_oracle(&mut contract);

    testing_env!(
        context(purchaser()).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        HashMap::new(),
        vec![PromiseResult::Failed],
    );
    contract.dollar_settle(
        purchaser(),
        DOLLAR_SCOPE_SALE.into(),
        token_id.clone(),
        1,
        U128(ONE_NEAR),
        U128(ONE_NEAR),
    );
    assert_eq!(contract.nft_token(token_id).unwrap().owner_id, seller());
    assert_eq!(transferred_to(&purchaser()), ONE_NEAR);
}

#[test]
fn collection_mint_keeps_the_sticker_and_skips_royalty() {
    let mut contract = new_contract();
    contract
        .create_collection(&seller(), collection("drop", None, Some(1_000)))
        .unwrap();
    testing_env!(context_with_deposit(seller(), 1).build());
    contract
        .execute(make_request(Action::UpdateCollectionPrice {
            collection_id: "drop".into(),
            new_price_near: U128(1),
            usd_e6: Some(U128(ONE_DOLLAR_E6)),
            min_near: None,
        }))
        .unwrap();
    set_oracle(&mut contract);

    testing_env!(
        context(purchaser()).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        HashMap::new(),
        vec![PromiseResult::Successful(
            pyth_json(PYTH_ONE_DOLLAR, 1_000).into_bytes(),
        )],
    );
    contract.dollar_settle(
        purchaser(),
        DOLLAR_SCOPE_COLLECTION.into(),
        "drop".into(),
        1,
        U128(ONE_NEAR),
        U128(ONE_NEAR),
    );

    assert_eq!(
        contract.nft_token("drop:1".into()).unwrap().owner_id,
        purchaser()
    );
    assert_eq!(contract.collections.get("drop").unwrap().minted_count, 1);
    let sticker = contract
        .get_dollar_price(DOLLAR_SCOPE_COLLECTION.into(), "drop".into())
        .unwrap();
    assert_eq!(sticker.usd_e6.0, ONE_DOLLAR_E6);
    assert_eq!(transferred_to(&royalty_account()), 0);
    let revenue = ONE_NEAR * (DEFAULT_TOTAL_FEE_BPS as u128) / 10_000
        - ONE_NEAR * (DEFAULT_PLATFORM_STORAGE_FEE_BPS as u128) / 10_000;
    assert_eq!(transferred_to(&seller()), ONE_NEAR - revenue);
    assert!(near_sdk::test_utils::get_logs()
        .iter()
        .all(|line| !line.contains("royalty_paid")));
}

#[test]
fn near_purchase_of_a_dollar_collection_is_refused() {
    let mut contract = new_contract();
    contract
        .create_collection(&seller(), collection("drop", None, None))
        .unwrap();
    testing_env!(context_with_deposit(seller(), 1).build());
    contract
        .execute(make_request(Action::UpdateCollectionPrice {
            collection_id: "drop".into(),
            new_price_near: U128(1),
            usd_e6: Some(U128(ONE_DOLLAR_E6)),
            min_near: None,
        }))
        .unwrap();

    testing_env!(context_with_deposit(purchaser(), ONE_NEAR).build());
    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: "drop".into(),
            quantity: 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(err.to_string().contains("priced in dollars"));
    assert_eq!(contract.collections.get("drop").unwrap().minted_count, 0);
}

#[test]
fn lazy_sale_clears_the_sticker_when_sold_out() {
    let mut contract = new_contract();
    testing_env!(context(seller()).build());
    let listing_id = contract
        .execute(make_request(Action::CreateLazyListing {
            params: LazyListing {
                metadata: metadata("Lazy"),
                price: U128(1),
                options: options(None),
                expires_at: None,
                max_per_purchase: 1,
            },
            usd_e6: Some(U128(ONE_DOLLAR_E6)),
            min_near: None,
        }))
        .unwrap()
        .as_str()
        .unwrap()
        .to_string();
    set_oracle(&mut contract);

    testing_env!(context_with_deposit(purchaser(), ONE_NEAR).build());
    let err = contract
        .execute(make_request(Action::PurchaseLazyListing {
            listing_id: listing_id.clone(),
            quantity: 1,
        }))
        .unwrap_err();
    assert!(err.to_string().contains("priced in dollars"));

    testing_env!(
        context(purchaser()).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        HashMap::new(),
        vec![PromiseResult::Successful(
            pyth_json(PYTH_ONE_DOLLAR, 1_000).into_bytes(),
        )],
    );
    contract.dollar_settle(
        purchaser(),
        DOLLAR_SCOPE_LAZY.into(),
        listing_id.clone(),
        1,
        U128(ONE_NEAR),
        U128(ONE_NEAR),
    );

    assert!(contract
        .get_dollar_price(DOLLAR_SCOPE_LAZY.into(), listing_id.clone())
        .is_none());
    assert!(!contract.lazy_listings.contains_key(&listing_id));
    assert_eq!(contract.pending_attached_balance, 0);
    let revenue = ONE_NEAR * (DEFAULT_TOTAL_FEE_BPS as u128) / 10_000
        - ONE_NEAR * (DEFAULT_PLATFORM_STORAGE_FEE_BPS as u128) / 10_000;
    assert_eq!(transferred_to(&seller()), ONE_NEAR - revenue);
}

#[test]
fn dollar_purchase_needs_an_oracle() {
    let mut contract = new_contract();
    let token_id = mint(&mut contract, &seller(), None);
    list_dollars(&mut contract, &seller(), &token_id, 0);

    testing_env!(context_with_deposit(purchaser(), ONE_NEAR + 1).build());
    let err = purchase_err(contract.purchase_dollar(
        DOLLAR_SCOPE_SALE.into(),
        token_id,
        1,
        U128(ONE_NEAR),
        U128(1),
        "aa".into(),
    ));
    assert!(err.contains("not configured"));
}

#[test]
fn parse_pyth_price_rejects_a_missing_or_negative_price() {
    let err = parse_pyth_price(b"null").unwrap_err();
    assert!(err.to_string().contains("too old"));
    let err = parse_pyth_price(br#"{"price":"-1","conf":"1","expo":-8}"#).unwrap_err();
    assert!(err.to_string().contains("positive"));
}
