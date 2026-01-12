use near_sdk::serde_json::{Map, Number, Value};

/// Extracts indexer-friendly fields (`id`, `type`, `group_id`, `group_path`, `is_group_content`) from a storage path.
pub fn derived_fields_from_path(path: &str) -> Map<String, Value> {
    let mut out = Map::new();

    let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

    if let Some(id) = parts.iter().rev().find(|s| !s.is_empty()) {
        out.insert("id".into(), Value::String((*id).to_string()));
    }

    // Type index varies: parts[1] for `{account}/{type}`, parts[2] for `groups/{id}/{type}`, parts[3] for `{account}/groups/{id}/{type}`.
    let ty = if parts.first().copied() == Some("groups") {
        parts.get(2).copied()
    } else if parts.get(1).copied() == Some("groups") {
        parts.get(3).copied()
    } else {
        parts.get(1).copied()
    }
    .filter(|s| !s.is_empty())
    .unwrap_or("data");
    out.insert("type".into(), Value::String(ty.to_string()));

    // Direct group path: groups/{group_id}/...
    if parts.len() >= 2 && parts[0] == "groups" {
        out.insert("group_id".into(), Value::String(parts[1].to_string()));
        if parts.len() > 2 {
            out.insert("group_path".into(), Value::String(parts[2..].join("/")));
        }
        out.insert("is_group_content".into(), Value::Bool(true));
    } else if parts.len() >= 3 && parts.get(1).copied() == Some("groups") {
        out.insert("group_id".into(), Value::String(parts[2].to_string()));
        if parts.len() > 3 {
            out.insert("group_path".into(), Value::String(parts[3..].join("/")));
        }
        out.insert("is_group_content".into(), Value::Bool(true));
    }

    out
}

pub fn insert_block_context(fields: &mut Map<String, Value>) {
    fields.insert(
        "block_height".into(),
        Value::Number(Number::from(near_sdk::env::block_height())),
    );
    fields.insert(
        "block_timestamp".into(),
        Value::Number(Number::from(near_sdk::env::block_timestamp())),
    );
}
