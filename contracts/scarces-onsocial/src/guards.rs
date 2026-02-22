use crate::*;

pub(crate) fn hash_account_id(account_id: &AccountId) -> Vec<u8> {
    env::sha256(account_id.as_bytes())
}

pub(crate) fn check_one_yocto() -> Result<(), MarketplaceError> {
    if env::attached_deposit().as_yoctonear() != ONE_YOCTO.as_yoctonear() {
        return Err(MarketplaceError::InsufficientDeposit(
            "Requires attached deposit of exactly 1 yoctoNEAR".into(),
        ));
    }
    Ok(())
}

pub(crate) fn check_at_least_one_yocto() -> Result<(), MarketplaceError> {
    if env::attached_deposit().as_yoctonear() < ONE_YOCTO.as_yoctonear() {
        return Err(MarketplaceError::InsufficientDeposit(
            "Requires attached deposit of at least 1 yoctoNEAR".into(),
        ));
    }
    Ok(())
}

impl Contract {
    pub(crate) fn check_contract_owner(
        &self,
        actor_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        if actor_id != &self.owner_id {
            return Err(MarketplaceError::only_owner("contract owner"));
        }
        Ok(())
    }
}
pub(crate) fn collection_id_from_token_id(token_id: &str) -> &str {
    token_id.split_once(':').map_or("", |(prefix, _)| prefix)
}

pub(crate) fn check_token_in_collection(
    token_id: &str,
    collection_id: &str,
) -> Result<(), MarketplaceError> {
    if !token_id.starts_with(&format!("{}:", collection_id)) {
        return Err(MarketplaceError::InvalidInput(
            "Token does not belong to specified collection".into(),
        ));
    }
    Ok(())
}
