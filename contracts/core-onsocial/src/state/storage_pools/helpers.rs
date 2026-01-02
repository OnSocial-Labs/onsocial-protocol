use near_sdk::AccountId;
use serde_json::Value;

use crate::domain::groups::config::GroupConfig;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub(super) fn require_positive_amount(amount: u128) -> Result<(), SocialError> {
        if amount == 0 {
            return Err(crate::invalid_input!("amount must be greater than zero"));
        }
        Ok(())
    }

    pub(super) fn require_group_owner_or_manage(
        &self,
        group_id: &str,
        account_id: &AccountId,
        action: &'static str,
    ) -> Result<(), SocialError> {
        // Authorization: group owner or MANAGE on the group config path.
        let group_config_path = format!("groups/{}/config", group_id);
        let group_entry = self
            .get_entry(&group_config_path)
            .ok_or_else(|| crate::invalid_input!("Group not found"))?;

        let group_owner = match &group_entry.value {
            crate::state::models::DataValue::Value(bytes) => {
                let config: Value = serde_json::from_slice(bytes)
                    .map_err(|_| crate::invalid_input!("Invalid group config"))?;

                GroupConfig::try_from_value(&config)
                    .map_err(|_| crate::invalid_input!("Group has no valid owner"))?
                    .owner
            }
            crate::state::models::DataValue::Deleted(_) => {
                return Err(crate::invalid_input!("Group has been deleted"));
            }
        };

        // Allow if caller is owner or has MANAGE.
        let permission_namespace = crate::domain::groups::permissions::kv::extract_path_owner(
            self,
            &group_config_path,
        )
        .ok_or_else(|| crate::invalid_input!("Group not found"))?;

        let can_manage = crate::domain::groups::permissions::kv::can_manage(
            self,
            &permission_namespace,
            account_id.as_str(),
            &group_config_path,
        );

        if account_id != &group_owner && !can_manage {
            return Err(crate::unauthorized!(action, account_id.as_str()));
        }

        Ok(())
    }
}
