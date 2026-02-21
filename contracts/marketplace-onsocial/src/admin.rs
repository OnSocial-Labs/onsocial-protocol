use crate::*;

const GAS_MIGRATE: Gas = Gas::from_tgas(200);

#[near]
impl Contract {
    // --- Init ---

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
            pending_attached_balance: 0,
        }
    }

    // --- Admin ---

    /// Owner only.
    #[payable]
    #[handle_result]
    pub fn transfer_ownership(&mut self, new_owner: AccountId) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        if new_owner == self.owner_id {
            return Err(MarketplaceError::InvalidInput(
                "New owner must differ from current owner".to_string(),
            ));
        }
        let old_owner = self.owner_id.clone();
        self.owner_id = new_owner;
        events::emit_owner_transferred(&old_owner, &self.owner_id);
        Ok(())
    }

    pub fn get_owner(&self) -> &AccountId {
        &self.owner_id
    }

    /// Owner only.
    #[payable]
    #[handle_result]
    pub fn set_fee_recipient(&mut self, fee_recipient: AccountId) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        let old_recipient = self.fee_recipient.clone();
        self.fee_recipient = fee_recipient;
        events::emit_fee_recipient_changed(&self.owner_id, &old_recipient, &self.fee_recipient);
        Ok(())
    }

    /// Owner only.
    #[payable]
    #[handle_result]
    pub fn add_intents_executor(
        &mut self,
        executor: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        if self.intents_executors.contains(&executor) {
            return Err(MarketplaceError::InvalidInput(
                "Executor already exists".into(),
            ));
        }
        if self.intents_executors.len() >= MAX_INTENTS_EXECUTORS {
            return Err(MarketplaceError::InvalidInput(format!(
                "Too many intents executors (max {})",
                MAX_INTENTS_EXECUTORS
            )));
        }
        self.intents_executors.push(executor.clone());
        events::emit_intents_executor_added(&self.owner_id, &executor);
        Ok(())
    }

    /// Owner only.
    #[payable]
    #[handle_result]
    pub fn remove_intents_executor(
        &mut self,
        executor: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        let pos = self
            .intents_executors
            .iter()
            .position(|e| e == &executor)
            .ok_or_else(|| MarketplaceError::NotFound("Executor not found".into()))?;
        self.intents_executors.remove(pos);
        events::emit_intents_executor_removed(&self.owner_id, &executor);
        Ok(())
    }

    /// Owner only.
    #[payable]
    #[handle_result]
    pub fn set_contract_metadata(
        &mut self,
        name: Option<String>,
        symbol: Option<String>,
        icon: Option<Option<String>>,
        base_uri: Option<Option<String>>,
        reference: Option<Option<String>>,
        reference_hash: Option<Option<near_sdk::json_types::Base64VecU8>>,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        if let Some(n) = name {
            self.contract_metadata.name = n;
        }
        if let Some(s) = symbol {
            self.contract_metadata.symbol = s;
        }
        if let Some(v) = icon {
            self.contract_metadata.icon = v;
        }
        if let Some(v) = base_uri {
            self.contract_metadata.base_uri = v;
        }
        if let Some(v) = reference {
            self.contract_metadata.reference = v;
        }
        if let Some(v) = reference_hash {
            self.contract_metadata.reference_hash = v;
        }
        events::emit_contract_metadata_updated(
            &self.owner_id,
            &self.contract_metadata.name,
            &self.contract_metadata.symbol,
            self.contract_metadata.icon.as_deref(),
            self.contract_metadata.base_uri.as_deref(),
            self.contract_metadata.reference.as_deref(),
        );
        Ok(())
    }

    // --- Approved NFT contracts ---

    /// Owner only.
    #[payable]
    #[handle_result]
    pub fn add_approved_nft_contract(
        &mut self,
        nft_contract_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        self.approved_nft_contracts.insert(nft_contract_id.clone());
        events::emit_approved_nft_contract_added(&self.owner_id, &nft_contract_id);
        Ok(())
    }

    /// Owner only.
    #[payable]
    #[handle_result]
    pub fn remove_approved_nft_contract(
        &mut self,
        nft_contract_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        self.approved_nft_contracts.remove(&nft_contract_id);
        events::emit_approved_nft_contract_removed(&self.owner_id, &nft_contract_id);
        Ok(())
    }

    pub fn get_approved_nft_contracts(&self) -> Vec<&AccountId> {
        self.approved_nft_contracts.iter().collect()
    }

    // --- Fee views ---

    pub fn get_fee_config(&self) -> &FeeConfig {
        &self.fee_config
    }

    pub fn get_fee_recipient(&self) -> AccountId {
        self.fee_recipient.clone()
    }

    /// Returns balance in yoctoNEAR.
    pub fn get_platform_storage_balance(&self) -> U128 {
        U128(self.platform_storage_balance)
    }

    /// Owner only. Leaves at least `PLATFORM_STORAGE_MIN_RESERVE` yoctoNEAR in pool.
    #[payable]
    #[handle_result]
    pub fn withdraw_platform_storage(&mut self, amount: U128) -> Result<Promise, MarketplaceError> {
        crate::internal::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
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
        Ok(Promise::new(self.owner_id.clone()).transfer(NearToken::from_yoctonear(amount.0)))
    }

    pub fn get_version(&self) -> &str {
        &self.version
    }

    // --- Upgrade ---

    /// Owner only. Panics unless 1 yoctoNEAR attached. Reads WASM from `env::input()`.
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

    /// Called automatically by `update_contract`; runs state migration on upgrade.
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
