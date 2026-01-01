use near_sdk::{env, AccountId};
use near_sdk::serde_json::Value;

use crate::events::EventBatch;
use crate::protocol::set::types::SetOptions;
use crate::state::set_context::VerifiedContext;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub(super) fn execute_set_intent_executor(
        &mut self,
        target_account: &AccountId,
        actor_id: &AccountId,
        intent: Value,
        data: Value,
        options: Option<SetOptions>,
    ) -> Result<(), SocialError> {
        let payer = env::predecessor_account_id();
        if !self.config.intents_executors.contains(&payer) {
            return Err(crate::unauthorized!("intent_executor", payer.to_string()));
        }
        let options = options.unwrap_or_default();
        let verified = VerifiedContext {
            actor_id: actor_id.clone(),
            payer_id: payer.clone(),
            deposit_owner: payer.clone(),
            actor_pk: None,
            auth_type: "intent_executor",
        };

        crate::domain::authz::cross_account::validate_cross_account_permissions_simple(
            self,
            &data,
            target_account,
            &verified.actor_id,
            None,
            false,
        )?;

        let intent = crate::protocol::set::canonical_json::canonicalize_json_value(&intent);
        let intent_bytes = crate::validation::serialize_json_with_max_len(
            &intent,
            crate::constants::MAX_INTENT_BYTES,
            "Failed to serialize intent",
            "Intent payload too large",
        )?;
        let intent_hash = env::sha256_array(&intent_bytes);
        let intent_hash_hex = intent_hash
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>();

        let mut event_batch = EventBatch::new();
        crate::events::EventBuilder::new(crate::constants::EVENT_TYPE_CONTRACT_UPDATE, "set", payer.clone())
            .with_path(&format!("{}/meta_tx", target_account.as_str()))
            .with_target(target_account)
            .with_field("auth_type", verified.auth_type)
            .with_field("actor_id", verified.actor_id.to_string())
            .with_field("payer_id", verified.payer_id.to_string())
            .with_field("intent_hash", intent_hash_hex)
            .with_field("intent_len", intent_bytes.len().to_string())
            .emit(&mut event_batch);

        self.execute_set_operations_with_batch(
            &verified,
            &mut event_batch,
            target_account,
            data,
            options,
            None,
        )
    }
}
