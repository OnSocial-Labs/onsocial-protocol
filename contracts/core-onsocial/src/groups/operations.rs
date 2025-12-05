// --- Group Operations Module ---
// CRUD operations for groups (create, update, transfer, stats)

use near_sdk::{AccountId, env, serde_json::{self, json, Value}};
use crate::events::{EventBatch, EventBuilder, EventConfig};
use crate::state::models::SocialPlatform;
use crate::constants::{VOTING_PARTICIPATION_QUORUM, VOTING_MAJORITY_THRESHOLD, DEFAULT_VOTING_PERIOD};
use crate::{invalid_input, permission_denied, SocialError};

impl crate::groups::core::GroupStorage {
    /// Create a new group
    pub fn create_group(
        platform: &mut SocialPlatform,
        group_id: &str,
        owner: &AccountId,
        config: &Value,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // Check if group already exists using normalized path
        let config_path = Self::group_config_path(group_id);

        if platform.storage_get(&config_path).is_some() {
            return Err(invalid_input!("Group already exists"));
        }

        // Create group config
        let mut group_config = config.clone();
        if let Some(obj) = group_config.as_object_mut() {
            obj.insert("owner".to_string(), Value::String(owner.to_string()));
            obj.insert("created_at".to_string(), Value::Number(env::block_timestamp().into()));
            obj.insert("is_active".to_string(), Value::Bool(true));
            // Default to public group (no approval required) if not specified
            if !obj.contains_key("is_private") {
                obj.insert("is_private".to_string(), Value::Bool(false));
            }
            // Default to traditional group (not member-driven) if not specified
            if !obj.contains_key("member_driven") {
                obj.insert("member_driven".to_string(), Value::Bool(false));
            }
            // Set default voting config if not provided
            if !obj.contains_key("voting_config") {
                let default_voting_config = json!({
                    "participation_quorum": VOTING_PARTICIPATION_QUORUM,
                    "majority_threshold": VOTING_MAJORITY_THRESHOLD,
                    "voting_period": DEFAULT_VOTING_PERIOD
                });
                obj.insert("voting_config".to_string(), default_voting_config);
            }
        }

        // Store group config using normalized path (reuse existing path)
        platform.storage_set(&config_path, &group_config)?;

        // Add to owner's group ownership index using normalized path
        let ownership_path = format!("{}/groups/{}", owner.as_str(), group_id);
        platform.storage_set(&ownership_path, &Value::Bool(true))?;

        // Automatically add the creator as a member with full permissions
        let member_path = Self::group_member_path(group_id, owner.as_str());
        let member_data = Value::Object(serde_json::Map::from_iter([
            ("permission_flags".to_string(), Value::Number(255.into())), // Full permissions
            ("granted_by".to_string(), Value::String("system".to_string())), // System-granted
            ("joined_at".to_string(), Value::Number(env::block_timestamp().into())),
            ("is_creator".to_string(), Value::Bool(true)),
        ]));
        platform.storage_set(&member_path, &member_data)?;

        // Initialize group stats with creator as first member
        let stats_path = Self::group_stats_path(group_id);
        let initial_stats = json!({
            "total_members": 1,
            "total_join_requests": 0,
            "created_at": env::block_timestamp(),
            "last_updated": env::block_timestamp()
        });
        platform.storage_set(&stats_path, &initial_stats)?;

        // Emit event (optimized: avoid unnecessary clones)
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "create_group", owner.clone())
                .with_path(&config_path)  // Reuse existing path
                .with_value(group_config)  // Move instead of clone since we don't need it anymore
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Set group privacy (private/public) - owner only
    pub fn set_group_privacy(
        platform: &mut SocialPlatform,
        group_id: &str,
        owner_id: &AccountId,
        is_private: bool,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // Verify caller is the owner
        if !Self::is_owner(platform, group_id, owner_id) {
            return Err(permission_denied!("set_group_privacy", &format!("groups/{}/config", group_id)));
        }

        // Get current group config
        let config_path = format!("groups/{}/config", group_id);
        let config_data = match platform.storage_get(&config_path) {
            Some(data) => data,
            None => return Err(invalid_input!("Group not found")),
        };

        // Check if this is a member-driven group
        let is_member_driven = config_data.get("member_driven")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        // Member-driven groups must always remain private (require proposals for membership changes)
        if is_member_driven && !is_private {
            return Err(invalid_input!("Member-driven groups cannot be set to public - they must remain private to maintain democratic control over membership"));
        }

        // Check if privacy is actually changing
        let current_privacy = config_data.get("is_private")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if current_privacy == is_private {
            return Err(invalid_input!("Group privacy is already set to the requested value"));
        }

        // Update privacy setting
        let mut config_data = config_data;
        if let Some(obj) = config_data.as_object_mut() {
            obj.insert("is_private".to_string(), Value::Bool(is_private));
            obj.insert("privacy_changed_at".to_string(), Value::Number(env::block_timestamp().into()));
            obj.insert("privacy_changed_by".to_string(), Value::String(owner_id.to_string()));
        }

        // Save updated config
        platform.storage_set(&config_path, &config_data)?;

        // Note: Existing pending join requests remain unchanged and can still be
        // approved manually. Only new join requests after this change will follow
        // the new privacy model (auto-approval for public groups).

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "privacy_changed", owner_id.clone())
                .with_path(&format!("groups/{}/config", group_id))
                .with_field("group_id", group_id)
                .with_field("is_private", is_private)
                .with_field("changed_at", env::block_timestamp())
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Transfer ownership with configurable member removal (follows governance pattern)
    pub fn transfer_ownership_with_removal(
        platform: &mut SocialPlatform,
        group_id: &str,
        new_owner: &AccountId,
        remove_old_owner: Option<bool>,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // Get the current owner before transfer (like governance does)
        let config_path = format!("groups/{}/config", group_id);
        let config = platform.storage_get(&config_path)
            .ok_or_else(|| invalid_input!("Group config not found"))?;
        let old_owner = config.get("owner")
            .and_then(|v| v.as_str())
            .ok_or_else(|| invalid_input!("Current owner not found"))?
            .parse()
            .map_err(|_| invalid_input!("Invalid current owner"))?;

        // First transfer ownership using existing method
        Self::transfer_ownership_internal(platform, group_id, new_owner, false, event_config)?;

        // Then handle member removal if requested (default: true for clean transitions)
        let should_remove = remove_old_owner.unwrap_or(true);
        if should_remove && old_owner != *new_owner {
            // Use existing remove_member method like governance does
            Self::remove_member(platform, group_id, &old_owner, new_owner, event_config)?;
        }

        Ok(())
    }

