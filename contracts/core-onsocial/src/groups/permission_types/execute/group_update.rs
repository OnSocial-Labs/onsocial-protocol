use near_sdk::{
    AccountId,
    env,
    serde_json::{self, json, Value},
};

use crate::constants::EVENT_TYPE_GROUP_UPDATE;
use crate::events::{EventBatch, EventBuilder};
use crate::groups::config::GroupConfig;
use crate::groups::GroupStorage;
use crate::state::models::SocialPlatform;
use crate::{invalid_input, SocialError};

use super::super::types::ProposalType;
use super::super::group_update_type::GroupUpdateType;

impl ProposalType {
    pub(super) fn execute_group_update(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        update_type: &str,
        changes: &Value,
        executor: &AccountId,
    ) -> Result<(), SocialError> {
        let config_key = GroupStorage::group_config_path(group_id);

        let mut config = platform
            .storage_get(&config_key)
            .ok_or_else(|| invalid_input!("Group config not found"))?;

        let update_type = GroupUpdateType::parse(update_type)
            .ok_or_else(|| invalid_input!("Unknown update type"))?;

        // Apply changes based on update type
        match update_type {
            GroupUpdateType::Permissions | GroupUpdateType::Metadata => {
                if let Some(config_obj) = config.as_object_mut() {
                    // Extract the nested "changes" field from the proposal data
                    let actual_changes = changes.get("changes").unwrap_or(changes);

                    if let Some(changes_obj) = actual_changes.as_object() {
                        for (key, value) in changes_obj {
                            if !matches!(key.as_str(), "owner" | "update_type" | "changes") {
                                config_obj.insert(key.clone(), value.clone());
                            }
                        }
                        // If member_driven is being changed to true, automatically set is_private to true
                        if let (Some(member_driven_val), true) = (
                            changes_obj.get("member_driven"),
                            changes_obj.contains_key("member_driven"),
                        ) {
                            if member_driven_val.as_bool() == Some(true) {
                                config_obj.insert("is_private".to_string(), Value::Bool(true));
                            }
                        }
                    }
                }
            }
            GroupUpdateType::RemoveMember => {
                if let Some(target) = changes.get("target_user").and_then(|v| v.as_str()) {
                    let target_account =
                        crate::validation::parse_account_id_str(target, invalid_input!("Invalid account ID"))?;
                    GroupStorage::remove_member_internal(
                        platform,
                        group_id,
                        &target_account,
                        executor,
                        true,
                    )?;
                }
            }
            GroupUpdateType::Ban => {
                if let Some(target) = changes.get("target_user").and_then(|v| v.as_str()) {
                    let target_account =
                        crate::validation::parse_account_id_str(target, invalid_input!("Invalid account ID"))?;
                    GroupStorage::add_to_blacklist_internal(
                        platform,
                        group_id,
                        &target_account,
                        executor,
                        true,
                    )?;
                }
            }
            GroupUpdateType::Unban => {
                if let Some(target) = changes.get("target_user").and_then(|v| v.as_str()) {
                    let target_account =
                        crate::validation::parse_account_id_str(target, invalid_input!("Invalid account ID"))?;
                    GroupStorage::remove_from_blacklist_internal(
                        platform,
                        group_id,
                        &target_account,
                        executor,
                        true,
                    )?;
                }
            }
            GroupUpdateType::Privacy => {
                if let Some(is_private) = changes.get("is_private").and_then(|v| v.as_bool()) {
                    GroupStorage::set_group_privacy(platform, group_id, executor, is_private)?;
                }
            }
            GroupUpdateType::TransferOwnership => {
                if let Some(new_owner) = changes.get("new_owner").and_then(|v| v.as_str()) {
                    let new_owner_account =
                        crate::validation::parse_account_id_str(new_owner, invalid_input!("Invalid account ID"))?;
                    // Get the current owner before transfer
                    let transfer_config = platform
                        .storage_get(&config_key)
                        .ok_or_else(|| invalid_input!("Group config not found"))?;
                    let old_owner = GroupConfig::try_from_value(&transfer_config)?.owner;

                    // Transfer ownership (from governance, so bypass member-driven restriction)
                    // NOTE: This function saves the updated config internally
                    GroupStorage::transfer_ownership_internal(
                        platform,
                        group_id,
                        &new_owner_account,
                        true,
                    )?;

                    // Check if we should remove the old owner (consistent with direct transfers)
                    let remove_old_owner = changes
                        .get("remove_old_owner")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);

                    // Automatically remove the old owner from the group if requested
                    if remove_old_owner && old_owner != new_owner_account {
                        GroupStorage::remove_member_internal(
                            platform,
                            group_id,
                            &old_owner,
                            executor,
                            true,
                        )?;
                    }

                    // Reload config after transfer_ownership_internal modified it
                    config = platform
                        .storage_get(&config_key)
                        .ok_or_else(|| invalid_input!(
                            "Group config not found after ownership transfer"
                        ))?;
                }
            }
        }

