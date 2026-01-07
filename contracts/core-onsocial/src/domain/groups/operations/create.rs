use near_sdk::{
    env,
    serde_json::{self, json, Value},
    AccountId,
};

use crate::constants::{
    DEFAULT_VOTING_MAJORITY_THRESHOLD_BPS,
    DEFAULT_VOTING_PARTICIPATION_QUORUM_BPS,
    DEFAULT_VOTING_PERIOD,
};
use crate::events::{EventBatch, EventBuilder};
use crate::domain::groups::config::GroupConfig;
use crate::state::models::SocialPlatform;
use crate::{invalid_input, SocialError};

impl crate::domain::groups::core::GroupStorage {
    pub(crate) fn assert_member_driven_private_invariant(
        is_member_driven: bool,
        is_private: Option<bool>,
    ) -> Result<(), SocialError> {
        if !is_member_driven {
            return Ok(());
        }

        match is_private {
            Some(true) | None => Ok(()),
            Some(false) => Err(invalid_input!(
                "Member-driven groups must be private to maintain democratic control over membership"
            )),
        }
    }

    pub(super) fn enforce_member_driven_groups_private(config: &mut Value) -> Result<(), SocialError> {
        let cfg = GroupConfig::try_from_value(config)?;
        let is_member_driven = cfg.member_driven;
        let is_private = cfg.is_private;
        Self::assert_member_driven_private_invariant(is_member_driven, is_private)?;

        if is_member_driven && is_private.is_none() {
            if let Some(obj) = config.as_object_mut() {
                obj.insert("is_private".to_string(), Value::Bool(true));
            }
        }

        Ok(())
    }

    pub fn create_group(
        platform: &mut SocialPlatform,
        group_id: &str,
        owner: &AccountId,
        mut config: Value,
    ) -> Result<(), SocialError> {
        let config_path = Self::group_config_path(group_id);

        if platform.storage_get(&config_path).is_some() {
            return Err(invalid_input!("Group already exists"));
        }

        if let Some(obj) = config.as_object_mut() {
            obj.insert("owner".to_string(), Value::String(owner.to_string()));
            obj.insert(
                "created_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            );
            if !obj.contains_key("member_driven") {
                obj.insert("member_driven".to_string(), Value::Bool(false));
            }
            // Member-driven groups default to private
            if !obj.contains_key("is_private") {
                let is_member_driven = obj
                    .get("member_driven")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                obj.insert("is_private".to_string(), Value::Bool(is_member_driven));
            }
            if !obj.contains_key("voting_config") {
                let default_voting_config = json!({
                    "participation_quorum_bps": DEFAULT_VOTING_PARTICIPATION_QUORUM_BPS,
                    "majority_threshold_bps": DEFAULT_VOTING_MAJORITY_THRESHOLD_BPS,
                    "voting_period": DEFAULT_VOTING_PERIOD.to_string()
                });
                obj.insert("voting_config".to_string(), default_voting_config);
            }
        }

        Self::enforce_member_driven_groups_private(&mut config)?;

        platform.storage_set(&config_path, &config)?;

        let member_path = Self::group_member_path(group_id, owner.as_str());
        let nonce_path = format!("groups/{}/member_nonces/{}", group_id, owner.as_str());
        platform.storage_set(&nonce_path, &Value::Number(1u64.into()))?;
        let member_data = Value::Object(serde_json::Map::from_iter([
            ("level".to_string(), Value::Number(255.into())), // Full permissions
            ("granted_by".to_string(), Value::String("system".to_string())),
            (
                "joined_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            ),
            ("is_creator".to_string(), Value::Bool(true)),
        ]));
        platform.storage_set(&member_path, &member_data)?;

        let stats_path = Self::group_stats_path(group_id);
        let initial_stats = json!({
            "total_members": 1,
            "total_join_requests": 0,
            "created_at": env::block_timestamp().to_string(),
            "last_updated": env::block_timestamp().to_string()
        });
        platform.storage_set(&stats_path, &initial_stats)?;

        let mut event_batch = EventBatch::new();
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "create_group",
            owner.clone(),
        )
        .with_field("group_id", group_id)
        .with_path(&config_path)
        .with_value(config)
        .emit(&mut event_batch);

        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "add_member",
            owner.clone(),
        )
        .with_target(owner)
        .with_path(&member_path)
        .with_value(member_data)
        .with_field("member_nonce", 1u64)
        .with_field("member_nonce_path", nonce_path)
        .emit(&mut event_batch);

        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "member_nonce_updated",
            owner.clone(),
        )
        .with_target(owner)
        .with_path(&format!("groups/{}/member_nonces/{}", group_id, owner.as_str()))
        .with_value(Value::Number(1u64.into()))
        .emit(&mut event_batch);

        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "stats_updated",
            owner.clone(),
        )
        .with_field("group_id", group_id)
        .with_path(&stats_path)
        .with_value(initial_stats)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
