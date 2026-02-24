use crate::*;

#[near]
impl Contract {
    #[init]
    #[payable]
    pub fn new(
        owner_id: AccountId,
        contract_metadata: Option<external::ScarceContractMetadata>,
    ) -> Self {
        let deposit = env::attached_deposit().as_yoctonear();
        assert!(
            deposit >= PLATFORM_STORAGE_MIN_RESERVE,
            "Init requires at least {} yoctoNEAR ({} NEAR) to seed the platform storage pool",
            PLATFORM_STORAGE_MIN_RESERVE,
            PLATFORM_STORAGE_MIN_RESERVE / 1_000_000_000_000_000_000_000_000,
        );
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
            app_pool_ids: IterableSet::new(StorageKey::AppPoolIds),
            app_user_usage: LookupMap::new(StorageKey::AppUserUsage),
            platform_storage_balance: deposit,
            user_storage: LookupMap::new(StorageKey::UserStorage),
            collection_mint_counts: LookupMap::new(StorageKey::CollectionMintCounts),
            collection_allowlist: LookupMap::new(StorageKey::CollectionAllowlist),
            offers: IterableMap::new(StorageKey::Offers),
            collection_offers: IterableMap::new(StorageKey::CollectionOffers),
            lazy_listings: IterableMap::new(StorageKey::LazyListings),
            intents_executors: Vec::new(),
            contract_metadata: contract_metadata.unwrap_or_default(),
            approved_nft_contracts: IterableSet::new(StorageKey::ApprovedNftContracts),
            wnear_account_id: None,
            pending_attached_balance: 0,
        }
    }

    #[payable]
    #[handle_result]
    pub fn transfer_ownership(&mut self, new_owner: AccountId) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
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

    #[payable]
    #[handle_result]
    pub fn set_fee_recipient(&mut self, fee_recipient: AccountId) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        let old_recipient = self.fee_recipient.clone();
        self.fee_recipient = fee_recipient;
        events::emit_fee_recipient_changed(&self.owner_id, &old_recipient, &self.fee_recipient);
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn add_intents_executor(
        &mut self,
        executor: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
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

    #[payable]
    #[handle_result]
    pub fn remove_intents_executor(
        &mut self,
        executor: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
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

    /// Set (or clear) the wNEAR account ID for the NEP-141 FT receiver.
    /// Once set, `ft_on_transfer` accepts wNEAR from this account.
    /// Pass `None` to disable wNEAR deposits.
    #[payable]
    #[handle_result]
    pub fn set_wnear_account(
        &mut self,
        wnear_account_id: Option<AccountId>,
    ) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        self.wnear_account_id = wnear_account_id.clone();
        events::emit_wnear_account_set(&self.owner_id, self.wnear_account_id.as_ref());
        Ok(())
    }

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
        crate::guards::check_one_yocto()?;
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

    #[payable]
    #[handle_result]
    pub fn add_approved_nft_contract(
        &mut self,
        nft_contract_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        self.approved_nft_contracts.insert(nft_contract_id.clone());
        events::emit_approved_nft_contract_added(&self.owner_id, &nft_contract_id);
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn remove_approved_nft_contract(
        &mut self,
        nft_contract_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        self.approved_nft_contracts.remove(&nft_contract_id);
        events::emit_approved_nft_contract_removed(&self.owner_id, &nft_contract_id);
        Ok(())
    }
    #[payable]
    #[handle_result]
    pub fn update_fee_config(
        &mut self,
        update: FeeConfigUpdate,
    ) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        self.fee_config.validate_patch(&update)?;
        self.fee_config.apply_patch(&update);
        events::emit_fee_config_updated(
            &self.owner_id,
            self.fee_config.total_fee_bps,
            self.fee_config.app_pool_fee_bps,
            self.fee_config.platform_storage_fee_bps,
        );
        Ok(())
    }
    #[payable]
    #[handle_result]
    pub fn fund_platform_storage(&mut self) -> Result<(), MarketplaceError> {
        self.check_contract_owner(&env::predecessor_account_id())?;
        let deposit = env::attached_deposit().as_yoctonear();
        if deposit == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Must attach NEAR to fund platform storage".into(),
            ));
        }
        self.platform_storage_balance += deposit;
        events::emit_platform_storage_funded(&self.owner_id, deposit, self.platform_storage_balance);
        Ok(())
    }

    pub fn get_approved_nft_contracts(&self) -> Vec<&AccountId> {
        self.approved_nft_contracts.iter().collect()
    }

    pub fn get_version(&self) -> &str {
        &self.version
    }
}
