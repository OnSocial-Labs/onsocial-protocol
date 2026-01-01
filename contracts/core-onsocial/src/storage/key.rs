use near_sdk::{near, BorshStorageKey};

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    SharedStoragePools,
    UserStorage,
    GroupPoolUsage,
    GroupSponsorQuotas,
    GroupSponsorDefaults,
}
