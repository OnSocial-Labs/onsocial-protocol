use crate::*;

impl Contract {
    pub(crate) fn make_sale_id(scarce_contract_id: &AccountId, token_id: &str) -> String {
        format!("{}{}{}", scarce_contract_id, DELIMETER, token_id)
    }

    pub(crate) fn remove_sale(
        &mut self,
        scarce_contract_id: AccountId,
        token_id: String,
    ) -> Result<Sale, MarketplaceError> {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);

        let sale = self
            .sales
            .remove(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;

        if let Some(mut owner_set) = self.by_owner_id.remove(&sale.owner_id) {
            owner_set.remove(&sale_id);
            if !owner_set.is_empty() {
                self.by_owner_id.insert(sale.owner_id.clone(), owner_set);
            }
        }

        if let Some(mut contract_set) = self.by_scarce_contract_id.remove(&scarce_contract_id) {
            contract_set.remove(&sale_id);
            if !contract_set.is_empty() {
                self.by_scarce_contract_id
                    .insert(scarce_contract_id, contract_set);
            }
        }

        Ok(sale)
    }

    pub(crate) fn add_sale(&mut self, sale: Sale) {
        let (scarce_contract_id, token_id) = match &sale.sale_type {
            SaleType::External {
                scarce_contract_id,
                token_id,
                ..
            } => (scarce_contract_id.clone(), token_id.clone()),
            SaleType::NativeScarce { token_id } => (env::current_account_id(), token_id.clone()),
        };

        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        self.sales.insert(sale_id.clone(), sale.clone());

        let mut by_owner_id = self.by_owner_id.remove(&sale.owner_id).unwrap_or_else(|| {
            IterableSet::new(StorageKey::ByOwnerIdInner {
                account_id_hash: crate::guards::hash_account_id(&sale.owner_id),
            })
        });
        by_owner_id.insert(sale_id.clone());
        self.by_owner_id.insert(sale.owner_id.clone(), by_owner_id);

        let mut by_scarce_contract_id = self
            .by_scarce_contract_id
            .remove(&scarce_contract_id)
            .unwrap_or_else(|| {
                IterableSet::new(StorageKey::ByScarceContractIdInner {
                    account_id_hash: crate::guards::hash_account_id(&scarce_contract_id),
                })
            });
        by_scarce_contract_id.insert(sale_id);
        self.by_scarce_contract_id
            .insert(scarce_contract_id, by_scarce_contract_id);
    }
}
