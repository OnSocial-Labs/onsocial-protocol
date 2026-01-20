use crate::{SocialError, state::models::SocialPlatform};

pub(crate) struct ContractGuards;

impl ContractGuards {
    #[inline(always)]
    pub(crate) fn require_live_state(platform: &SocialPlatform) -> Result<(), SocialError> {
        platform.validate_state(false)
    }

    #[inline(always)]
    pub(crate) fn require_manager_one_yocto(platform: &SocialPlatform) -> Result<(), SocialError> {
        platform.require_manager_one_yocto()
    }
}
