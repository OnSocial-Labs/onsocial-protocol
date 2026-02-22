use crate::*;

#[near]
impl Contract {
    pub fn nft_metadata(&self) -> external::ScarceContractMetadata {
        self.contract_metadata.clone()
    }
}
