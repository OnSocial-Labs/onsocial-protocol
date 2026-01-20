use near_sdk::{AccountId, json_types::U64};

use crate::EntryView;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    pub fn get(&self, keys: Vec<String>, account_id: Option<AccountId>) -> Vec<EntryView> {
        let account_id = account_id.as_ref();
        keys.into_iter()
            .map(|key| self.get_one_internal(key, account_id))
            .collect()
    }

    pub fn get_one(&self, key: String, account_id: Option<AccountId>) -> EntryView {
        self.get_one_internal(key, account_id.as_ref())
    }

    fn get_one_internal(&self, requested_key: String, account_id: Option<&AccountId>) -> EntryView {
        let Some(full_key) = crate::validation::resolve_view_key(&requested_key, account_id) else {
            return EntryView {
                requested_key,
                full_key: String::new(),
                value: None,
                block_height: None,
                deleted: false,
                corrupted: false,
            };
        };

        match self.get_entry(&full_key) {
            None => EntryView {
                requested_key,
                full_key,
                value: None,
                block_height: None,
                deleted: false,
                corrupted: false,
            },
            Some(entry) => match entry.value {
                crate::state::models::DataValue::Value(bytes) => {
                    let parsed = near_sdk::serde_json::from_slice(&bytes);
                    EntryView {
                        requested_key,
                        full_key,
                        value: parsed.as_ref().ok().cloned(),
                        block_height: Some(U64(entry.block_height)),
                        deleted: false,
                        corrupted: parsed.is_err(),
                    }
                }
                crate::state::models::DataValue::Deleted(_) => EntryView {
                    requested_key,
                    full_key,
                    value: None,
                    block_height: Some(U64(entry.block_height)),
                    deleted: true,
                    corrupted: false,
                },
            },
        }
    }
}
