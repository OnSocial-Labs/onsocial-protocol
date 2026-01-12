use near_sdk::{AccountId, env, serde_json::{self, Value}};

use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::{invalid_input, permission_denied, SocialError};

use super::AddMemberAuth;

impl crate::domain::groups::core::GroupStorage {
    pub fn request_join(
        platform: &mut SocialPlatform,
        group_id: &str,
        requester_id: &AccountId,
    ) -> Result<(), SocialError> {
        Self::assert_join_requests_not_member_driven(platform, group_id)?;

        let config_path = Self::group_config_path(group_id);

        if platform.storage_get(&config_path).is_none() {
            return Err(invalid_input!("Group does not exist"));
        }

        if Self::is_member(platform, group_id, requester_id) {
            return Err(invalid_input!("Already a member of this group"));
        }

        if Self::is_blacklisted(platform, group_id, requester_id) {
            return Err(invalid_input!("You are blacklisted from this group"));
        }

        let request_path = format!("groups/{}/join_requests/{}", group_id, requester_id);

        if let Some(existing) = platform.storage_get(&request_path) {
            let status = existing
                .get("status")
                .and_then(|s| s.as_str())
                .ok_or_else(|| invalid_input!("Join request is malformed"))?;
            if status == "pending" {
                return Err(invalid_input!("Join request already exists"));
            }
            // If status is "rejected" or "approved", allow overwriting with new request.
        }

        let request_data = Value::Object(serde_json::Map::from_iter([
            (
                "status".to_string(),
                Value::String("pending".to_string()),
            ),
            (
                "requested_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            ),
            (
                "requester_id".to_string(),
                Value::String(requester_id.to_string()),
            ),
        ]));

        platform.storage_set(&request_path, &request_data)?;

        let mut event_batch = EventBatch::new();
        Self::increment_join_request_count(platform, group_id, requester_id, &mut event_batch)?;
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "join_request_submitted",
            requester_id.clone(),
        )
        .with_target(requester_id)
        .with_path(&format!("groups/{}/join_requests/{}", group_id, requester_id))
        .with_value(request_data.clone())
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }

    /// Members join with level=NONE; elevated roles must be granted separately.
    pub fn approve_join_request(
        platform: &mut SocialPlatform,
        group_id: &str,
        requester_id: &AccountId,
        approver_id: &AccountId,
    ) -> Result<(), SocialError> {
        Self::assert_join_requests_not_member_driven(platform, group_id)?;

        let group_config_path = Self::group_config_path(group_id);
        let group_join_requests_path = Self::group_join_requests_path(group_id);
        let group_owner = crate::domain::groups::permissions::kv::extract_path_owner(platform, &group_config_path)
            .ok_or_else(|| invalid_input!("Group owner not found"))?;

        if !crate::domain::groups::permissions::kv::can_moderate(
            platform,
            &group_owner,
            approver_id.as_str(),
            &group_join_requests_path,
        ) {
            return Err(permission_denied!(
                "approve_join_request",
                &format!("groups/{}/join_requests/{}", group_id, requester_id)
            ));
        }

        if Self::is_blacklisted(platform, group_id, requester_id) {
            return Err(invalid_input!("Cannot approve join request for blacklisted user"));
        }

        let request_path = format!("groups/{}/join_requests/{}", group_id, requester_id);

        let request_data = match platform.storage_get(&request_path) {
            Some(data) => data,
            None => return Err(invalid_input!("Join request not found")),
        };

        let status = request_data
            .get("status")
            .and_then(|s| s.as_str())
            .ok_or_else(|| invalid_input!("Join request is malformed"))?;
        if status != "pending" {
            return Err(invalid_input!("Join request is not pending"));
        }

        Self::add_member_internal(
            platform,
            group_id,
            requester_id,
            approver_id,
            AddMemberAuth::AlreadyAuthorized,
        )?;

        let mut updated_request = request_data.clone();
        if let Some(obj) = updated_request.as_object_mut() {
            obj.insert(
                "status".to_string(),
                Value::String("approved".to_string()),
            );
            obj.insert(
                "approved_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            );
            obj.insert(
                "approved_by".to_string(),
                Value::String(approver_id.to_string()),
            );
            obj.insert(
                "granted_permissions".to_string(),
                Value::Number(crate::domain::groups::permissions::kv::types::NONE.into()),
            );
        }

        platform.storage_set(&request_path, &updated_request)?;

        let mut event_batch = EventBatch::new();
        Self::decrement_join_request_count(platform, group_id, approver_id, &mut event_batch)?;
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "join_request_approved",
            approver_id.clone(),
        )
        .with_target(requester_id)
        .with_path(&format!("groups/{}/join_requests/{}", group_id, requester_id))
        .with_value(updated_request.clone())
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }

