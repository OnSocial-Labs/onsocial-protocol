use near_sdk::serde_json::{Map, Number, Value};

/// Derive indexer-friendly fields from a storage path.
pub fn derived_fields_from_path(path: &str) -> Map<String, Value> {
    let mut out = Map::new();

    let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

    // id = last non-empty segment
    if let Some(id) = parts.iter().rev().find(|s| !s.is_empty()) {
        out.insert("id".into(), Value::String((*id).to_string()));
    }

    // type = best-effort "collection" segment.
    // - Account-prefixed: {account}/{type}/...  -> parts[1]
    // - Direct group: groups/{group_id}/{type}/... -> parts[2]
    // - Account-prefixed group: {account}/groups/{group_id}/{type}/... -> parts[3]
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

    // group fields (if path points under a group namespace)
    // Direct: groups/{group_id}/...
    if parts.len() >= 2 && parts[0] == "groups" {
        out.insert("group_id".into(), Value::String(parts[1].to_string()));
        if parts.len() > 2 {
            out.insert("group_path".into(), Value::String(parts[2..].join("/")));
        }
        out.insert("is_group_content".into(), Value::Bool(true));
    }
    // Account-prefixed: {author}/groups/{group_id}/...
    else if parts.len() >= 3 && parts.get(1).copied() == Some("groups") {
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
