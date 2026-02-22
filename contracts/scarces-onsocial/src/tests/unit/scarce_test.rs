use crate::tests::test_utils::*;
use crate::*;

fn mint_token(contract: &mut Contract, owner: &AccountId, token_id: &str) {
    let ctx = MintContext {
        owner_id: owner.clone(),
        creator_id: owner.clone(),
        minter_id: owner.clone(),
    };
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
    contract
        .mint(token_id.to_string(), ctx, metadata, None)
        .unwrap();
}

// --- mint ---

#[test]
fn mint_creates_token_and_tracks_owner() {
    let mut contract = new_contract();
    mint_token(&mut contract, &owner(), "t1");

    assert!(contract.scarces_by_id.contains_key("t1"));
    let token = contract.scarces_by_id.get("t1").unwrap();
    assert_eq!(token.owner_id, owner());
    assert_eq!(token.creator_id, owner());

    let owner_tokens = contract.scarces_per_owner.get(&owner()).unwrap();
    assert!(owner_tokens.contains("t1"));
}

#[test]
fn mint_duplicate_id_fails() {
    let mut contract = new_contract();
    mint_token(&mut contract, &owner(), "t1");

    let ctx = MintContext {
        owner_id: owner(),
        creator_id: owner(),
        minter_id: owner(),
    };
    let metadata = TokenMetadata {
        title: Some("Dup".to_string()),
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
    let err = contract
        .mint("t1".to_string(), ctx, metadata, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn mint_token_id_too_long() {
    let mut contract = new_contract();
    let long_id = "x".repeat(MAX_TOKEN_ID_LEN + 1);
    let ctx = MintContext {
        owner_id: owner(),
        creator_id: owner(),
        minter_id: owner(),
    };
    let metadata = TokenMetadata {
        title: Some("T".to_string()),
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
    let err = contract
        .mint(long_id, ctx, metadata, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- transfer ---

#[test]
fn transfer_changes_owner() {
    let mut contract = new_contract();
    mint_token(&mut contract, &owner(), "t1");

    contract
        .transfer(&owner(), &buyer(), "t1", None, None)
        .unwrap();

    let token = contract.scarces_by_id.get("t1").unwrap();
    assert_eq!(token.owner_id, buyer());
    // Old owner no longer has token
    assert!(contract.scarces_per_owner.get(&owner()).is_none());
    // New owner has token
    assert!(contract.scarces_per_owner.get(&buyer()).unwrap().contains("t1"));
}

#[test]
fn transfer_wrong_sender_fails() {
    let mut contract = new_contract();
    mint_token(&mut contract, &owner(), "t1");

    let err = contract
        .transfer(&buyer(), &creator(), "t1", None, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn transfer_nonexistent_token_fails() {
    let mut contract = new_contract();
    let err = contract
        .transfer(&owner(), &buyer(), "nope", None, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn transfer_clears_approvals() {
    let mut contract = new_contract();
    mint_token(&mut contract, &owner(), "t1");

    // Give buyer an approval
    contract
        .approve(&owner(), "t1", &buyer(), None)
        .unwrap();
    let token = contract.scarces_by_id.get("t1").unwrap();
    assert!(!token.approved_account_ids.is_empty());

    // Transfer clears them
    contract
        .transfer(&owner(), &creator(), "t1", None, None)
        .unwrap();
    let token = contract.scarces_by_id.get("t1").unwrap();
    assert!(token.approved_account_ids.is_empty());
}

// --- Soulbound ---

#[test]
fn soulbound_token_cannot_transfer() {
    let mut contract = new_contract();
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
        .mint("soul1".to_string(), ctx, metadata, Some(ovr))
        .unwrap();

    let err = contract
        .transfer(&owner(), &buyer(), "soul1", None, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// --- Approval-based transfer ---

#[test]
fn approved_account_can_transfer() {
    let mut contract = new_contract();
    mint_token(&mut contract, &owner(), "t1");

    contract
        .approve(&owner(), "t1", &buyer(), None)
        .unwrap();
    let approval_id = *contract
        .scarces_by_id
        .get("t1")
        .unwrap()
        .approved_account_ids
        .get(&buyer())
        .unwrap();

    contract
        .transfer(&buyer(), &creator(), "t1", Some(approval_id), None)
        .unwrap();
    let token = contract.scarces_by_id.get("t1").unwrap();
    assert_eq!(token.owner_id, creator());
}

#[test]
fn invalid_approval_id_fails() {
    let mut contract = new_contract();
    mint_token(&mut contract, &owner(), "t1");

    contract
        .approve(&owner(), "t1", &buyer(), None)
        .unwrap();

    let err = contract
        .transfer(&buyer(), &creator(), "t1", Some(999), None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// --- Batch transfer ---

#[test]
fn batch_transfer_moves_all() {
    let mut contract = new_contract();
    mint_token(&mut contract, &owner(), "t1");
    mint_token(&mut contract, &owner(), "t2");

    let transfers = vec![
        crate::protocol::TransferItem {
            receiver_id: buyer(),
            token_id: "t1".to_string(),
            memo: None,
        },
        crate::protocol::TransferItem {
            receiver_id: buyer(),
            token_id: "t2".to_string(),
            memo: None,
        },
    ];
    contract.batch_transfer(&owner(), transfers).unwrap();

    assert_eq!(contract.scarces_by_id.get("t1").unwrap().owner_id, buyer());
    assert_eq!(contract.scarces_by_id.get("t2").unwrap().owner_id, buyer());
}

#[test]
fn batch_transfer_empty_fails() {
    let mut contract = new_contract();
    let err = contract
        .batch_transfer(&owner(), vec![])
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Quick mint ---

#[test]
fn quick_mint_increments_counter() {
    let mut contract = new_contract();
    assert_eq!(contract.next_token_id, 0);

    let id1 = contract
        .quick_mint(
            &owner(),
            TokenMetadata {
                title: Some("QM1".to_string()),
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
            ScarceOptions {
                royalty: None,
                app_id: None,
                transferable: true,
                burnable: true,
            },
        )
        .unwrap();

    assert_eq!(id1, "s:0");
    assert_eq!(contract.next_token_id, 1);
    assert!(contract.scarces_by_id.contains_key("s:0"));
}

// --- nft_token view ---

#[test]
fn nft_token_returns_correct_data() {
    let mut contract = new_contract();
    mint_token(&mut contract, &owner(), "view-test");

    let result = contract.nft_token("view-test".to_string());
    assert!(result.is_some());
    let token = result.unwrap();
    assert_eq!(token.token_id, "view-test");
    assert_eq!(token.owner_id, owner());
    assert!(token.metadata.is_some());
}

#[test]
fn nft_token_nonexistent_returns_none() {
    let contract = new_contract();
    assert!(contract.nft_token("nope".to_string()).is_none());
}