        // Governance execution must preserve core invariants regardless of update_type.
        // In particular: member-driven groups must always remain private.
        let cfg = GroupConfig::try_from_value(&config)?;
        GroupStorage::assert_member_driven_private_invariant(cfg.member_driven, cfg.is_private)?;

        platform.storage_set(&config_key, &config)?;

        // Emit event
        let mut event_batch = EventBatch::new();
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "group_updated", executor.clone())
            .with_field("group_id", group_id)
            .with_field("proposal_id", proposal_id)
            .with_field("update_type", update_type.as_str())
            .with_field("changes", changes.clone())
            .with_path(&config_key)
            .with_value(config.clone())
            .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }

    pub(super) fn execute_voting_config_change(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        participation_quorum_bps: Option<u16>,
        majority_threshold_bps: Option<u16>,
        voting_period: Option<u64>,
        executor: &AccountId,
    ) -> Result<(), SocialError> {
        let config_key = GroupStorage::group_config_path(group_id);

        let mut config = platform
            .storage_get(&config_key)
            .ok_or_else(|| invalid_input!("Group config not found"))?;

        // Get or create voting_config object
        let mut voting_config = config
            .get("voting_config")
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_else(serde_json::Map::new);

        // Update the specified parameters
        if let Some(quorum_bps) = participation_quorum_bps {
            voting_config.insert("participation_quorum_bps".to_string(), json!(quorum_bps));
        }
        if let Some(threshold_bps) = majority_threshold_bps {
            voting_config.insert("majority_threshold_bps".to_string(), json!(threshold_bps));
        }
        if let Some(period) = voting_period {
            voting_config.insert("voting_period".to_string(), Value::String(period.to_string()));
        }

        // Update the config with new voting config
        if let Some(obj) = config.as_object_mut() {
            obj.insert("voting_config".to_string(), json!(voting_config));
            obj.insert(
                "voting_config_updated_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            );
            obj.insert("voting_config_updated_by".to_string(), json!(executor.to_string()));
        }

        platform.storage_set(&config_key, &config)?;

        // Emit event
        let mut event_batch = EventBatch::new();
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "voting_config_changed", executor.clone())
            .with_field("group_id", group_id)
            .with_field("proposal_id", proposal_id)
            .with_field("participation_quorum_bps", participation_quorum_bps)
            .with_field("majority_threshold_bps", majority_threshold_bps)
            .with_field("voting_period", voting_period.map(|p| p.to_string()))
            .with_path(&config_key)
            .with_value(config)
            .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }

    pub(super) fn execute_custom_proposal(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        title: &str,
        description: &str,
        custom_data: &Value,
        executor: &AccountId,
    ) -> Result<(), SocialError> {
        // Cache block_height and timestamp for execution metadata
        let block_height = env::block_height();
        let timestamp = env::block_timestamp();

        // Professional governance pattern: Use proposal_id as primary key for direct traceability
        let execution_key = format!("groups/{}/executions/{}", group_id, proposal_id);

        let execution_data = json!({
            "proposal_id": proposal_id,
            "title": title,
            "description": description,
            "custom_data": custom_data,
            "executed_by": executor,
            "executed_at": timestamp.to_string(),
            "block_height": block_height.to_string()
        });

        platform.storage_set(&execution_key, &execution_data)?;

        // Emit event
        let mut event_batch = EventBatch::new();
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "custom_proposal_executed", executor.clone())
            .with_path(&execution_key)
            .with_value(execution_data.clone())
            .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
