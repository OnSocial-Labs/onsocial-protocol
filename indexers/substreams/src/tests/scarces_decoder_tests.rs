use crate::scarces_decoder::decode_scarces_event;

// ─── Event Type Filtering ───────────────────────────────────────────

#[test]
fn test_decode_ignores_non_onsocial() {
    let json = r#"{"standard":"nep171","version":"1.0.0","event":"nft_mint","data":[{}]}"#;
    assert!(decode_scarces_event(json, "r", 1, 1, 0).is_none());
}

#[test]
fn test_decode_preserves_unknown_event_type() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"UNKNOWN_UPDATE","data":[{"operation":"test","author":"a"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0);
    assert!(
        event.is_some(),
        "Unknown events should be preserved, not dropped"
    );
    let e = event.unwrap();
    assert_eq!(e.event_type, "UNKNOWN_UPDATE");
    assert_eq!(e.operation, "test");
    assert!(!e.extra_data.is_empty());
}

#[test]
fn test_decode_malformed_json() {
    assert!(decode_scarces_event("not json", "r", 1, 1, 0).is_none());
}

#[test]
fn test_decode_empty_data_array() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[]}"#;
    assert!(decode_scarces_event(json, "r", 1, 1, 0).is_none());
}

// ─── Event ID Format ───────────────────────────────────────────────

#[test]
fn test_event_id_format() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"list","author":"alice.near","owner_id":"alice.near"}]}"#;
    let event = decode_scarces_event(json, "receipt_ABC", 500, 9000, 3).unwrap();
    assert_eq!(event.id, "receipt_ABC-3-SCARCE_UPDATE-list");
    assert_eq!(event.block_height, 500);
    assert_eq!(event.block_timestamp, 9000);
    assert_eq!(event.receipt_id, "receipt_ABC");
}

// ─── All 7 Event Types ────────────────────────────────────────────

#[test]
fn test_decode_all_7_event_types() {
    let types = [
        "SCARCE_UPDATE",
        "COLLECTION_UPDATE",
        "LAZY_LISTING_UPDATE",
        "CONTRACT_UPDATE",
        "OFFER_UPDATE",
        "STORAGE_UPDATE",
        "APP_POOL_UPDATE",
    ];
    for event_type in types {
        let json = format!(
            r#"{{"standard":"onsocial","version":"1.0.0","event":"{}","data":[{{"operation":"test","author":"a"}}]}}"#,
            event_type
        );
        let event = decode_scarces_event(&json, "r", 1, 1, 0);
        assert!(event.is_some(), "Failed to decode: {}", event_type);
        assert_eq!(event.unwrap().event_type, event_type);
    }
}

// ─── SCARCE_UPDATE operations ──────────────────────────────────────

#[test]
fn test_decode_scarce_list() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"list","author":"alice.near","owner_id":"alice.near","scarce_contract_id":"nft.example.near","token_ids":["t1","t2"],"prices":["1000000000000000000000000","2000000000000000000000000"]}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.operation, "list");
    assert_eq!(event.owner_id, "alice.near");
    assert_eq!(event.scarce_contract_id, "nft.example.near");
    assert!(event.token_ids.contains("t1"));
    assert!(event.prices.contains("1000000000000000000000000"));
}

#[test]
fn test_decode_scarce_purchase() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"purchase","author":"buyer.near","buyer_id":"buyer.near","seller_id":"seller.near","scarce_contract_id":"nft.example.near","token_id":"t1","price":"5000000000000000000000000","marketplace_fee":"250000000000000000000000","app_pool_amount":"100000000000000000000000"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.operation, "purchase");
    assert_eq!(event.buyer_id, "buyer.near");
    assert_eq!(event.seller_id, "seller.near");
    assert_eq!(event.token_id, "t1");
    assert_eq!(event.price, "5000000000000000000000000");
    assert_eq!(event.marketplace_fee, "250000000000000000000000");
    assert_eq!(event.app_pool_amount, "100000000000000000000000");
}

#[test]
fn test_decode_scarce_auction_created() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"auction_created","author":"alice.near","owner_id":"alice.near","token_id":"t1","reserve_price":"1000","buy_now_price":"5000","expires_at":1700000000000000000,"min_bid_increment":"100","anti_snipe_extension_ns":300000000000}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.operation, "auction_created");
    assert_eq!(event.reserve_price, "1000");
    assert_eq!(event.buy_now_price, "5000");
    assert_eq!(event.min_bid_increment, "100");
    assert_eq!(event.anti_snipe_extension_ns, 300000000000);
}

#[test]
fn test_decode_scarce_auction_bid() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"auction_bid","author":"bob.near","bidder":"bob.near","token_id":"t1","bid_amount":"2000","bid_count":3,"new_expires_at":1700000000000000000}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.bidder, "bob.near");
    assert_eq!(event.bid_amount, "2000");
    assert_eq!(event.bid_count, 3);
    assert_eq!(event.new_expires_at, 1700000000000000000);
}

// ─── COLLECTION_UPDATE operations ──────────────────────────────────

#[test]
fn test_decode_collection_create() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"COLLECTION_UPDATE","data":[{"operation":"create","author":"creator.near","creator_id":"creator.near","collection_id":"col-1","total_supply":100,"price_near":"1000000000000000000000000"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "COLLECTION_UPDATE");
    assert_eq!(event.operation, "create");
    assert_eq!(event.creator_id, "creator.near");
    assert_eq!(event.collection_id, "col-1");
    assert_eq!(event.total_supply, 100);
    assert_eq!(event.price, "1000000000000000000000000");
}

