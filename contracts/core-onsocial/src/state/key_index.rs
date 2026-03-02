use crate::state::models::SocialPlatform;
use near_sdk::json_types::U64;
use near_sdk::serde_json::Value;

#[derive(
    near_sdk_macros::NearSchema, near_sdk::serde::Serialize, near_sdk::serde::Deserialize, Clone,
)]
#[serde(crate = "near_sdk::serde")]
pub struct KeyEntry {
    pub key: String,
    pub block_height: U64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
}

impl SocialPlatform {
    #[inline(always)]
    pub fn key_index_insert(&mut self, full_path: &str, block_height: u64) {
        self.key_index.insert(full_path.to_string(), block_height);
    }

    #[inline(always)]
    pub fn key_index_remove(&mut self, full_path: &str) {
        self.key_index.remove(&full_path.to_string());
    }

    /// Prefix scan with cursor-based pagination. Returns keys in lexicographic order.
    /// When `with_values` is true, resolves stored values via the data layer.
    pub fn list_keys(
        &self,
        prefix: &str,
        from_key: Option<&str>,
        limit: u32,
        with_values: bool,
    ) -> Vec<KeyEntry> {
        let limit = limit.min(50) as usize;
        if limit == 0 {
            return vec![];
        }

        let end = prefix_upper_bound(prefix);

        let pairs: Vec<(String, u64)> = match from_key {
            Some(cursor) => {
                let start = cursor.to_string();
                match &end {
                    Some(end) => self
                        .key_index
                        .range(start..end.clone())
                        .filter(|(k, _)| k.as_str() != cursor)
                        .take(limit)
                        .map(|(k, v)| (k.clone(), *v))
                        .collect(),
                    None => self
                        .key_index
                        .range(start..)
                        .filter(|(k, _)| k.starts_with(prefix) && k.as_str() != cursor)
                        .take(limit)
                        .map(|(k, v)| (k.clone(), *v))
                        .collect(),
                }
            }
            None => {
                let start = prefix.to_string();
                match &end {
                    Some(end) => self
                        .key_index
                        .range(start..end.clone())
                        .take(limit)
                        .map(|(k, v)| (k.clone(), *v))
                        .collect(),
                    None => self
                        .key_index
                        .range(start..)
                        .take_while(|(k, _)| k.starts_with(prefix))
                        .take(limit)
                        .map(|(k, v)| (k.clone(), *v))
                        .collect(),
                }
            }
        };

        pairs
            .into_iter()
            .map(|(key, bh)| {
                let value = if with_values {
                    self.resolve_value(&key)
                } else {
                    None
                };
                KeyEntry {
                    key,
                    block_height: U64(bh),
                    value,
                }
            })
            .collect()
    }

    /// Resolve the stored JSON value for a full key path.
    fn resolve_value(&self, full_path: &str) -> Option<Value> {
        let entry = self.get_entry(full_path)?;
        match entry.value {
            crate::state::models::DataValue::Value(bytes) => {
                near_sdk::serde_json::from_slice(&bytes).ok()
            }
            crate::state::models::DataValue::Deleted(_) => None,
        }
    }

    /// Count keys matching prefix. Scans up to 1000 keys to bound gas.
    pub fn count_keys(&self, prefix: &str) -> u32 {
        let end = prefix_upper_bound(prefix);
        let start = prefix.to_string();
        let max_scan = 1000;

        let count = match &end {
            Some(end) => self
                .key_index
                .range(start..end.clone())
                .take(max_scan)
                .count(),
            None => self
                .key_index
                .range(start..)
                .take_while(|(k, _)| k.starts_with(prefix))
                .take(max_scan)
                .count(),
        };
        count as u32
    }
}

/// Increment last byte of prefix to create exclusive upper bound for range scan.
fn prefix_upper_bound(prefix: &str) -> Option<String> {
    if prefix.is_empty() {
        return None;
    }
    let mut bytes = prefix.as_bytes().to_vec();
    while let Some(last) = bytes.last_mut() {
        if *last < 0xFF {
            *last += 1;
            return String::from_utf8(bytes).ok();
        }
        bytes.pop();
    }
    None
}
