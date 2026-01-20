use crate::{SocialError, invalid_input};

pub fn require_groups_path(path: &str) -> Result<(&str, &str), SocialError> {
    crate::storage::utils::parse_groups_path(path)
        .filter(|(group_id, rel)| !group_id.is_empty() && !rel.is_empty())
        .ok_or_else(|| invalid_input!("Invalid group path format"))
}