#[test]
fn test_decode_collection_purchase() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"COLLECTION_UPDATE","data":[{"operation":"purchase","author":"buyer.near","buyer_id":"buyer.near","creator_id":"creator.near","collection_id":"col-1","quantity":2,"total_price":"2000","marketplace_fee":"100","app_pool_amount":"50","app_commission":"25","token_ids":["t1","t2"]}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.quantity, 2);
    assert_eq!(event.app_commission, "25");
    assert!(event.token_ids.contains("t1"));
}

// ─── LAZY_LISTING_UPDATE operations ────────────────────────────────

#[test]
fn test_decode_lazy_listing_created() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"LAZY_LISTING_UPDATE","data":[{"operation":"created","author":"creator.near","creator_id":"creator.near","listing_id":"ll-1","price":"3000"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "LAZY_LISTING_UPDATE");
    assert_eq!(event.operation, "created");
    assert_eq!(event.listing_id, "ll-1");
    assert_eq!(event.price, "3000");
}

#[test]
fn test_decode_lazy_listing_purchased() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"LAZY_LISTING_UPDATE","data":[{"operation":"purchased","author":"buyer.near","buyer_id":"buyer.near","creator_id":"creator.near","listing_id":"ll-1","token_id":"t1","price":"3000","creator_payment":"2800","marketplace_fee":"100","app_pool_amount":"50","app_commission":"50"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.creator_payment, "2800");
    assert_eq!(event.token_id, "t1");
}

// ─── OFFER_UPDATE operations ───────────────────────────────────────

#[test]
fn test_decode_offer_made() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"OFFER_UPDATE","data":[{"operation":"offer_made","author":"bob.near","buyer_id":"bob.near","token_id":"t1","amount":"5000","expires_at":1700000000000000000}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "OFFER_UPDATE");
    assert_eq!(event.operation, "offer_made");
    assert_eq!(event.amount, "5000");
    assert_eq!(event.expires_at, 1700000000000000000);
}

#[test]
fn test_decode_offer_accepted() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"OFFER_UPDATE","data":[{"operation":"offer_accepted","author":"seller.near","buyer_id":"bob.near","seller_id":"seller.near","token_id":"t1","amount":"5000","marketplace_fee":"250","app_pool_amount":"100"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.buyer_id, "bob.near");
    assert_eq!(event.seller_id, "seller.near");
    assert_eq!(event.marketplace_fee, "250");
}

// ─── CONTRACT_UPDATE operations ────────────────────────────────────

#[test]
fn test_decode_contract_upgrade() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPDATE","data":[{"operation":"contract_upgrade","author":"owner.near","old_version":"0.1.0","new_version":"0.2.0"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.old_version, "0.1.0");
    assert_eq!(event.new_version, "0.2.0");
}

#[test]
fn test_decode_fee_config_updated() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPDATE","data":[{"operation":"fee_config_updated","author":"owner.near","total_fee_bps":500,"app_pool_fee_bps":100,"platform_storage_fee_bps":50}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.total_fee_bps, 500);
    assert_eq!(event.app_pool_fee_bps, 100);
    assert_eq!(event.platform_storage_fee_bps, 50);
}

// ─── STORAGE_UPDATE operations ─────────────────────────────────────

#[test]
fn test_decode_storage_deposit() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_UPDATE","data":[{"operation":"storage_deposit","author":"alice.near","account_id":"alice.near","deposit":"5000000000000000000000","new_balance":"10000000000000000000000"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "STORAGE_UPDATE");
    assert_eq!(event.deposit, "5000000000000000000000");
    assert_eq!(event.new_balance, "10000000000000000000000");
}

// ─── APP_POOL_UPDATE operations ────────────────────────────────────

#[test]
fn test_decode_app_pool_register() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"APP_POOL_UPDATE","data":[{"operation":"register","author":"owner.near","owner_id":"owner.near","app_id":"my_app","initial_balance":"0"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "APP_POOL_UPDATE");
    assert_eq!(event.app_id, "my_app");
    assert_eq!(event.initial_balance, "0");
}

#[test]
fn test_decode_app_pool_fund() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"APP_POOL_UPDATE","data":[{"operation":"fund","author":"funder.near","funder":"funder.near","app_id":"my_app","amount":"10000","new_balance":"10000"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.funder, "funder.near");
    assert_eq!(event.amount, "10000");
}

// ─── Helper function edge cases ────────────────────────────────────

#[test]
fn test_str_field_any_fallback() {
    // price_near should fall through to the "price" field via str_field_any
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"COLLECTION_UPDATE","data":[{"operation":"create","author":"a","price_near":"999"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.price, "999");
}

#[test]
fn test_extra_data_preserves_full_json() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"list","author":"a","custom_field":"preserved"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert!(event.extra_data.contains("custom_field"));
    assert!(event.extra_data.contains("preserved"));
}

#[test]
fn test_missing_fields_default_empty() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"list","author":"a"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.token_id, "");
    assert_eq!(event.amount, "");
    assert_eq!(event.quantity, 0);
    assert_eq!(event.expires_at, 0);
}

#[test]
fn test_numeric_string_coercion() {
    // u32_field should parse string numbers too
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"COLLECTION_UPDATE","data":[{"operation":"create","author":"a","total_supply":"50"}]}"#;
    let event = decode_scarces_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.total_supply, 50);
}
