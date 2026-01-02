use crate::{events::EventBatch, state::{models::SocialPlatform, platform::UnusedDepositEventMeta}, SocialError};
use near_sdk::{env, AccountId};

pub(crate) struct ContractGuards;

pub(crate) enum PayableCaller {
    Predecessor,
    Signer,
}

pub(crate) enum DepositPolicy {
    /// Credit deposit upfront; emit event on success.
    CreditUpfront { reason: &'static str },
    /// Pass deposit as consumable budget; credit remainder on success.
    SaveUnused { reason: &'static str },
}

impl ContractGuards {
    #[inline(always)]
    pub(crate) fn require_live_state(platform: &SocialPlatform) -> Result<(), SocialError> {
        platform.validate_state(false)
    }

    #[inline(always)]
    pub(crate) fn require_manager_one_yocto(platform: &SocialPlatform) -> Result<(), SocialError> {
        platform.require_manager_one_yocto()
    }

    /// Executes a payable operation with deposit handling.
    /// Note: Error returns trigger NEAR atomic rollback - deposit automatically returns to caller.
    pub(crate) fn execute_payable_operation<F, R>(
        platform: &mut SocialPlatform,
        caller: PayableCaller,
        deposit_policy: DepositPolicy,
        operation: F,
    ) -> Result<R, SocialError>
    where
        F: FnOnce(&mut SocialPlatform, &AccountId, Option<&mut u128>) -> Result<R, SocialError>,
    {
        Self::require_live_state(platform)?;

        let predecessor_id = SocialPlatform::current_caller();
        let caller_id = match caller {
            PayableCaller::Predecessor => predecessor_id.clone(),
            PayableCaller::Signer => SocialPlatform::transaction_signer(),
        };
        let auth_type = match caller {
            PayableCaller::Predecessor => "predecessor",
            PayableCaller::Signer => "signer",
        };

        let mut attached_balance = env::attached_deposit().as_yoctonear();
        let original_deposit = attached_balance;

        match deposit_policy {
            DepositPolicy::CreditUpfront { reason } => {
                if attached_balance > 0 {
                    platform.credit_storage_balance(&caller_id, attached_balance);
                }

                let result = operation(platform, &caller_id, None)?;

                if original_deposit > 0 {
                    let mut batch = crate::events::EventBatch::new();
                    let mut builder = crate::events::EventBuilder::new(
                        crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                        "auto_deposit",
                        caller_id.clone(),
                    )
                    .with_field("amount", original_deposit.to_string())
                    .with_field("reason", reason);

                    if predecessor_id != caller_id {
                        builder = builder
                            .with_field("auth_type", auth_type)
                            .with_field("payer_id", predecessor_id.to_string());
                    }

                    builder.emit(&mut batch);
                    batch.emit()?;
                }

                Ok(result)
            }

            DepositPolicy::SaveUnused { reason } => {
                let result = operation(platform, &caller_id, Some(&mut attached_balance))?;

                if attached_balance > 0 {
                    let mut batch = EventBatch::new();
                    let meta = if predecessor_id != caller_id {
                        Some(UnusedDepositEventMeta {
                            auth_type,
                            actor_id: &caller_id,
                            payer_id: &predecessor_id,
                            target_account: &caller_id,
                        })
                    } else {
                        None
                    };
                    platform.finalize_unused_attached_deposit(
                        &mut attached_balance,
                        &caller_id,
                        false,
                        reason,
                        &mut batch,
                        meta,
                    )?;
                    batch.emit()?;
                }

                Ok(result)
            }
        }
    }
}
