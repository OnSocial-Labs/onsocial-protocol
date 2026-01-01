use near_sdk::AccountId;

use crate::{invalid_input, SocialError};
use crate::state::SocialPlatform;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Path {
    full_path: String,
}

impl Path {
    pub fn new(
        account_id: &AccountId,
        path: &str,
        platform: &SocialPlatform,
    ) -> Result<Self, SocialError> {
        let full_path = validate_and_normalize_path(account_id, path, platform)?;
        Ok(Self { full_path })
    }

    pub fn full_path(&self) -> &str {
        &self.full_path
    }
}

pub fn validate_and_normalize_path(
    account_id: &AccountId,
    path: &str,
    platform: &SocialPlatform,
) -> Result<String, SocialError> {
    let max_key_length = platform.config.max_key_length as usize;
    if path.is_empty() || path.len() > max_key_length {
        return Err(invalid_input!("Invalid path length"));
    }

    if path.as_bytes().first() == Some(&b'/') {
        return Err(invalid_input!("Invalid path format"));
    }

    if path == "groups" || path == "groups/" {
        return Err(invalid_input!("Invalid path format"));
    }

    if path.contains("..") || path.contains('\\') {
        return Err(invalid_input!("Invalid path format"));
    }

    // Allow trailing `/` for subtree-style paths; disallow empty segments elsewhere.
    let mut prev_was_slash = false;
    for (idx, &byte) in path.as_bytes().iter().enumerate() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_' | b'.' | b'-' | b'/' => {}
            _ => return Err(invalid_input!("Invalid path format")),
        }

        if byte == b'/' {
            if prev_was_slash {
                return Err(invalid_input!("Invalid path format"));
            }
            prev_was_slash = true;
        } else {
            prev_was_slash = false;
        }

        if prev_was_slash && idx + 1 == path.len() {
            // trailing slash allowed
        }
    }

    if path.contains("//") {
        return Err(invalid_input!("Invalid path format"));
    }

    let full_path = if path.starts_with("groups/")
        || (path.starts_with(account_id.as_str())
            && path.as_bytes().get(account_id.len()) == Some(&b'/'))
    {
        path.to_string()
    } else {
        format!("{}/{}", account_id, path)
    };

    if full_path.len() > max_key_length {
        return Err(invalid_input!("Invalid path length"));
    }

    let depth = full_path.split('/').filter(|s| !s.is_empty()).count();
    if depth > platform.config.max_path_depth as usize {
        return Err(invalid_input!("Path depth exceeded"));
    }

    Ok(full_path)
}
