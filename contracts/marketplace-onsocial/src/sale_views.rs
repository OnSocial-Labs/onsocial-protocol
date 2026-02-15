// View/enumeration methods for querying marketplace data

use crate::*;

#[near]
impl Contract {
    /// Get a specific sale by Scarce contract and token ID
    pub fn get_sale(&self, scarce_contract_id: AccountId, token_id: String) -> Option<Sale> {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        self.sales.get(&sale_id).cloned()
    }

    /// Get total number of sales on the marketplace
    pub fn get_supply_sales(&self) -> u64 {
        self.sales.len() as u64
    }

    /// Get number of sales by a specific owner
    pub fn get_supply_by_owner_id(&self, account_id: AccountId) -> u64 {
        self.by_owner_id
            .get(&account_id)
            .map(|set| set.len() as u64)
            .unwrap_or(0)
    }

    /// Get number of sales from a specific Scarce contract
    pub fn get_supply_by_scarce_contract_id(&self, scarce_contract_id: AccountId) -> u64 {
        self.by_scarce_contract_id
            .get(&scarce_contract_id)
            .map(|set| set.len() as u64)
            .unwrap_or(0)
    }

    /// Get paginated sales by owner
    pub fn get_sales_by_owner_id(
        &self,
        account_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Sale> {
        let by_owner_id = self.by_owner_id.get(&account_id);

        let sales = if let Some(by_owner_id) = by_owner_id {
            by_owner_id
        } else {
            return vec![];
        };

        let start = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100); // Max 100 per query

        sales
            .iter()
            .skip(start as usize)
            .take(limit as usize)
            .filter_map(|sale_id| self.sales.get(sale_id).cloned())
            .collect()
    }

    /// Get paginated sales by Scarce contract
    pub fn get_sales_by_scarce_contract_id(
        &self,
        scarce_contract_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Sale> {
        let by_scarce_contract_id = self.by_scarce_contract_id.get(&scarce_contract_id);

        let sales = if let Some(by_scarce_contract_id) = by_scarce_contract_id {
            by_scarce_contract_id
        } else {
            return vec![];
        };

        let start = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100); // Max 100 per query

        sales
            .iter()
            .skip(start as usize)
            .take(limit as usize)
            .filter_map(|sale_id| self.sales.get(sale_id).cloned())
            .collect()
    }

    /// Get all sales with pagination
    pub fn get_sales(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Sale> {
        let start = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100); // Max 100 per query

        self.sales
            .iter()
            .skip(start as usize)
            .take(limit as usize)
            .map(|(_, sale)| sale.clone())
            .collect()
    }

    /// Check if a sale has expired
    pub fn is_sale_expired(&self, scarce_contract_id: AccountId, token_id: String) -> bool {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        if let Some(sale) = self.sales.get(&sale_id) {
            if let Some(expiration) = sale.expires_at {
                let now = env::block_timestamp();
                return now > expiration;
            }
        }
        false
    }

    /// Get all expired sales (for cleanup)
    /// Note: For large datasets, use Substreams to track expirations
    pub fn get_expired_sales(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<(String, Sale)> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100); // Max 100 per query
        let now = env::block_timestamp();

        self.sales
            .iter()
            .filter(|(_, sale)| sale.expires_at.map_or(false, |exp| now > exp))
            .skip(start)
            .take(limit as usize)
            .map(|(id, sale)| (id.clone(), sale.clone()))
            .collect()
    }
}
