use crate::{SocialError, invalid_input};

pub fn validate_group_id(group_id: &str) -> Result<(), SocialError> {
    if group_id.is_empty() || group_id.len() > 64 {
        return Err(invalid_input!("Group ID must be 1-64 characters"));
    }
    if !group_id
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
    {
        return Err(invalid_input!(
            "Group ID can only contain alphanumeric characters, underscores, and hyphens"
        ));
    }
    Ok(())
}
