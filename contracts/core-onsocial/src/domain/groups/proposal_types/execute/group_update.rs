use near_sdk::{
    AccountId, env,
    serde_json::{self, Value, json},
};

use crate::constants::EVENT_TYPE_GROUP_UPDATE;
use crate::domain::groups::GroupStorage;
use crate::domain::groups::config::GroupConfig;
use crate::domain::groups::governance::VotingConfig;
use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::{SocialError, invalid_input};

use super::super::group_update_type::GroupUpdateType;
use super::super::types::ProposalType;

impl ProposalType {
    pub(super) fn execute_group_update(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        update_type: &str,
        changes: &Value,
        proposer: &AccountId,
    ) -> Result<(), SocialError> {
        let config_key = GroupStorage::group_config_path(group_id);

        let mut config = platform
            .storage_get(&config_key)
            .ok_or_else(|| invalid_input!("Group config not found"))?;

        let update_type = GroupUpdateType::parse(update_type)
            .ok_or_else(|| invalid_input!("Unknown update type"))?;

        match update_type {
            GroupUpdateType::Permissions | GroupUpdateType::Metadata => {
                if let Some(config_obj) = config.as_object_mut() {
                    let actual_changes = changes.get("changes").unwrap_or(changes);

                    if let Some(changes_obj) = actual_changes.as_object() {
                        for (key, value) in changes_obj {
                            if !matches!(key.as_str(), "owner" | "update_type" | "changes") {
                                config_obj.insert(key.clone(), value.clone());
                            }
                        }
                        // Invariant: member_driven groups must be private
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
                    let target_account = crate::validation::parse_account_id_str(
                        target,
                        invalid_input!("Invalid account ID"),
                    )?;
                    GroupStorage::remove_member_internal(
                        platform,
                        group_id,
                        &target_account,
                        proposer,
                        true,
                    )?;
                }
            }
            GroupUpdateType::Ban => {
                if let Some(target) = changes.get("target_user").and_then(|v| v.as_str()) {
                    let target_account = crate::validation::parse_account_id_str(
                        target,
                        invalid_input!("Invalid account ID"),
                    )?;
                    GroupStorage::add_to_blacklist_internal(
                        platform,
                        group_id,
                        &target_account,
                        proposer,
                        true,
                    )?;
                }
            }
            GroupUpdateType::Unban => {
                if let Some(target) = changes.get("target_user").and_then(|v| v.as_str()) {
                    let target_account = crate::validation::parse_account_id_str(
                        target,
                        invalid_input!("Invalid account ID"),
                    )?;
                    GroupStorage::remove_from_blacklist_internal(
                        platform,
                        group_id,
                        &target_account,
                        proposer,
                        true,
                    )?;
                }
            }
            GroupUpdateType::TransferOwnership => {
                if let Some(new_owner) = changes.get("new_owner").and_then(|v| v.as_str()) {
                    let new_owner_account = crate::validation::parse_account_id_str(
                        new_owner,
                        invalid_input!("Invalid account ID"),
                    )?;

                    if !GroupStorage::is_member(platform, group_id, &new_owner_account) {
                        return Err(invalid_input!(
                            "New owner is no longer a member of the group"
                        ));
                    }
                    if GroupStorage::is_blacklisted(platform, group_id, &new_owner_account) {
                        return Err(invalid_input!("New owner has been blacklisted"));
                    }

                    let transfer_config = platform
                        .storage_get(&config_key)
                        .ok_or_else(|| invalid_input!("Group config not found"))?;
                    let old_owner = GroupConfig::try_from_value(&transfer_config)?.owner;

                    GroupStorage::transfer_ownership_internal(
                        platform,
                        group_id,
                        &new_owner_account,
                        proposer,
                        true,
                    )?;

                    let remove_old_owner = changes
                        .get("remove_old_owner")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);

                    if remove_old_owner && old_owner != new_owner_account {
                        GroupStorage::remove_member_internal(
                            platform, group_id, &old_owner, proposer, true,
                        )?;
                    }

                    config = platform.storage_get(&config_key).ok_or_else(|| {
                        invalid_input!("Group config not found after ownership transfer")
                    })?;
                }
            }
        }

        // Invariant: member-driven groups must remain private
        let cfg = GroupConfig::try_from_value(&config)?;
        GroupStorage::assert_member_driven_private_invariant(cfg.member_driven, cfg.is_private)?;

        let config_needs_save = matches!(
            update_type,
            GroupUpdateType::Permissions | GroupUpdateType::Metadata
        );
        if config_needs_save {
            platform.storage_set(&config_key, &config)?;
        }

        let mut event_batch = EventBatch::new();
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "group_updated", proposer.clone())
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
        proposer: &AccountId,
    ) -> Result<(), SocialError> {
        let config_key = GroupStorage::group_config_path(group_id);

        let mut config = platform
            .storage_get(&config_key)
            .ok_or_else(|| invalid_input!("Group config not found"))?;

        let mut voting_config = config
            .get("voting_config")
            .and_then(|v| serde_json::from_value::<VotingConfig>(v.clone()).ok())
            .unwrap_or_default();

        if let Some(quorum_bps) = participation_quorum_bps {
            voting_config.participation_quorum_bps = quorum_bps;
        }
        if let Some(threshold_bps) = majority_threshold_bps {
            voting_config.majority_threshold_bps = threshold_bps;
        }
        if let Some(period) = voting_period {
            voting_config.voting_period = near_sdk::json_types::U64(period);
        }

        voting_config = voting_config.sanitized();

        if let Some(obj) = config.as_object_mut() {
            obj.insert("voting_config".to_string(), json!(voting_config));
            obj.insert(
                "voting_config_updated_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            );
        }

        platform.storage_set(&config_key, &config)?;

        let mut event_batch = EventBatch::new();
        EventBuilder::new(
            EVENT_TYPE_GROUP_UPDATE,
            "voting_config_changed",
            proposer.clone(),
        )
        .with_field("group_id", group_id)
        .with_field("proposal_id", proposal_id)
        .with_field("participation_quorum_bps", participation_quorum_bps)
        .with_field("majority_threshold_bps", majority_threshold_bps)
        .with_field("voting_period", voting_period.map(|p| p.to_string()))
        .with_field(
            "effective_participation_quorum_bps",
            voting_config.participation_quorum_bps,
        )
        .with_field(
            "effective_majority_threshold_bps",
            voting_config.majority_threshold_bps,
        )
        .with_field(
            "effective_voting_period",
            voting_config.voting_period.0.to_string(),
        )
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
        proposer: &AccountId,
    ) -> Result<(), SocialError> {
        let block_height = env::block_height();
        let timestamp = env::block_timestamp();
        let execution_key = format!("groups/{}/executions/{}", group_id, proposal_id);

        let execution_data = json!({
            "proposal_id": proposal_id,
            "title": title,
            "description": description,
            "custom_data": custom_data,
            "executed_at": timestamp.to_string(),
            "block_height": block_height.to_string()
        });

        platform.storage_set(&execution_key, &execution_data)?;

        let mut event_batch = EventBatch::new();
        EventBuilder::new(
            EVENT_TYPE_GROUP_UPDATE,
            "custom_proposal_executed",
            proposer.clone(),
        )
        .with_path(&execution_key)
        .with_value(execution_data.clone())
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
