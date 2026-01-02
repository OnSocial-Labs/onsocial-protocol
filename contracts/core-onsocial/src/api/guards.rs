use crate::{events::EventBatch, state::models::SocialPlatform, SocialError};
use near_sdk::{env, AccountId};

pub(crate) struct ContractGuards;

pub(crate) enum PayableCaller {
    /// Immediate caller (predecessor).
    Predecessor,
    /// Original transaction signer.
    Signer,
}

pub(crate) enum DepositPolicy {
    /// Credit full attached deposit to the chosen caller before executing.
    /// Emits `auto_deposit` only on success.
    CreditUpfront { reason: &'static str },
    /// Provide attached deposit as an `attached_balance` budget that may be consumed.
    /// Any leftover is credited to the chosen caller only on success.
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

        let caller_id = match caller {
            PayableCaller::Predecessor => SocialPlatform::current_caller(),
            PayableCaller::Signer => SocialPlatform::transaction_signer(),
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
                    crate::events::EventBuilder::new(
                        crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                        "auto_deposit",
                        caller_id.clone(),
                    )
                    .with_field("amount", original_deposit.to_string())
                    .with_field("reason", reason)
                    .emit(&mut batch);
                    batch.emit()?;
                }

                Ok(result)
            }

            DepositPolicy::SaveUnused { reason } => {
                let result = operation(platform, &caller_id, Some(&mut attached_balance));

                if result.is_ok() && attached_balance > 0 {
                    let mut batch = EventBatch::new();
                    platform.finalize_unused_attached_deposit(
                        &mut attached_balance,
                        &caller_id,
                        false,
                        reason,
                        &mut batch,
                        None,
                    )?;
                    batch.emit()?;
                }

                result
            }
        }
    }
}
