use near_sdk::json_types::U64;
use near_sdk::store::IterableSet;
use near_sdk::{AccountId, env};

use crate::events;
use crate::validation::validate_app_id;
use crate::*;

use super::types::{PublishRequest, PublishRequestStatus, PublishRequestView};

const NOTE_MAX_CHARS: usize = 280;

fn publish_request_key(app_id: &str, account_id: &AccountId) -> String {
    format!("{app_id}/{account_id}")
}

fn normalize_note(message: Option<String>) -> Result<Option<String>, MarketplaceError> {
    let Some(raw) = message else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.chars().count() > NOTE_MAX_CHARS {
        return Err(MarketplaceError::InvalidInput("Note is too long".into()));
    }
    Ok(Some(trimmed.to_string()))
}

fn to_view(account_id: &AccountId, row: &PublishRequest) -> PublishRequestView {
    PublishRequestView {
        account_id: account_id.clone(),
        status: row.status.as_str().to_string(),
        message: row.message.clone(),
        requested_at: U64(row.requested_at),
        decided_by: row.decided_by.clone(),
    }
}

#[near]
impl Contract {
    fn load_pool(&self, app_id: &str) -> Result<AppPool, MarketplaceError> {
        self.app_pools.get(app_id).cloned().ok_or_else(|| {
            MarketplaceError::NotFound(format!("App pool not found: {app_id}"))
        })
    }

    fn require_staff(&self, app_id: &str, actor_id: &AccountId) -> Result<(), MarketplaceError> {
        validate_app_id(app_id)?;
        let pool = self.load_pool(app_id)?;
        if !Self::is_app_authority(&pool, actor_id) {
            return Err(MarketplaceError::Unauthorized(
                "Only the hub owner or a moderator can review requests".into(),
            ));
        }
        Ok(())
    }

    fn load_request(
        &self,
        app_id: &str,
        account_id: &AccountId,
    ) -> Result<PublishRequest, MarketplaceError> {
        self.publish_requests
            .get(&publish_request_key(app_id, account_id))
            .cloned()
            .ok_or_else(|| {
                MarketplaceError::NotFound("No publish request from this account".into())
            })
    }

    fn remember_requester(&mut self, app_id: &str, account_id: &AccountId) {
        let app_key = app_id.to_string();
        if !self.publish_request_accounts.contains_key(&app_key) {
            self.publish_request_accounts.insert(
                app_key.clone(),
                IterableSet::new(StorageKey::PublishRequestAccountsInner {
                    app_id_hash: env::sha256(app_id.as_bytes()),
                }),
            );
        }
        self.publish_request_accounts
            .get_mut(&app_key)
            .unwrap()
            .insert(account_id.clone());
    }

    fn forget_requester(&mut self, app_id: &str, account_id: &AccountId) {
        let app_key = app_id.to_string();
        if let Some(set) = self.publish_request_accounts.get_mut(&app_key) {
            set.remove(account_id);
        }
    }

    /// Drop a publish-request row. Used when staff approve the account.
    pub(crate) fn clear_publish_request(
        &mut self,
        actor_id: &AccountId,
        app_id: &str,
        account_id: &AccountId,
    ) {
        let key = publish_request_key(app_id, account_id);
        if self.publish_requests.remove(&key).is_some() {
            self.forget_requester(app_id, account_id);
            events::emit_publish_request_removed(actor_id, app_id, account_id);
        }
    }

    pub(crate) fn request_publish(
        &mut self,
        actor_id: &AccountId,
        app_id: &str,
        message: Option<String>,
    ) -> Result<(), MarketplaceError> {
        validate_app_id(app_id)?;
        let note = normalize_note(message)?;
        let pool = self.load_pool(app_id)?;
        if pool.effective_creator_access() != CreatorAccess::Approval {
            return Err(MarketplaceError::InvalidState(
                "Publish requests are only open on approval hubs".into(),
            ));
        }
        if Self::is_app_authority(&pool, actor_id) {
            return Err(MarketplaceError::InvalidState(
                "Hub staff already publish here".into(),
            ));
        }
        if pool.is_approved_creator(actor_id) {
            return Err(MarketplaceError::InvalidState(
                "You are already an approved creator".into(),
            ));
        }

        let key = publish_request_key(app_id, actor_id);
        if let Some(existing) = self.publish_requests.get(&key) {
            match existing.status {
                PublishRequestStatus::Blocked => {
                    return Err(MarketplaceError::InvalidState(
                        "You cannot request access to this hub".into(),
                    ));
                }
                PublishRequestStatus::Pending => {
                    return Err(MarketplaceError::InvalidState(
                        "Publish request already pending".into(),
                    ));
                }
                PublishRequestStatus::Declined => {}
            }
        }

        let requested_at = env::block_timestamp();
        self.publish_requests.insert(
            key,
            PublishRequest {
                status: PublishRequestStatus::Pending,
                message: note.clone(),
                requested_at,
                decided_by: None,
            },
        );
        self.remember_requester(app_id, actor_id);
        events::emit_publish_requested(actor_id, app_id, actor_id, note.as_deref(), requested_at);
        Ok(())
    }

