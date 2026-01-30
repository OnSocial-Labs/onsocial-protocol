// Internal helper functions for the marketplace

use crate::*;

impl Contract {
    /// Internal function to remove a sale
    /// Returns the Sale object that was removed
    pub(crate) fn internal_remove_sale(
        &mut self,
        nft_contract_id: AccountId,
        token_id: String,
    ) -> Sale {
        let sale_id = Contract::make_sale_id(&nft_contract_id, &token_id);

        // Get and remove the sale object
        let sale = self.sales.remove(&sale_id).expect("No sale found");

        // Remove from owner's sales set by removing and reinserting
        if let Some(mut owner_set) = self.by_owner_id.remove(&sale.owner_id) {
            owner_set.remove(&sale_id);

            if !owner_set.is_empty() {
                self.by_owner_id.insert(sale.owner_id.clone(), owner_set);
            }
        }

        // Remove from NFT contract's sales set by removing and reinserting
        if let Some(mut contract_set) = self.by_nft_contract_id.remove(&nft_contract_id) {
            contract_set.remove(&sale_id);

            if !contract_set.is_empty() {
                self.by_nft_contract_id
                    .insert(nft_contract_id, contract_set);
            }
        }

        sale
    }

    /// Internal function to add a sale
    pub(crate) fn internal_add_sale(&mut self, sale: Sale) {
        // Extract contract and token from SaleType
        let (nft_contract_id, token_id) = match &sale.sale_type {
            SaleType::External {
                nft_contract_id,
                token_id,
                ..
            } => (nft_contract_id.clone(), token_id.clone()),
            SaleType::LazyCollection { collection_id } => {
                // For lazy collections, use collection_id as unique identifier
                (env::current_account_id(), collection_id.clone())
            }
        };

        let sale_id = Contract::make_sale_id(&nft_contract_id, &token_id);

        // Add to main sales map
        self.sales.insert(sale_id.clone(), sale.clone());

        // Add to owner's sales set by removing, modifying, and reinserting
        let mut by_owner_id = self.by_owner_id.remove(&sale.owner_id).unwrap_or_else(|| {
            IterableSet::new(StorageKey::ByOwnerIdInner {
                account_id_hash: hash_account_id(&sale.owner_id),
            })
        });
        by_owner_id.insert(sale_id.clone());
        self.by_owner_id.insert(sale.owner_id.clone(), by_owner_id);

        // Add to NFT contract's sales set by removing, modifying, and reinserting
        let mut by_nft_contract_id = self
            .by_nft_contract_id
            .remove(&nft_contract_id)
            .unwrap_or_else(|| {
                IterableSet::new(StorageKey::ByNFTContractIdInner {
                    account_id_hash: hash_account_id(&nft_contract_id),
                })
            });
        by_nft_contract_id.insert(sale_id);
        self.by_nft_contract_id
            .insert(nft_contract_id, by_nft_contract_id);
    }
}

/// Hash an account ID for use in storage keys
pub(crate) fn hash_account_id(account_id: &AccountId) -> Vec<u8> {
    env::sha256(account_id.as_bytes())
}

/// Assert exactly one yoctoNEAR is attached (security measure)
pub(crate) fn assert_one_yocto() {
    assert_eq!(
        env::attached_deposit().as_yoctonear(),
        ONE_YOCTO.as_yoctonear(),
        "Requires attached deposit of exactly 1 yoctoNEAR"
    );
}

/// Assert at least one yoctoNEAR is attached
pub(crate) fn assert_at_least_one_yocto() {
    assert!(
        env::attached_deposit().as_yoctonear() >= ONE_YOCTO.as_yoctonear(),
        "Requires attached deposit of at least 1 yoctoNEAR"
    );
}
