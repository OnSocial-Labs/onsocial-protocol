use crate::*;

impl Contract {
    pub(crate) fn track_app_creator(&mut self, app_id: &AccountId, creator_id: &AccountId) {
        let key = format!("{}:{}", app_id, creator_id);
        let count = self
            .app_creator_collection_counts
            .get(&key)
            .copied()
            .unwrap_or(0);
        self.app_creator_collection_counts
            .insert(key, count.saturating_add(1));

        if count == 0 {
            if !self.app_creators.contains_key(app_id) {
                self.app_creators.insert(
                    app_id.clone(),
                    IterableSet::new(StorageKey::AppCreatorsInner {
                        app_id_hash: env::sha256(app_id.as_bytes()),
                    }),
                );
            }
            self.app_creators
                .get_mut(app_id)
                .unwrap()
                .insert(creator_id.clone());
        }
    }

    pub(crate) fn untrack_app_creator(&mut self, app_id: &AccountId, creator_id: &AccountId) {
        let key = format!("{}:{}", app_id, creator_id);
        let count = self
            .app_creator_collection_counts
            .get(&key)
            .copied()
            .unwrap_or(0);
        if count <= 1 {
            self.app_creator_collection_counts.remove(&key);
            if let Some(set) = self.app_creators.get_mut(app_id) {
                set.remove(creator_id);
                if set.is_empty() {
                    self.app_creators.remove(app_id);
                }
            }
        } else {
            self.app_creator_collection_counts.insert(key, count - 1);
        }
    }

    pub(crate) fn track_app_owner(&mut self, app_id: &AccountId, owner_id: &AccountId) {
        let key = format!("{}:{}", app_id, owner_id);
        let count = self.app_owner_token_counts.get(&key).copied().unwrap_or(0);
        self.app_owner_token_counts
            .insert(key, count.saturating_add(1));

        if count == 0 {
            if !self.app_owners.contains_key(app_id) {
                self.app_owners.insert(
                    app_id.clone(),
                    IterableSet::new(StorageKey::AppOwnersInner {
                        app_id_hash: env::sha256(app_id.as_bytes()),
                    }),
                );
            }
            self.app_owners
                .get_mut(app_id)
                .unwrap()
                .insert(owner_id.clone());
        }
    }

    pub(crate) fn untrack_app_owner(&mut self, app_id: &AccountId, owner_id: &AccountId) {
        let key = format!("{}:{}", app_id, owner_id);
        let count = self.app_owner_token_counts.get(&key).copied().unwrap_or(0);
        if count <= 1 {
            self.app_owner_token_counts.remove(&key);
            if let Some(set) = self.app_owners.get_mut(app_id) {
                set.remove(owner_id);
                if set.is_empty() {
                    self.app_owners.remove(app_id);
                }
            }
        } else {
            self.app_owner_token_counts.insert(key, count - 1);
        }
    }
}
