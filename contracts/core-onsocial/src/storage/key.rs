use near_sdk::{BorshStorageKey, near};

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    SharedStoragePools,
    UserStorage,
    GroupPoolUsage,
    GroupSponsorQuotas,
    GroupSponsorDefaults,
}
