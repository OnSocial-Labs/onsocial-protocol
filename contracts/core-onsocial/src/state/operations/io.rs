use crate::errors::SocialError;
use crate::state::models::{DataEntry, SocialPlatform};

impl SocialPlatform {
    /// Soft-deleted entries are returned; filtering happens at higher layers.
    pub fn get_entry(&self, full_path: &str) -> Option<DataEntry> {
        let key = self.resolve_storage_key(full_path)?;

        near_sdk::env::storage_read(key.as_bytes())
            .and_then(|data| borsh::from_slice::<DataEntry>(&data).ok())
    }

    pub fn insert_entry(
        &mut self,
        full_path: &str,
        entry: DataEntry,
    ) -> Result<Option<DataEntry>, SocialError> {
        Ok(self.insert_entry_with_fallback(full_path, entry, None)?.0)
    }

    /// Storage payment priority:
    /// 1. Platform Pool (rate-limited free tier)
    /// 2. Group Pool (path-driven for group content)
    /// 3. Personal Sponsor (shared_storage allocation)
    /// 4. Personal Balance
    /// 5. Attached Deposit (final fallback if provided)
    pub fn insert_entry_with_fallback(
        &mut self,
        full_path: &str,
        entry: DataEntry,
        mut attached_balance: Option<&mut u128>,
    ) -> Result<(Option<DataEntry>, Option<super::SponsorOutcome>), SocialError> {
        let key = self
            .resolve_storage_key(full_path)
            .ok_or_else(|| SocialError::InvalidInput("Invalid path format".to_string()))?;

        let existing_entry = near_sdk::env::storage_read(key.as_bytes())
            .and_then(|data| borsh::from_slice::<DataEntry>(&data).ok());

        let serialized_entry = borsh::to_vec(&entry)
            .map_err(|_| SocialError::InvalidInput("Serialization failed".to_string()))?;

        let account_id = self.resolve_payer_account(full_path)?;
        let mut storage = self
            .user_storage
            .get(&account_id)
            .cloned()
            .unwrap_or_default();

        storage.storage_tracker.start_tracking();
        near_sdk::env::storage_write(key.as_bytes(), &serialized_entry);
        storage.storage_tracker.stop_tracking();

        let delta = storage.storage_tracker.delta();

        let mut sponsor_outcome: Option<super::SponsorOutcome> = None;
        match delta.cmp(&0) {
            std::cmp::Ordering::Greater => {
                storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
                sponsor_outcome = self.allocate_storage_from_pools(
                    &mut storage,
                    full_path,
                    &account_id,
                    delta as u64,
                );
            }
            std::cmp::Ordering::Less => {
                storage.used_bytes = storage
                    .used_bytes
                    .saturating_sub(delta.unsigned_abs() as u64);
                self.deallocate_storage_to_pools(
                    &mut storage,
                    full_path,
                    &account_id,
                    delta.unsigned_abs() as u64,
                );
            }
            std::cmp::Ordering::Equal => {}
        }

        storage.storage_tracker.reset();

        self.ensure_storage_covered(&mut storage, &mut attached_balance)?;

        self.user_storage.insert(account_id, storage);
        Ok((existing_entry, sponsor_outcome))
    }
}
