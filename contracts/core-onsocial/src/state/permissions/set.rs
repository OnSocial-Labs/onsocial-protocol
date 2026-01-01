use near_sdk::{env, AccountId, PublicKey};

use crate::events::{EventBatch, EventBuilder};
use crate::groups::config::GroupConfig;
use crate::state::models::SocialPlatform;
use crate::validation::Path;
use crate::SocialError;

impl SocialPlatform {
    pub fn set_permission(
        &mut self,
        grantee: AccountId,
        path: String,
        level: u8,
        expires_at: Option<u64>,
        caller: &AccountId,
        external_batch: Option<&mut EventBatch>,
        attached_balance: Option<&mut u128>,
    ) -> Result<(), SocialError> {
        // Track if we need to emit at the end (when no external batch provided)
        let should_emit = external_batch.is_none();
        let mut local_batch = EventBatch::new();
        let event_batch: &mut EventBatch = external_batch.unwrap_or(&mut local_batch);

        if level != 0 && !crate::groups::kv_permissions::is_valid_permission_level(level, false) {
            return Err(crate::invalid_input!("Invalid permission level"));
        }

        // Canonicalize and validate.
        let path_obj = Path::new(caller, &path, self)?;
        let full_path = path_obj.full_path().to_string();

        let group_path_info = crate::groups::kv_permissions::classify_group_path(&full_path);
        let group_id_from_path = group_path_info.as_ref().map(|info| info.group_id.as_str());

        let (path_identifier, group_owner, is_member_driven_group): (String, Option<String>, bool) =
            if let Some(group_id) = group_id_from_path.as_deref() {
                let config_path = format!("groups/{}/config", group_id);
                let config = self.storage_get(&config_path).ok_or_else(|| {
                    crate::unauthorized!(
                        "set_permission",
                        &format!("group_not_found={}, caller={}", group_id, caller.as_str())
                    )
                })?;
                let cfg = GroupConfig::try_from_value(&config).map_err(|_| {
                    crate::unauthorized!(
                        "set_permission",
                        &format!("group_not_found={}, caller={}", group_id, caller.as_str())
                    )
                })?;
                (
                    group_id.to_string(),
                    Some(cfg.owner.to_string()),
                    cfg.member_driven,
                )
            } else {
                (
                    crate::groups::kv_permissions::extract_path_owner(self, &full_path)
                        .unwrap_or_else(|| caller.as_str().to_string()),
                    None,
                    false,
                )
            };

        let is_authorized = if group_id_from_path.is_some() {
            group_owner
                .as_deref()
                .is_some_and(|owner| owner == caller.as_str())
        } else {
            path_identifier == caller.as_str()
        };

        // MANAGE can delegate downwards (cannot grant MANAGE itself).
        let is_manage_delegation = group_id_from_path.is_some()
            && crate::groups::kv_permissions::can_manage(
                self,
                &path_identifier,
                caller.as_str(),
                &full_path,
            )
            && level != crate::groups::kv_permissions::MANAGE;

        if !is_authorized && !is_manage_delegation {
            return Err(crate::unauthorized!(
                "set_permission",
                &format!("path_owner={}, caller={}", path_identifier, caller.as_str())
            ));
        }

        // Member-driven groups: direct permission changes are restricted.
        if group_id_from_path.is_some() && is_member_driven_group {
            if is_authorized {
                return Err(crate::invalid_input!(
                    "Member-driven groups require governance proposals for permission changes"
                ));
            }

            if !is_manage_delegation {
                return Err(crate::invalid_input!(
                    "Member-driven groups require governance proposals for permission changes"
                ));
            }

            let group_id = &path_identifier;

            let is_group_root = group_path_info.as_ref().is_some_and(|info| {
                info.kind == crate::groups::kv_permissions::GroupPathKind::Root
            });

            if is_group_root {
                return Err(crate::invalid_input!(
                    "Cannot delegate permissions on group root in member-driven groups"
                ));
            }

            let is_group_config_namespace = group_path_info.as_ref().is_some_and(|info| {
                info.kind == crate::groups::kv_permissions::GroupPathKind::Config
            });

            if is_group_config_namespace {
                return Err(crate::invalid_input!(
                    "Cannot delegate permissions on group config in member-driven groups"
                ));
            }

            // Delegated grants must expire.
            if level != 0 {
                let now = env::block_timestamp();
                let exp = expires_at.ok_or_else(|| {
                    crate::invalid_input!(
                        "expires_at is required for delegated permission grants in member-driven groups"
                    )
                })?;
                if exp == 0 || exp <= now {
                    return Err(crate::invalid_input!(
                        "expires_at must be a future timestamp for delegated grants in member-driven groups"
                    ));
                }
            }

            if level != 0 && !crate::groups::core::GroupStorage::is_member(self, group_id, &grantee) {
                return Err(crate::invalid_input!(
                    "Delegated permission grants are only allowed to existing members"
                ));
            }
        }

        if level == 0 {
            crate::groups::kv_permissions::revoke_permissions(
                self,
                caller,
                &grantee,
                &full_path,
                event_batch,
            )?;
        } else {
            crate::groups::kv_permissions::grant_permissions(
                self,
                caller,
                &grantee,
                &full_path,
                level,
                expires_at,
                event_batch,
                attached_balance,
            )?;
        }

        // Sync member metadata for group-root permissions.
        if let Some(group_id) = group_id_from_path.as_deref() {
            let is_group_root = group_path_info.as_ref().is_some_and(|info| {
                info.kind == crate::groups::kv_permissions::GroupPathKind::Root
            });

            if is_group_root {
                let member_key = crate::groups::core::GroupStorage::group_member_path(
                    group_id,
                    grantee.as_str(),
                );
                if let Some(mut member_data) = self.storage_get(&member_key) {
                    if let Some(obj) = member_data.as_object_mut() {
                        obj.insert("level".to_string(), near_sdk::serde_json::json!(level));
                        obj.insert(
                            "updated_at".to_string(),
                            near_sdk::serde_json::Value::String(
                                near_sdk::env::block_timestamp().to_string(),
                            ),
                        );
                        obj.insert(
                            "updated_by".to_string(),
                            near_sdk::serde_json::json!(caller.to_string()),
                        );
                    }
                    self.storage_set(&member_key, &member_data)?;

                    // Emit a group-level event for the member metadata update.
                    EventBuilder::new(
                        crate::constants::EVENT_TYPE_GROUP_UPDATE,
                        "permission_changed",
                        caller.clone(),
                    )
                    .with_field("group_id", group_id.to_string())
                    .with_target(&grantee)
                    .with_field("level", level)
                    .with_field("via", "direct_api")
                    .with_path(&member_key)
                    .with_value(member_data)
                    .emit(event_batch);
                }
            }
        }

        // Emit batch if we created it locally
        if should_emit {
            local_batch.emit()?;
        }

        Ok(())
    }

