use crate::{
    constants::EVENT_JSON_PREFIX,
    errors::*,
    invalid_input,
    storage::{partitioning::get_partition, utils::{parse_path, parse_groups_path}},
};
use near_sdk::{env, serde_json::{self, Value}, AccountId};
use super::types::*;

pub struct EventBatch {
    events: Vec<(String, String, AccountId, Value)>,
}

impl Default for EventBatch {
    fn default() -> Self {
        Self::new()
    }
}

impl EventBatch {
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }

    pub fn add(&mut self, event_type: String, operation: String, account_id: AccountId, extra_data: Value) {
        self.events.push((event_type, operation, account_id, extra_data));
    }

    pub fn emit(&mut self) -> Result<(), SocialError> {
        if self.events.is_empty() {
            return Ok(());
        }

        use std::collections::{HashMap, VecDeque};
        let mut partition_cache: HashMap<String, u16> = HashMap::new();

        // Take ownership so failures won't silently drop remaining events.
        let events: VecDeque<(String, String, AccountId, Value)> = std::mem::take(&mut self.events).into();
        let mut events = events;

        while let Some((event_type, operation, account_id, extra_data)) = events.pop_front() {
            let mut emit_one = || -> Result<(), SocialError> {
                let extra = extra_data
                    .as_object()
                    .cloned()
                    .ok_or_else(|| invalid_input!("Event extra_data must be a JSON object"))?;
                let path = extra.get("path").and_then(|v| v.as_str());

                let namespace_id = path
                    .and_then(|p| {
                        parse_groups_path(p)
                            .map(|(g, _)| g.to_string())
                            .or_else(|| parse_path(p).map(|(a, _)| a.to_string()))
                    })
                    .unwrap_or_else(|| account_id.to_string());

                let partition_id = *partition_cache
                    .entry(namespace_id.clone())
                    .or_insert_with(|| get_partition(&namespace_id));

                let event = Event::new(&event_type, vec![EventData {
                    operation: operation.clone(),
                    author: account_id.to_string(),
                    partition_id: Some(partition_id),
                    extra,
                }]);

                let json = serde_json::to_string(&event)
                    .map_err(|_| invalid_input!("Failed to serialize event"))?;

                env::log_str(&format!("{EVENT_JSON_PREFIX}{json}"));
                Ok(())
            };

            if let Err(err) = emit_one() {
                self.events = std::iter::once((event_type, operation, account_id, extra_data))
                    .chain(events.into_iter())
                    .collect();
                return Err(err);
            }
        }
        Ok(())
    }
}
