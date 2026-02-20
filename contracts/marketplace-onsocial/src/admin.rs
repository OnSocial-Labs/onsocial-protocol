//! Admin methods: fee config, executors, contract metadata, upgrades.

use crate::*;

/// Gas reserved for the `migrate()` callback after code deployment.
const GAS_MIGRATE: Gas = Gas::from_tgas(200);

#[near]
impl Contract {
    // ── Init ─────────────────────────────────────────────────────────

    #[init]
    pub fn new(
        owner_id: AccountId,
        contract_metadata: Option<external::ScarceContractMetadata>,
    ) -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            fee_recipient: owner_id.clone(),
            owner_id,
            sales: IterableMap::new(StorageKey::Sales),
            by_owner_id: LookupMap::new(StorageKey::ByOwnerId),
            by_scarce_contract_id: LookupMap::new(StorageKey::ByScarceContractId),
            scarces_per_owner: LookupMap::new(StorageKey::ScarcesPerOwner),
            scarces_by_id: IterableMap::new(StorageKey::ScarcesById),
            next_approval_id: 0,
            next_token_id: 0,
            collections: IterableMap::new(StorageKey::Collections),
            collections_by_creator: LookupMap::new(StorageKey::CollectionsByCreator),
            fee_config: FeeConfig::default(),
            app_pools: LookupMap::new(StorageKey::AppPools),
            app_user_usage: LookupMap::new(StorageKey::AppUserUsage),
            platform_storage_balance: 0,
            user_storage: LookupMap::new(StorageKey::UserStorage),
            collection_mint_counts: LookupMap::new(StorageKey::CollectionMintCounts),
            collection_allowlist: LookupMap::new(StorageKey::CollectionAllowlist),
            offers: IterableMap::new(StorageKey::Offers),
            collection_offers: IterableMap::new(StorageKey::CollectionOffers),
            lazy_listings: IterableMap::new(StorageKey::LazyListings),
            intents_executors: Vec::new(),
            contract_metadata: contract_metadata.unwrap_or_default(),
            approved_nft_contracts: IterableSet::new(StorageKey::ApprovedNftContracts),
        }
    }

    // ── Admin ────────────────────────────────────────────────────────

    /// Transfer contract ownership to a new account (single-step).
    /// Requires 1 yoctoNEAR. Only the current owner.
    #[payable]
    #[handle_result]
    pub fn transfer_ownership(&mut self, new_owner: AccountId) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        let old_owner = self.owner_id.clone();
        self.owner_id = new_owner;
        events::emit_owner_transferred(&old_owner, &self.owner_id);
        Ok(())
    }

    /// View: get the current contract owner.
    pub fn get_owner(&self) -> &AccountId {
        &self.owner_id
    }

    /// Set the fee recipient. Requires 1 yoctoNEAR to prevent
    /// function-call access keys from calling admin methods.
    #[payable]
    #[handle_result]
    pub fn set_fee_recipient(&mut self, fee_recipient: AccountId) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        self.fee_recipient = fee_recipient;
        events::emit_fee_recipient_changed(&self.owner_id, &self.fee_recipient);
        Ok(())
    }

    /// Set intent executors. Requires 1 yoctoNEAR to prevent
    /// function-call access keys from calling admin methods.
    #[payable]
    #[handle_result]
    pub fn set_intents_executors(
        &mut self,
        executors: Vec<AccountId>,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        self.intents_executors = executors;
        events::emit_intents_executors_updated(&self.owner_id, &self.intents_executors);
        Ok(())
    }

    /// Update contract-level NFT metadata (NEP-177): name, symbol, icon, base_uri.
    /// Requires 1 yoctoNEAR. Only contract owner.
    ///
    /// Setting `base_uri` enables relative media paths on tokens (e.g. "42.png"
    /// instead of "https://arweave.net/abc/42.png"), reducing per-token storage cost.
    /// Wallets and explorers read `icon` and `name` from this to display branding.
    #[payable]
    #[handle_result]
    pub fn set_contract_metadata(
        &mut self,
        name: Option<String>,
        symbol: Option<String>,
        icon: Option<String>,
        base_uri: Option<String>,
        reference: Option<String>,
        reference_hash: Option<near_sdk::json_types::Base64VecU8>,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        if let Some(n) = name {
            self.contract_metadata.name = n;
        }
        if let Some(s) = symbol {
            self.contract_metadata.symbol = s;
        }
        // icon and base_uri use nested Option: Some(value) sets, None leaves unchanged
        if icon.is_some() {
            self.contract_metadata.icon = icon;
        }
        if base_uri.is_some() {
            self.contract_metadata.base_uri = base_uri;
        }
        if reference.is_some() {
            self.contract_metadata.reference = reference;
        }
        if reference_hash.is_some() {
            self.contract_metadata.reference_hash = reference_hash;
        }
        events::emit_contract_metadata_updated(&self.owner_id);
        Ok(())
    }

    // ── Approved NFT contracts (NEP-178 whitelist) ──────────────────

    /// Allowlist an external NFT contract to use `nft_on_approve` auto-listing.
    /// Requires 1 yoctoNEAR. Only contract owner.
    #[payable]
    #[handle_result]
    pub fn add_approved_nft_contract(
        &mut self,
        nft_contract_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        self.approved_nft_contracts.insert(nft_contract_id);
        Ok(())
    }

    /// Remove an external NFT contract from the auto-listing allowlist.
    /// Requires 1 yoctoNEAR. Only contract owner.
    #[payable]
    #[handle_result]
    pub fn remove_approved_nft_contract(
        &mut self,
        nft_contract_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        self.approved_nft_contracts.remove(&nft_contract_id);
        Ok(())
    }

    /// View the list of allowlisted external NFT contracts.
    pub fn get_approved_nft_contracts(&self) -> Vec<&AccountId> {
        self.approved_nft_contracts.iter().collect()
    }

    // ── Fee views ────────────────────────────────────────────────────

    pub fn get_fee_config(&self) -> &FeeConfig {
        &self.fee_config
    }

    pub fn get_fee_recipient(&self) -> AccountId {
        self.fee_recipient.clone()
    }

    /// Current balance of the platform storage pool (yoctoNEAR).
    /// Funded by platform_storage_fee_bps on every standalone sale.
    /// Used to sponsor storage for operations with no app_id.
    pub fn get_platform_storage_balance(&self) -> U128 {
        U128(self.platform_storage_balance)
    }

    /// Withdraw excess NEAR from the platform storage pool (owner only).
    /// Requires 1 yoctoNEAR to ensure Full Access Key.
    /// A minimum reserve of PLATFORM_STORAGE_MIN_RESERVE (10 NEAR) always stays
    /// in the pool to keep storage sponsorship operational between sales.
    #[payable]
    #[handle_result]
    pub fn withdraw_platform_storage(&mut self, amount: U128) -> Result<Promise, MarketplaceError> {
        crate::internal::check_one_yocto()?;
        let caller = env::predecessor_account_id();
        if caller != self.owner_id {
            return Err(MarketplaceError::only_owner("contract owner"));
        }
        if amount.0 > self.platform_storage_balance {
            return Err(MarketplaceError::InsufficientDeposit(
                "Amount exceeds platform storage balance".to_string(),
            ));
        }
        let remaining = self.platform_storage_balance - amount.0;
        if remaining < PLATFORM_STORAGE_MIN_RESERVE {
            return Err(MarketplaceError::InvalidInput(format!(
                "Must keep at least {} yoctoNEAR (10 NEAR) as reserve. Max withdrawable: {}",
                PLATFORM_STORAGE_MIN_RESERVE,
                self.platform_storage_balance
                    .saturating_sub(PLATFORM_STORAGE_MIN_RESERVE),
            )));
        }
        self.platform_storage_balance -= amount.0;
        Ok(Promise::new(caller).transfer(NearToken::from_yoctonear(amount.0)))
    }

    /// Return the on-chain contract version.
    pub fn get_version(&self) -> &str {
        &self.version
    }

    // ── Upgrade ──────────────────────────────────────────────────────

    /// Deploy new contract code and run migration.
    ///
    /// The new WASM binary is passed as the raw transaction input.
    /// Only the contract owner may call this. Requires 1 yoctoNEAR.
    ///
    /// Creates a single Promise chain that:
    /// 1. Deploys the new code to this account.
    /// 2. Calls `migrate()` on the freshly-deployed code (200 TGas).
    pub fn update_contract(&self) -> Promise {
        near_sdk::require!(
            env::attached_deposit().as_yoctonear() == 1,
            "Attach 1 yoctoNEAR"
        );
        near_sdk::require!(
            env::predecessor_account_id() == self.owner_id,
            "Only contract owner can upgrade"
        );
        let code = env::input().expect("No input").to_vec();
        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_near(0),
                GAS_MIGRATE,
            )
            .as_return()
    }

    /// State migration — called automatically by `update_contract`.
    ///
    /// Reads the old state, bumps the version, emits a contract-upgrade
    /// event, and writes the updated state back.
    ///
    /// Future schema changes go here: add field defaults, transform
    /// collections, etc.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let mut contract: Self = env::state_read().expect("State read failed");
        let old_version = contract.version.clone();
        contract.version = env!("CARGO_PKG_VERSION").to_string();

        events::emit_contract_upgraded(&env::current_account_id(), &old_version, &contract.version);

        contract
    }
}