    /// Grant (`level > 0`) or revoke (`level == 0`) key permissions at a path.
    pub fn set_key_permission(
        &mut self,
        public_key: PublicKey,
        path: String,
        level: u8,
        expires_at: Option<u64>,
        caller: &AccountId,
        external_batch: Option<&mut EventBatch>,
        attached_balance: Option<&mut u128>,
    ) -> Result<(), SocialError> {
        // Track if we need to emit at the end (when no external batch provided)
        let should_emit = external_batch.is_none();
        let mut local_batch = EventBatch::new();
        let event_batch: &mut EventBatch = external_batch.unwrap_or(&mut local_batch);

        if level != 0 && !crate::groups::kv_permissions::is_valid_permission_level(level, false) {
            return Err(crate::invalid_input!("Invalid permission level"));
        }

        // Empty path represents root.
        let full_path = if path.is_empty() {
            String::new()
        } else {
            Path::new(caller, &path, self)?.full_path().to_string()
        };

        if level == 0 {
            crate::groups::kv_permissions::revoke_permissions_for_key(
                self,
                caller,
                &public_key,
                &full_path,
                event_batch,
            )?;
        } else {
            crate::groups::kv_permissions::grant_permissions_to_key(
                self,
                caller,
                &public_key,
                &full_path,
                level,
                expires_at,
                event_batch,
                attached_balance,
            )?;
        }

        // Emit batch if we created it locally
        if should_emit {
            local_batch.emit()?;
        }

        Ok(())
    }
}