    pub(crate) fn cancel_publish_request(
        &mut self,
        actor_id: &AccountId,
        app_id: &str,
    ) -> Result<(), MarketplaceError> {
        validate_app_id(app_id)?;
        let row = self.load_request(app_id, actor_id)?;
        if row.status != PublishRequestStatus::Pending {
            return Err(MarketplaceError::InvalidState(
                "No pending publish request".into(),
            ));
        }
        self.clear_publish_request(actor_id, app_id, actor_id);
        Ok(())
    }

    pub(crate) fn decline_publish_request(
        &mut self,
        actor_id: &AccountId,
        app_id: &str,
        account_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        self.require_staff(app_id, actor_id)?;
        let mut row = self.load_request(app_id, account_id)?;
        if row.status != PublishRequestStatus::Pending {
            return Err(MarketplaceError::InvalidState(
                "No pending publish request".into(),
            ));
        }
        row.status = PublishRequestStatus::Declined;
        row.decided_by = Some(actor_id.clone());
        self.publish_requests
            .insert(publish_request_key(app_id, account_id), row.clone());
        events::emit_publish_request_declined(actor_id, app_id, account_id, &row);
        Ok(())
    }

    pub(crate) fn block_publish_requester(
        &mut self,
        actor_id: &AccountId,
        app_id: &str,
        account_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        self.require_staff(app_id, actor_id)?;
        let mut row = self.load_request(app_id, account_id)?;
        if !matches!(
            row.status,
            PublishRequestStatus::Pending | PublishRequestStatus::Declined
        ) {
            return Err(MarketplaceError::InvalidState(
                "This account is not waiting or declined".into(),
            ));
        }
        row.status = PublishRequestStatus::Blocked;
        row.decided_by = Some(actor_id.clone());
        self.publish_requests
            .insert(publish_request_key(app_id, account_id), row.clone());
        events::emit_publish_requester_blocked(actor_id, app_id, account_id, &row);
        Ok(())
    }

    pub(crate) fn unblock_publish_requester(
        &mut self,
        actor_id: &AccountId,
        app_id: &str,
        account_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        self.require_staff(app_id, actor_id)?;
        let row = self.load_request(app_id, account_id)?;
        if row.status != PublishRequestStatus::Blocked {
            return Err(MarketplaceError::InvalidState(
                "This account is not blocked".into(),
            ));
        }
        self.clear_publish_request(actor_id, app_id, account_id);
        Ok(())
    }

    pub fn get_publish_request(
        &self,
        app_id: String,
        account_id: AccountId,
    ) -> Option<PublishRequestView> {
        let row = self
            .publish_requests
            .get(&publish_request_key(&app_id, &account_id))?;
        Some(to_view(&account_id, row))
    }

    pub fn get_publish_requests(
        &self,
        app_id: String,
        status: Option<String>,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<PublishRequestView> {
        let filter = match status.as_deref() {
            None => None,
            Some("pending") => Some(PublishRequestStatus::Pending),
            Some("declined") => Some(PublishRequestStatus::Declined),
            Some("blocked") => Some(PublishRequestStatus::Blocked),
            Some(_) => env::panic_str("Unknown publish request status"),
        };
        let ids: Vec<AccountId> = self
            .publish_request_accounts
            .get(&app_id)
            .map(|set| set.iter().cloned().collect())
            .unwrap_or_default();
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        let mut matched = 0usize;
        let mut out = Vec::new();
        for account_id in ids {
            let Some(row) = self
                .publish_requests
                .get(&publish_request_key(&app_id, &account_id))
            else {
                continue;
            };
            if filter.is_some_and(|want| row.status != want) {
                continue;
            }
            if matched >= start && out.len() < limit {
                out.push(to_view(&account_id, row));
            }
            matched += 1;
            if out.len() >= limit {
                break;
            }
        }
        out
    }
}