    /// Internal transfer ownership function with governance flag (optimized for smart contract efficiency)
    pub fn transfer_ownership_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        new_owner: &AccountId,
        from_governance: bool,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        let predecessor = env::predecessor_account_id();

        // Optimization: Early validation - cheapest checks first to save gas
        
        // 1. Get config path once and reuse (optimization)
        let config_path = Self::group_config_path(group_id);

        // 2. Blockchain "Cache": Single storage read for multiple validations
        let config_data = match platform.storage_get(&config_path) {
            Some(data) => data,
            None => return Err(invalid_input!("Group not found")),
        };

        // 3. Get current owner from config for accurate validation
        let current_owner_str = config_data
            .get("owner")
            .and_then(|o| o.as_str())
            .unwrap_or("");
        let current_owner: AccountId = current_owner_str
            .parse()
            .map_err(|_| invalid_input!("Invalid current owner in config"))?;

        // 4. Self-transfer check (prevents redundant operations)
        if current_owner == *new_owner {
            return Err(invalid_input!("Cannot transfer ownership to yourself"));
        }

        // 5-6. Permission validation only if not from governance
        if !from_governance {
            // Check member-driven status (using cached config)
            let is_member_driven = config_data
                .get("member_driven")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            
            if is_member_driven {
                return Err(permission_denied!("transfer_ownership", &config_path));
            }

            // Verify predecessor is the current owner (using cached config data)
            if current_owner != predecessor {
                return Err(permission_denied!("transfer_ownership", &config_path));
            }
        }

        // 5. Verify new owner is a member (parallel validation possible)
        if !Self::is_member(platform, group_id, new_owner) {
            return Err(invalid_input!("New owner must be a member of the group"));
        }

