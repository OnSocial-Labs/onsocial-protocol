// --- Test Utilities ---
#[cfg(test)]
use crate::*;
#[cfg(test)]
use near_sdk::test_utils::{VMContextBuilder, accounts};
#[cfg(test)]
use near_sdk::{AccountId, NearToken, testing_env};

/// Standard test accounts: accounts(0)=alice, accounts(1)=bob, accounts(2)=charlie.
#[cfg(test)]
pub fn owner() -> AccountId {
    accounts(0)
}

#[cfg(test)]
pub fn buyer() -> AccountId {
    accounts(1)
}

#[cfg(test)]
pub fn creator() -> AccountId {
    accounts(2)
}

/// Build a VMContext with sensible defaults; caller = `predecessor`, deposit = 0.
#[cfg(test)]
pub fn context(predecessor: AccountId) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id("marketplace.near".parse().unwrap())
        .signer_account_id(predecessor.clone())
        .predecessor_account_id(predecessor)
        .block_timestamp(1_700_000_000_000_000_000) // ~Nov 2023 in nanoseconds
        .account_balance(NearToken::from_near(100))
        .attached_deposit(NearToken::from_yoctonear(0));
    builder
}

/// Build a VMContext with a specific attached deposit.
#[cfg(test)]
pub fn context_with_deposit(predecessor: AccountId, deposit_yocto: u128) -> VMContextBuilder {
    let mut builder = context(predecessor);
    builder.attached_deposit(NearToken::from_yoctonear(deposit_yocto));
    builder
}

/// Create a fresh Contract for testing, owned by `accounts(0)`.
/// Attaches 5 NEAR to satisfy the mandatory platform storage deposit.
#[cfg(test)]
pub fn new_contract() -> Contract {
    let ctx = context_with_deposit(owner(), 5_000_000_000_000_000_000_000_000);
    testing_env!(ctx.build());
    Contract::new(owner(), None)
}

/// Build a Request envelope for `execute()` with the given Action and Direct auth.
/// Mirrors core-onsocial's `set_request()` pattern.
#[cfg(test)]
pub fn make_request(action: crate::Action) -> crate::Request {
    crate::Request {
        target_account: None,
        action,
        auth: None,
        options: None,
    }
}
