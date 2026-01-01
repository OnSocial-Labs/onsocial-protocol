use crate::{invalid_input, SocialError};

pub fn require_groups_path<'a>(path: &'a str) -> Result<(&'a str, &'a str), SocialError> {
    crate::storage::utils::parse_groups_path(path)
        .filter(|(group_id, rel)| !group_id.is_empty() && !rel.is_empty())
        .ok_or_else(|| invalid_input!("Invalid group path format"))
}