    pub fn reject_join_request(
        platform: &mut SocialPlatform,
        group_id: &str,
        requester_id: &AccountId,
        rejector_id: &AccountId,
        reason: Option<&str>,
    ) -> Result<(), SocialError> {
        Self::assert_join_requests_not_member_driven(platform, group_id)?;

        let group_config_path = Self::group_config_path(group_id);
        let group_join_requests_path = Self::group_join_requests_path(group_id);
        let group_owner = crate::domain::groups::permissions::kv::extract_path_owner(platform, &group_config_path)
            .ok_or_else(|| invalid_input!("Group owner not found"))?;

        if !crate::domain::groups::permissions::kv::can_moderate(
            platform,
            &group_owner,
            rejector_id.as_str(),
            &group_join_requests_path,
        ) {
            return Err(permission_denied!(
                "reject_join_request",
                &format!("groups/{}/join_requests/{}", group_id, requester_id)
            ));
        }

        let request_path = format!("groups/{}/join_requests/{}", group_id, requester_id);

        let request_data = match platform.storage_get(&request_path) {
            Some(data) => data,
            None => return Err(invalid_input!("Join request not found")),
        };

        let status = request_data
            .get("status")
            .and_then(|s| s.as_str())
            .ok_or_else(|| invalid_input!("Join request is malformed"))?;
        if status != "pending" {
            return Err(invalid_input!("Join request is not pending"));
        }

        let mut updated_request = request_data.clone();
        if let Some(obj) = updated_request.as_object_mut() {
            obj.insert(
                "status".to_string(),
                Value::String("rejected".to_string()),
            );
            obj.insert(
                "rejected_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            );
            obj.insert(
                "rejected_by".to_string(),
                Value::String(rejector_id.to_string()),
            );
            if let Some(r) = reason {
                obj.insert("reason".to_string(), Value::String(r.to_string()));
            }
        }

        platform.storage_set(&request_path, &updated_request)?;

        let mut event_batch = EventBatch::new();
        Self::decrement_join_request_count(platform, group_id, rejector_id, &mut event_batch)?;
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "join_request_rejected",
            rejector_id.clone(),
        )
        .with_target(requester_id)
        .with_path(&format!("groups/{}/join_requests/{}", group_id, requester_id))
        .with_value(updated_request.clone())
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }

    pub fn cancel_join_request(
        platform: &mut SocialPlatform,
        group_id: &str,
        requester_id: &AccountId,
    ) -> Result<(), SocialError> {
        Self::assert_join_requests_not_member_driven(platform, group_id)?;

        let request_path = format!("groups/{}/join_requests/{}", group_id, requester_id);

        let entry = platform
            .get_entry(&request_path)
            .ok_or_else(|| invalid_input!("Join request not found"))?;

        let request_data: Value = match &entry.value {
            crate::state::models::DataValue::Value(data) => serde_json::from_slice(data)
                .map_err(|_| invalid_input!("Join request data is corrupted"))?,
            crate::state::models::DataValue::Deleted(_) => {
                return Err(invalid_input!("Join request not found"));
            }
        };

        if request_data.is_null() {
            return Err(invalid_input!("Join request not found"));
        }

        let status = request_data
            .get("status")
            .and_then(|s| s.as_str())
            .ok_or_else(|| invalid_input!("Join request is malformed"))?;

        if status != "pending" {
            return Err(invalid_input!("Join request is not pending"));
        }

        let _ = crate::storage::soft_delete_entry(platform, &request_path, entry)?;

        let mut event_batch = EventBatch::new();
        Self::decrement_join_request_count(platform, group_id, requester_id, &mut event_batch)?;
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "join_request_cancelled",
            requester_id.clone(),
        )
        .with_target(requester_id)
        .with_path(&format!("groups/{}/join_requests/{}", group_id, requester_id))
        .with_value(Value::Null)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
