use near_sdk::BorshStorageKey;
use near_sdk::near;

#[inline]
pub(crate) fn storage_byte_cost() -> u128 {
    near_sdk::env::storage_byte_cost().as_yoctonear()
}

#[near]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    Sales,
    ByOwnerId,
    ByOwnerIdInner { account_id_hash: Vec<u8> },
    ByScarceContractId,
    ByScarceContractIdInner { account_id_hash: Vec<u8> },
    ScarcesPerOwner,
    ScarcesPerOwnerInner { account_id_hash: Vec<u8> },
    ScarcesById,
    ScarceMetadataById,
    ScarceApprovalsById,
    Collections,
    CollectionsByCreator,
    CollectionsByCreatorInner { account_id_hash: Vec<u8> },
    AppPools,
    AppUserUsage,
    UserStorage,
    CollectionMintCounts,
    CollectionAllowlist,
    Offers,
    CollectionOffers,
    LazyListings,
    ApprovedNftContracts,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct UserStorageBalance {
    pub balance: u128,
    pub used_bytes: u64,
    #[serde(default)]
    pub tier2_used_bytes: u64,
    #[serde(default)]
    pub spending_cap: Option<u128>,
}
