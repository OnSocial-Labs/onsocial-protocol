use near_sdk::AccountId;
use serde_json::Value;

use crate::state::set_context::ApiOperationContext;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub(crate) fn handle_api_group_sponsor_quota_set(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        let group_id: String = value
            .get("group_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| crate::invalid_input!("group_id required for group_sponsor_quota_set"))?;

        let target_id_str = value
            .get("target_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::invalid_input!("target_id required for group_sponsor_quota_set"))?;

        let target_id: AccountId = crate::validation::parse_account_id_str(
            target_id_str,
            crate::invalid_input!("Invalid target_id account ID"),
        )?;

        let enabled: bool = value
            .get("enabled")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| crate::invalid_input!("enabled required for group_sponsor_quota_set"))?;

        let daily_refill_bytes: u64 = value
            .get("daily_refill_bytes")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| {
                crate::invalid_input!("daily_refill_bytes required for group_sponsor_quota_set")
            })?;

        let allowance_max_bytes: u64 = value
            .get("allowance_max_bytes")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| {
                crate::invalid_input!("allowance_max_bytes required for group_sponsor_quota_set")
            })?;

        if enabled && allowance_max_bytes == 0 {
            return Err(crate::invalid_input!(
                "allowance_max_bytes must be greater than zero"
            ));
        }

        self.require_group_owner_or_manage(&group_id, account_id, "group_sponsor_quota_set")?;

        let now = near_sdk::env::block_timestamp();
        let quota_key = crate::state::models::SocialPlatform::group_sponsor_quota_key(
            &target_id,
            &group_id,
        );

        let mut quota = self
            .group_sponsor_quotas
            .get(&quota_key)
            .cloned()
            .unwrap_or_default();
        let was_enabled = quota.enabled;
        quota.is_override = true;
        quota.enabled = enabled;
        quota.daily_refill_bytes = daily_refill_bytes;
        quota.allowance_max_bytes = allowance_max_bytes;
        if enabled {
            // Reset allowance on (re)enable or update.
            quota.allowance_bytes = allowance_max_bytes;
            quota.last_refill_ns = now;
        } else {
            quota.allowance_bytes = 0;
            quota.last_refill_ns = now;
        }

        self.group_sponsor_quotas
            .insert(quota_key.clone(), quota.clone());

        crate::events::EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "group_sponsor_quota_set",
            account_id.clone(),
        )
        .with_field("group_id", group_id)
        .with_field("target_id", target_id.to_string())
        .with_field("enabled", enabled.to_string())
        .with_field("daily_refill_bytes", daily_refill_bytes.to_string())
        .with_field("allowance_max_bytes", allowance_max_bytes.to_string())
        .with_field("previously_enabled", was_enabled.to_string())
        .emit(ctx.event_batch);

        Ok(())
    }

    pub(crate) fn handle_api_group_sponsor_default_set(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        let group_id: String = value
            .get("group_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| {
                crate::invalid_input!("group_id required for group_sponsor_default_set")
            })?;

        let enabled: bool = value
            .get("enabled")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| crate::invalid_input!("enabled required for group_sponsor_default_set"))?;

        let daily_refill_bytes: u64 = value
            .get("daily_refill_bytes")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| {
                crate::invalid_input!("daily_refill_bytes required for group_sponsor_default_set")
            })?;

        let allowance_max_bytes: u64 = value
            .get("allowance_max_bytes")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| {
                crate::invalid_input!(
                    "allowance_max_bytes required for group_sponsor_default_set"
                )
            })?;

        if enabled && allowance_max_bytes == 0 {
            return Err(crate::invalid_input!(
                "allowance_max_bytes must be greater than zero"
            ));
        }

        self.require_group_owner_or_manage(&group_id, account_id, "group_sponsor_default_set")?;

        let previous = self
            .group_sponsor_defaults
            .get(&group_id)
            .cloned()
            .unwrap_or_default();
        let updated = crate::state::models::GroupSponsorDefault {
            enabled,
            daily_refill_bytes,
            allowance_max_bytes,
            version: previous.version.saturating_add(1),
        };
        self.group_sponsor_defaults
            .insert(group_id.clone(), updated.clone());

        crate::events::EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "group_sponsor_default_set",
            account_id.clone(),
        )
        .with_field("group_id", group_id)
        .with_field("enabled", enabled.to_string())
        .with_field("daily_refill_bytes", daily_refill_bytes.to_string())
        .with_field("allowance_max_bytes", allowance_max_bytes.to_string())
        .with_field("previously_enabled", previous.enabled.to_string())
        .emit(ctx.event_batch);

        Ok(())
    }
}