        // 6. Verify new owner is not blacklisted (last expensive check)
        if Self::is_blacklisted(platform, group_id, new_owner) {
            return Err(invalid_input!("Cannot transfer ownership to blacklisted member"));
        }

        // Optimization: Reuse already-loaded config data (blockchain "cache")
        let mut config_data = config_data;

        // Optimization: Cache timestamp for reuse
        let transfer_timestamp = env::block_timestamp();

        // Update owner in config (atomic operation)
        if let Some(obj) = config_data.as_object_mut() {
            obj.insert("owner".to_string(), Value::String(new_owner.to_string()));
            obj.insert("ownership_transferred_at".to_string(), Value::Number(transfer_timestamp.into()));
            obj.insert("previous_owner".to_string(), Value::String(current_owner.to_string()));
        }

        // Save updated config (single storage write)
        platform.storage_set(&config_path, &config_data)?;

        // Optimization: Emit event only if needed (avoid unnecessary processing)
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "transfer_ownership", current_owner.clone())
                .with_target(new_owner) // Use new_owner as target since they're now the owner
                .with_field("group_id", group_id)
                .with_field("new_owner", new_owner.as_str())
                .with_field("previous_owner", current_owner.as_str())
                .with_field("transferred_at", transfer_timestamp) // Reuse cached timestamp
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Update group statistics (member counts)
    pub fn update_group_stats(
        platform: &mut SocialPlatform,
        group_id: &str,
        stat_updates: &Value,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        let stats_path = format!("groups/{}/stats", group_id);

        // Get existing stats or create new ones
        let existing_stats = platform.storage_get(&stats_path).unwrap_or_else(|| {
            json!({
                "total_members": 0,
                "total_join_requests": 0,
                "created_at": env::block_timestamp(),
                "last_updated": env::block_timestamp()
            })
        });

        // Merge updates
        let mut updated_stats = existing_stats.clone();
        if let Some(updates_obj) = stat_updates.as_object() {
            if let Some(stats_obj) = updated_stats.as_object_mut() {
                for (key, value) in updates_obj {
                    stats_obj.insert(key.clone(), value.clone());
                }
                stats_obj.insert("last_updated".to_string(), Value::Number(env::block_timestamp().into()));
            }
        }

        platform.storage_set(&stats_path, &updated_stats)?;

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "stats_updated", AccountId::try_from(group_id.to_string()).unwrap_or_else(|_| env::predecessor_account_id()))
                .with_target(&AccountId::try_from(group_id.to_string()).unwrap_or_else(|_| env::predecessor_account_id()))
                .with_path(&stats_path)
                .with_value(updated_stats.clone())
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Generic counter update method (consolidates 6 methods into 1)
    pub fn update_group_counter(
        platform: &mut SocialPlatform,
        group_id: &str,
        counter_type: &str,
        delta: i64,  // +1 to increment, -1 to decrement
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        let current_stats = Self::get_group_stats(platform, group_id).unwrap_or_else(|| {
            json!({
                "total_members": 0,
                "total_join_requests": 0,
                "created_at": env::block_timestamp(),
                "last_updated": env::block_timestamp()
            })
        });

        // Get current value for the specific counter
        let current_value = current_stats
            .get(counter_type)
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as i64;

        // Calculate new value with bounds checking
        let new_value = (current_value + delta).max(0) as u64;

        let updates = json!({
            counter_type: new_value
        });

        Self::update_group_stats(platform, group_id, &updates, event_config)
    }

    /// Increment member count when member is added
    pub fn increment_member_count(
        platform: &mut SocialPlatform,
        group_id: &str,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        Self::update_group_counter(platform, group_id, "total_members", 1, event_config)
    }

    /// Decrement member count when member is removed
    pub fn decrement_member_count(
        platform: &mut SocialPlatform,
        group_id: &str,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        Self::update_group_counter(platform, group_id, "total_members", -1, event_config)
    }

    /// Increment join request count
    pub fn increment_join_request_count(
        platform: &mut SocialPlatform,
        group_id: &str,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        Self::update_group_counter(platform, group_id, "total_join_requests", 1, event_config)
    }

    /// Decrement join request count
    pub fn decrement_join_request_count(
        platform: &mut SocialPlatform,
        group_id: &str,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        Self::update_group_counter(platform, group_id, "total_join_requests", -1, event_config)
    }
}