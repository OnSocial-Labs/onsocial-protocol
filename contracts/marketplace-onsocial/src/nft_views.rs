// NFT metadata and enumeration query methods
// NEP-177 (Metadata) and NEP-181 (Enumeration) support

use crate::*;
use crate::external::*;
use near_sdk::PromiseResult;

#[near]
impl Contract {
    // ==================== NEP-177: Metadata Queries ====================
    
    /// Get NFT token with full metadata from the NFT contract
    pub fn get_nft_token(
        &self,
        nft_contract_id: AccountId,
        token_id: String,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_nft_contract::ext(nft_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10)))
            .nft_token(token_id)
    }
    
    /// Get NFT contract metadata
    pub fn get_nft_contract_metadata(
        &self,
        nft_contract_id: AccountId,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_nft_contract::ext(nft_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10)))
            .nft_metadata()
    }
    
    /// Get sale with NFT metadata combined
    pub fn get_sale_with_nft_metadata(
        &self,
        nft_contract_id: AccountId,
        token_id: String,
        gas_tgas: Option<u64>,
    ) -> Promise {
        let sale_id = Contract::make_sale_id(&nft_contract_id, &token_id);
        let _sale = self.sales.get(&sale_id);
        
        let gas = Gas::from_tgas(gas_tgas.unwrap_or(10));
        
        ext_nft_contract::ext(nft_contract_id.clone())
            .with_static_gas(gas)
            .nft_token(token_id.clone())
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(gas)
                    .resolve_sale_with_metadata(nft_contract_id, token_id)
            )
    }
    
    /// Callback to resolve sale with metadata
    #[private]
    pub fn resolve_sale_with_metadata(
        &self,
        nft_contract_id: AccountId,
        token_id: String,
    ) -> Option<SaleWithMetadata> {
        // Get the sale
        let sale_id = Contract::make_sale_id(&nft_contract_id, &token_id);
        let sale = self.sales.get(&sale_id)?;
        
        // Get NFT metadata from promise result
        let nft_token = match env::promise_result(0) {
            PromiseResult::Successful(value) => {
                near_sdk::serde_json::from_slice::<Option<Token>>(&value)
                    .ok()
                    .flatten()
            }
            _ => None,
        };
        
        Some(SaleWithMetadata {
            sale: sale.clone(),
            nft_token,
        })
    }
    
    // ==================== NEP-181: Enumeration Queries ====================
    
    /// Get paginated list of all tokens from an NFT contract
    pub fn get_nft_tokens(
        &self,
        nft_contract_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_nft_contract::ext(nft_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10)))
            .nft_tokens(from_index, limit)
    }
    
    /// Get paginated list of tokens for an owner from an NFT contract
    pub fn get_nft_tokens_for_owner(
        &self,
        nft_contract_id: AccountId,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_nft_contract::ext(nft_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10)))
            .nft_tokens_for_owner(account_id, from_index, limit)
    }
    
    /// Get total supply of tokens from an NFT contract
    pub fn get_nft_total_supply(
        &self,
        nft_contract_id: AccountId,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_nft_contract::ext(nft_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10)))
            .nft_total_supply()
    }
    
    /// Get supply of tokens for an owner from an NFT contract
    pub fn get_nft_supply_for_owner(
        &self,
        nft_contract_id: AccountId,
        account_id: AccountId,
        gas_tgas: Option<u64>,
    ) -> Promise {
        ext_nft_contract::ext(nft_contract_id)
            .with_static_gas(Gas::from_tgas(gas_tgas.unwrap_or(10)))
            .nft_supply_for_owner(account_id)
    }
    
    // ==================== Combined Views ====================
    
    /// Get all sales with NFT metadata for a specific NFT contract
    /// Useful for browsing all listings from a collection
    pub fn get_sales_with_metadata_by_nft_contract(
        &self,
        nft_contract_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<SaleWithBasicInfo> {
        let sales = self.get_sales_by_nft_contract_id(
            nft_contract_id.clone(),
            from_index,
            limit,
        );
        
        sales
            .into_iter()
            .map(|sale| {
                let sale_id = match &sale.sale_type {
                    SaleType::External { nft_contract_id, token_id, .. } => {
                        Contract::make_sale_id(nft_contract_id, token_id)
                    }
                    SaleType::LazyCollection { collection_id } => {
                        Contract::make_sale_id(&env::current_account_id(), collection_id)
                    }
                };
                SaleWithBasicInfo {
                    sale_id,
                    sale,
                }
            })
            .collect()
    }
}

// ==================== Data Structures ====================

/// Sale combined with NFT metadata
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
#[derive(near_sdk::NearSchema)]
pub struct SaleWithMetadata {
    pub sale: Sale,
    pub nft_token: Option<Token>,
}

/// Sale with basic identifying information
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
#[derive(near_sdk::NearSchema)]
pub struct SaleWithBasicInfo {
    pub sale_id: String,
    pub sale: Sale,
}
