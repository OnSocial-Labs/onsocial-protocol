use crate::tests::test_utils::*;
use crate::*;
use near_sdk::testing_env;

fn app_id() -> String {
    "myapp".to_string()
}

fn approval_hub() -> Contract {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::RegisterApp {
            app_id: app_id(),
            params: AppConfig::default(),
        }))
        .unwrap();
    contract
        .execute(make_request(Action::SetAppConfig {
            app_id: app_id(),
            params: AppConfig {
                creator_access: Some(CreatorAccess::Approval),
                ..Default::default()
            },
        }))
        .unwrap();
    contract
}

fn request(contract: &mut Contract, actor: near_sdk::AccountId, message: Option<&str>) {
    testing_env!(context_with_deposit(actor, 1).build());
    contract
        .execute(make_request(Action::RequestPublish {
            app_id: app_id(),
            message: message.map(str::to_string),
        }))
        .unwrap();
}

#[test]
fn request_publish_on_approval_hub() {
    let mut contract = approval_hub();
    request(&mut contract, creator(), Some("  prints  "));

    let row = contract
        .get_publish_request(app_id(), creator())
        .expect("row");
    assert_eq!(row.status, "pending");
    assert_eq!(row.message.as_deref(), Some("prints"));
    assert!(row.decided_by.is_none());
    assert_eq!(row.requested_at.0, 1_700_000_000_000_000_000);

    let pending = contract.get_publish_requests(app_id(), Some("pending".into()), None, None);
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].account_id, creator());
}

#[test]
fn blank_note_is_stored_empty() {
    let mut contract = approval_hub();
    request(&mut contract, creator(), Some("   "));
    let row = contract.get_publish_request(app_id(), creator()).unwrap();
    assert!(row.message.is_none());
}

#[test]
fn note_over_280_fails() {
    let mut contract = approval_hub();
    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::RequestPublish {
            app_id: app_id(),
            message: Some("x".repeat(281)),
        }))
        .unwrap_err();
    assert!(err.to_string().contains("Note is too long"));
}

#[test]
fn request_rejected_unless_approval_hub() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::RegisterApp {
            app_id: app_id(),
            params: AppConfig::default(),
        }))
        .unwrap();
    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::RequestPublish {
            app_id: app_id(),
            message: None,
        }))
        .unwrap_err();
    assert!(err.to_string().contains("approval hubs"));
}

#[test]
fn staff_and_approved_creators_cannot_request() {
    let mut contract = approval_hub();
    testing_env!(context_with_deposit(owner(), 1).build());
    let err = contract
        .execute(make_request(Action::RequestPublish {
            app_id: app_id(),
            message: None,
        }))
        .unwrap_err();
    assert!(err.to_string().contains("Hub staff"));

    contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();
    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::RequestPublish {
            app_id: app_id(),
            message: None,
        }))
        .unwrap_err();
    assert!(err.to_string().contains("already an approved creator"));
}

#[test]
fn pending_request_cannot_be_duplicated() {
    let mut contract = approval_hub();
    request(&mut contract, creator(), None);
    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::RequestPublish {
            app_id: app_id(),
            message: Some("again".into()),
        }))
        .unwrap_err();
    assert!(err.to_string().contains("already pending"));
}

#[test]
fn cancel_removes_pending_request() {
    let mut contract = approval_hub();
    request(&mut contract, creator(), None);
    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::CancelPublishRequest { app_id: app_id() }))
        .unwrap();
    assert!(contract.get_publish_request(app_id(), creator()).is_none());
    assert!(
        contract
            .get_publish_requests(app_id(), None, None, None)
            .is_empty()
    );
}

#[test]
fn decline_then_request_again() {
    let mut contract = approval_hub();
    request(&mut contract, creator(), Some("first"));
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::DeclinePublishRequest {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();
    let declined = contract.get_publish_request(app_id(), creator()).unwrap();
    assert_eq!(declined.status, "declined");
    assert_eq!(declined.decided_by.as_ref(), Some(&owner()));

    request(&mut contract, creator(), Some("second"));
    let again = contract.get_publish_request(app_id(), creator()).unwrap();
    assert_eq!(again.status, "pending");
    assert_eq!(again.message.as_deref(), Some("second"));
    assert!(again.decided_by.is_none());
}

#[test]
fn outsider_cannot_decline() {
    let mut contract = approval_hub();
    request(&mut contract, creator(), None);
    testing_env!(context_with_deposit(buyer(), 1).build());
    let err = contract
        .execute(make_request(Action::DeclinePublishRequest {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn block_stops_a_new_request_until_unblock() {
    let mut contract = approval_hub();
    request(&mut contract, creator(), None);
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::BlockPublishRequester {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();

    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::RequestPublish {
            app_id: app_id(),
            message: None,
        }))
        .unwrap_err();
    assert!(err.to_string().contains("cannot request"));
    let err = contract
        .execute(make_request(Action::CancelPublishRequest { app_id: app_id() }))
        .unwrap_err();
    assert!(err.to_string().contains("No pending"));

    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::UnblockPublishRequester {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();
    assert!(contract.get_publish_request(app_id(), creator()).is_none());

    request(&mut contract, creator(), None);
    assert_eq!(
        contract.get_publish_request(app_id(), creator()).unwrap().status,
        "pending"
    );
}

#[test]
fn approve_clears_the_request_row() {
    let mut contract = approval_hub();
    request(&mut contract, creator(), Some("please"));
    request(&mut contract, buyer(), None);
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();
    assert!(contract.get_publish_request(app_id(), creator()).is_none());
    assert!(contract.is_approved_creator(app_id(), creator()));
    let left = contract.get_publish_requests(app_id(), Some("pending".into()), None, None);
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].account_id, buyer());
}

#[test]
fn block_list_is_separate_from_pending() {
    let mut contract = approval_hub();
    request(&mut contract, creator(), None);
    request(&mut contract, buyer(), None);
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::DeclinePublishRequest {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();
    contract
        .execute(make_request(Action::BlockPublishRequester {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();
    let pending = contract.get_publish_requests(app_id(), Some("pending".into()), None, None);
    let blocked = contract.get_publish_requests(app_id(), Some("blocked".into()), None, None);
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].account_id, buyer());
    assert_eq!(blocked.len(), 1);
    assert_eq!(blocked[0].account_id, creator());
    assert_eq!(blocked[0].decided_by.as_ref(), Some(&owner()));
}
