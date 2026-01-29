//! OnSocial fungible token. NEP-141/145/148 compliant, 18 decimals.

use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::fungible_token::metadata::{
    FT_METADATA_SPEC, FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue, env, json_types::U128,
    near, require,
};

const VERSION: &str = "1.0.0";
const DECIMALS: u8 = 18;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    FungibleToken,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
    owner_id: AccountId,
    metadata: FungibleTokenMetadata,
}

#[near]
impl Contract {
    /// Mints `total_supply` to `owner_id`.
    #[init]
    pub fn new(
        owner_id: AccountId,
        name: String,
        symbol: String,
        total_supply: U128,
        icon: String,
    ) -> Self {
        require!(!name.is_empty(), "Token name cannot be empty");
        require!(!symbol.is_empty(), "Token symbol cannot be empty");
        require!(total_supply.0 > 0, "Total supply must be greater than 0");
        require!(!icon.is_empty(), "Token icon cannot be empty");

        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name,
            symbol,
            icon: Some(icon),
            reference: None,
            reference_hash: None,
            decimals: DECIMALS,
        };

        let mut this = Self {
            token: FungibleToken::new(StorageKey::FungibleToken),
            owner_id: owner_id.clone(),
            metadata,
        };

        this.token.internal_register_account(&owner_id);
        this.token.internal_deposit(&owner_id, total_supply.0);

        near_contract_standards::fungible_token::events::FtMint {
            owner_id: &owner_id,
            amount: total_supply,
            memo: Some("Initial mint"),
        }
        .emit();

        this
    }

    /// Updates token icon (data URL). Owner only. New icon required.
    pub fn set_icon(&mut self, icon: String) {
        self.assert_owner();
        require!(!icon.is_empty(), "Token icon cannot be empty");
        self.metadata.icon = Some(icon);
        env::log_str("Icon updated");
    }

    /// Updates off-chain metadata reference. Owner only.
    pub fn set_reference(
        &mut self,
        reference: Option<String>,
        reference_hash: Option<near_sdk::json_types::Base64VecU8>,
    ) {
        self.assert_owner();
        self.metadata.reference = reference;
        self.metadata.reference_hash = reference_hash;
        env::log_str("Reference updated");
    }

    /// Transfers ownership. Owner only.
    pub fn set_owner(&mut self, new_owner: AccountId) {
        self.assert_owner();
        let old_owner = self.owner_id.clone();
        self.owner_id = new_owner.clone();
        env::log_str(&format!(
            "Owner changed from {} to {}",
            old_owner, new_owner
        ));
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    /// Permanently renounces ownership.
    pub fn renounce_owner(&mut self) {
        self.assert_owner();
        let old_owner = self.owner_id.clone();
        self.owner_id = "system".parse().unwrap();
        env::log_str(&format!("Ownership renounced by {}", old_owner));
    }

    pub fn version(&self) -> String {
        VERSION.to_string()
    }

    /// Burns tokens from caller's balance.
    #[payable]
    pub fn burn(&mut self, amount: U128) {
        require!(
            env::attached_deposit() >= NearToken::from_yoctonear(1),
            "Requires attached deposit of at least 1 yoctoNEAR"
        );
        let account_id = env::predecessor_account_id();
        self.token.internal_withdraw(&account_id, amount.0);

        near_contract_standards::fungible_token::events::FtBurn {
            owner_id: &account_id,
            amount: amount.0.into(),
            memo: Some("User burn"),
        }
        .emit();
    }

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can call this method"
        );
    }
}

// --- NEP-141: Fungible Token Core ---
#[near]
impl near_contract_standards::fungible_token::core::FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl near_contract_standards::fungible_token::resolver::FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used_amount, burned_amount) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned_amount > 0 {
            env::log_str(&format!("Account @{} burned {}", sender_id, burned_amount));
        }
        used_amount.into()
    }
}

// --- NEP-145: Storage Management ---
#[near]
impl near_contract_standards::storage_management::StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> near_contract_standards::storage_management::StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(
        &mut self,
        amount: Option<NearToken>,
    ) -> near_contract_standards::storage_management::StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            env::log_str(&format!("Closed @{} with {}", account_id, balance));
            true
        } else {
            false
        }
    }

    fn storage_balance_bounds(
        &self,
    ) -> near_contract_standards::storage_management::StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(
        &self,
        account_id: AccountId,
    ) -> Option<near_contract_standards::storage_management::StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

// --- NEP-148: Fungible Token Metadata ---
#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }
}

#[cfg(test)]
mod tests;
