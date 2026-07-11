use near_sdk::AccountId;
use near_sdk::serde_json::Value;

use crate::domain::groups::permissions::kv::{
    can_write, has_group_admin_permission, has_group_moderate_permission,
};
use crate::state::models::SocialPlatform;
use crate::{SocialError, invalid_input, permission_denied};

const LEGACY_DECISIONS_CHANNEL: &str = "proposals";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PostPolicy {
    Members,
    Moderators,
    Admins,
    Allowlist,
}

#[derive(Clone, Debug)]
pub(crate) struct GuildSpace {
    pub id: String,
    pub enabled: bool,
    pub post_policy: PostPolicy,
}

#[derive(Clone, Debug)]
pub(crate) struct GuildStructure {
    pub default_space_id: String,
    pub spaces: Vec<GuildSpace>,
}

impl GuildStructure {
    pub(crate) fn from_config(config: &Value) -> Option<Self> {
        let structure_value = config
            .get("x")
            .and_then(|x| x.get("onsocial"))
            .and_then(|onsocial| onsocial.get("structure"))
            .or_else(|| config.get("structure"))?;

        let structure_obj = structure_value.as_object()?;
        let default_space_id = structure_obj
            .get("defaultSpaceId")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|id| !id.is_empty())?;

        let spaces_raw = structure_obj.get("spaces")?.as_array()?;
        let mut spaces = Vec::new();
        for raw_space in spaces_raw {
            if let Some(space) = parse_space(raw_space) {
                spaces.push(space);
            }
        }

        if spaces.is_empty() {
            return None;
        }

        Some(Self {
            default_space_id: default_space_id.to_string(),
            spaces,
        })
    }

    pub(crate) fn resolve_space_for_channel(&self, channel: Option<&str>) -> Option<&GuildSpace> {
        if let Some(channel) = channel.filter(|value| !value.is_empty()) {
            return self
                .spaces
                .iter()
                .find(|space| channel_matches_space(&space.id, channel));
        }

        self.spaces
            .iter()
            .find(|space| space.id == self.default_space_id)
            .or_else(|| self.spaces.first())
    }
}

fn parse_space(raw: &Value) -> Option<GuildSpace> {
    let record = raw.as_object()?;
    let id = normalize_space_id(record.get("id").and_then(|v| v.as_str())?);
    if id.is_empty() {
        return None;
    }

    let enabled = record
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let post_policy = read_post_policy(record.get("postPolicy"));

    Some(GuildSpace {
        id,
        enabled,
        post_policy,
    })
}

fn read_post_policy(value: Option<&Value>) -> PostPolicy {
    match value.and_then(|v| v.as_str()) {
        Some("moderators") => PostPolicy::Moderators,
        Some("admins") => PostPolicy::Admins,
        Some("allowlist") => PostPolicy::Allowlist,
        _ => PostPolicy::Members,
    }
}

fn normalize_space_id(value: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;

    for ch in value.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            out.push(ch);
            last_dash = ch == '-';
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }

    out.trim_matches('-').chars().take(32).collect()
}

fn channel_matches_space(space_id: &str, channel: &str) -> bool {
    if space_id == channel {
        return true;
    }

    space_id == "decisions" && channel == LEGACY_DECISIONS_CHANNEL
}

pub(crate) fn is_feed_post_content_path(content_path: &str) -> bool {
    content_path.starts_with("content/post/")
}

pub(crate) fn space_write_path(group_id: &str, space_id: &str) -> String {
    format!("groups/{group_id}/spaces/{space_id}/write")
}

/// True for allowlist capability paths: `groups/{group_id}/spaces/{space_id}/write`.
pub(crate) fn is_space_write_capability_path(path: &str) -> bool {
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    parts.len() == 5
        && parts[0] == "groups"
        && !parts[1].is_empty()
        && parts[2] == "spaces"
        && !parts[3].is_empty()
        && parts[4] == "write"
}

pub(crate) fn enforce_space_post_policy(
    platform: &SocialPlatform,
    group_id: &str,
    author: &AccountId,
    config: &Value,
    content: &Value,
) -> Result<(), SocialError> {
    let Some(structure) = GuildStructure::from_config(config) else {
        return Ok(());
    };

    let channel = content
        .get("channel")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let Some(space) = structure.resolve_space_for_channel(channel) else {
        // Mirror app behavior: unknown channels stay member-writable once content WRITE passes.
        return Ok(());
    };

    if !space.enabled {
        return Err(invalid_input!("Space is disabled"));
    }

    match space.post_policy {
        PostPolicy::Members => Ok(()),
        PostPolicy::Moderators => {
            if has_group_moderate_permission(platform, group_id, author) {
                Ok(())
            } else {
                Err(permission_denied!("post_to_space", &space.id))
            }
        }
        PostPolicy::Admins => {
            if has_group_admin_permission(platform, group_id, author) {
                Ok(())
            } else {
                Err(permission_denied!("post_to_space", &space.id))
            }
        }
        PostPolicy::Allowlist => {
            // Leaders can always write; selected members need space WRITE grant.
            // Owner is covered by has_group_admin_permission (owner bypass).
            if has_group_admin_permission(platform, group_id, author) {
                return Ok(());
            }
            let path = space_write_path(group_id, &space.id);
            if can_write(platform, group_id, author.as_str(), &path) {
                Ok(())
            } else {
                Err(permission_denied!("post_to_space", &space.id))
            }
        }
    }
}
