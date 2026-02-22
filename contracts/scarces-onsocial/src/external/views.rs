use crate::external::*;
use crate::*;

#[near]
impl Contract {
    pub fn get_external_scarce(
        &self,
        scarce_contract_id: AccountId,
        token_id: String,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_scarce_contract::ext(scarce_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10).clamp(1, 300)))
            .nft_token(token_id)
    }

    pub fn get_external_scarce_metadata(
        &self,
        scarce_contract_id: AccountId,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_scarce_contract::ext(scarce_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10).clamp(1, 300)))
            .nft_metadata()
    }

    pub fn get_sale_with_scarce_metadata(
        &self,
        scarce_contract_id: AccountId,
        token_id: String,
        gas_tgas: Option<u64>,
    ) -> Promise {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        near_sdk::require!(
            self.sales.get(&sale_id).is_some(),
            "No active sale for this token"
        );

        let gas = Gas::from_tgas(gas_tgas.unwrap_or(DEFAULT_CALLBACK_GAS).clamp(1, 150));

        ext_scarce_contract::ext(scarce_contract_id.clone())
            .with_static_gas(gas)
            .nft_token(token_id.clone())
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(gas)
                    .resolve_sale_with_metadata(scarce_contract_id, token_id),
            )
    }

    pub fn get_external_scarces(
        &self,
        scarce_contract_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_scarce_contract::ext(scarce_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10).clamp(1, 300)))
            .nft_tokens(from_index, limit)
    }

    pub fn get_external_scarces_for_owner(
        &self,
        scarce_contract_id: AccountId,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_scarce_contract::ext(scarce_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10).clamp(1, 300)))
            .nft_tokens_for_owner(account_id, from_index, limit)
    }

    pub fn get_external_scarce_total_supply(
        &self,
        scarce_contract_id: AccountId,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_scarce_contract::ext(scarce_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10).clamp(1, 300)))
            .nft_total_supply()
    }

    pub fn get_external_scarce_supply_for_owner(
        &self,
        scarce_contract_id: AccountId,
        account_id: AccountId,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_scarce_contract::ext(scarce_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10).clamp(1, 300)))
            .nft_supply_for_owner(account_id)
    }

    pub fn get_sales_with_metadata_by_scarce_contract(
        &self,
        scarce_contract_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<SaleWithBasicInfo> {
        let sales =
            self.get_sales_by_scarce_contract_id(scarce_contract_id, from_index, limit);

        sales
            .into_iter()
            .map(|sale| {
                let sale_id = match &sale.sale_type {
                    SaleType::External {
                        scarce_contract_id,
                        token_id,
                        ..
                    } => Contract::make_sale_id(scarce_contract_id, token_id),
                    SaleType::NativeScarce { token_id } => {
                        Contract::make_sale_id(&env::current_account_id(), token_id)
                    }
                };
                SaleWithBasicInfo { sale_id, sale }
            })
            .collect()
    }
}

#[near(serializers = [json])]
pub struct SaleWithBasicInfo {
    pub sale_id: String,
    pub sale: Sale,
}
