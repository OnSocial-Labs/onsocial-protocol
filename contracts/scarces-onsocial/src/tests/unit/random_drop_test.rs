//! Random-assignment drops — each mint draws a uniformly random unminted
//! seat, so rare variations cannot be sniped by timing a purchase.

use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;
use std::collections::BTreeSet;

const RANDOM_TEMPLATE: &str =
    r#"{"title":"Punk #{seat_number}","media":"ipfs://bafydir/{seat_number}.png","copies":1}"#;

fn random_config(collection_id: &str, total_supply: u32) -> CollectionConfig {
    CollectionConfig {
        collection_id: collection_id.to_string(),
        total_supply,
        metadata_template: RANDOM_TEMPLATE.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        renewable: false,
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
        max_per_purchase: None,
        random_assignment: true,
    }
}

fn purchase(contract: &mut Contract, account: AccountId, collection_id: &str, quantity: u32) {
    testing_env!(context_with_deposit(account, 0).build());
    contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: collection_id.to_string(),
            quantity,
            max_price_per_token: U128(0),
        }))
        .unwrap();
}

fn minted_seats(contract: &Contract, collection_id: &str, total_supply: u32) -> Vec<u32> {
    (1..=total_supply)
        .filter(|seat| {
            contract
                .scarces_by_id
                .contains_key(&format!("{collection_id}:{seat}"))
        })
        .collect()
}

#[test]
fn random_drop_mints_a_full_permutation() {
    let mut contract = new_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), random_config("punks", 10))
        .unwrap();

    purchase(&mut contract, buyer(), "punks", 4);
    purchase(&mut contract, owner(), "punks", 3);
    purchase(&mut contract, buyer(), "punks", 3);

    let seats = minted_seats(&contract, "punks", 10);
    assert_eq!(seats.len(), 10, "all ten seats must be minted exactly once");

    for seat in seats {
        let token = contract
            .scarces_by_id
            .get(&format!("punks:{seat}"))
            .unwrap();
        assert_eq!(
            token.metadata.media.as_deref(),
            Some(format!("ipfs://bafydir/{seat}.png").as_str()),
            "media must match the drawn seat"
        );
        assert_eq!(
            token.metadata.title.as_deref(),
            Some(format!("Punk #{seat}").as_str())
        );
    }

    let collection = contract.collections.get("punks").unwrap();
    assert_eq!(collection.minted_count, 10);
}

#[test]
fn random_drop_is_not_sequential() {
    let mut contract = new_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), random_config("big", 100))
        .unwrap();

    purchase(&mut contract, buyer(), "big", 10);

    let seats: BTreeSet<u32> = minted_seats(&contract, "big", 100).into_iter().collect();
    assert_eq!(seats.len(), 10);
    let sequential: BTreeSet<u32> = (1..=10).collect();
    assert_ne!(
        seats, sequential,
        "random assignment must not hand out the first ten seats in order"
    );
}

#[test]
fn airdrop_participates_in_random_draws() {
    let mut contract = new_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), random_config("mix", 6))
        .unwrap();

    purchase(&mut contract, buyer(), "mix", 3);

    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::AirdropFromCollection {
            collection_id: "mix".to_string(),
            receivers: vec![owner(), buyer(), creator()],
        }))
        .unwrap();

    let seats = minted_seats(&contract, "mix", 6);
    assert_eq!(seats.len(), 6, "purchase + airdrop must cover all seats");
}

#[test]
fn restore_seat_pool_reverses_draws() {
    let mut contract = new_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), random_config("undo", 8))
        .unwrap();
    let collection = contract.collections.get("undo").unwrap().clone();

    // Draw half the pool, then roll it back.
    let (first_draw, journal) = contract.allocate_seat_indices(&collection, 4);
    assert_eq!(first_draw.len(), 4);
    Contract::restore_seat_pool(journal);

    // A fresh full draw must still produce a complete permutation — a botched
    // restore would surface as a duplicate or out-of-range seat.
    let (seats, _journal) = contract.allocate_seat_indices(&collection, 8);
    let unique: BTreeSet<u32> = seats.iter().copied().collect();
    assert_eq!(unique.len(), 8);
    assert!(seats.iter().all(|s| *s < 8));
}

#[test]
fn sequential_collection_ignores_seat_pool() {
    let mut contract = new_contract();
    testing_env!(context(creator()).build());
    let mut config = random_config("seq", 5);
    config.random_assignment = false;
    contract.create_collection(&creator(), config).unwrap();

    purchase(&mut contract, buyer(), "seq", 2);
    purchase(&mut contract, owner(), "seq", 2);

    for seat in 1..=4u32 {
        assert!(
            contract.scarces_by_id.contains_key(&format!("seq:{seat}")),
            "sequential drops must fill seats in order"
        );
    }
    assert!(!contract.scarces_by_id.contains_key("seq:5"));
}

#[test]
fn legacy_borsh_defaults_random_assignment_false() {
    use near_sdk::borsh::{BorshDeserialize, BorshSerialize};

    let mut contract = new_contract();
    testing_env!(context(creator()).build());
    let mut config = random_config("legacy", 5);
    config.random_assignment = false;
    contract.create_collection(&creator(), config).unwrap();
    let col = contract.collections.get("legacy").unwrap().clone();

    let mut bytes = near_sdk::borsh::to_vec(&col).unwrap();
    // Pre-random_assignment layout: drop trailing redeemers (empty vec = 4) +
    // random_assignment (1).
    bytes.truncate(bytes.len() - 5);
    0u32.serialize(&mut bytes).unwrap();

    #[derive(BorshSerialize, BorshDeserialize)]
    #[borsh(crate = "near_sdk::borsh")]
    struct ValueAndIndex {
        value: LazyCollection,
        key_index: u32,
    }
    let loaded = ValueAndIndex::try_from_slice(&bytes).unwrap().value;
    assert!(!loaded.random_assignment);
    assert!(loaded.redeemers.is_empty());
    assert_eq!(loaded.app_commission_bps, col.app_commission_bps);
    assert_eq!(loaded.max_per_purchase, col.max_per_purchase);
}
