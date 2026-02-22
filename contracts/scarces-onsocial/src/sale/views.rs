use crate::*;

#[near]
impl Contract {
    pub fn get_sale(&self, scarce_contract_id: AccountId, token_id: String) -> Option<Sale> {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        self.sales.get(&sale_id).cloned()
    }

    pub fn get_supply_sales(&self) -> u64 {
        self.sales.len() as u64
    }

    pub fn get_supply_by_owner_id(&self, account_id: AccountId) -> u64 {
        self.by_owner_id
            .get(&account_id)
            .map(|set| set.len() as u64)
            .unwrap_or(0)
    }

    pub fn get_supply_by_scarce_contract_id(&self, scarce_contract_id: AccountId) -> u64 {
        self.by_scarce_contract_id
            .get(&scarce_contract_id)
            .map(|set| set.len() as u64)
            .unwrap_or(0)
    }

    pub fn get_sales_by_owner_id(
        &self,
        account_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Sale> {
        let Some(sales) = self.by_owner_id.get(&account_id) else {
            return vec![];
        };

        let start = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);

        sales
            .iter()
            .skip(start as usize)
            .take(limit as usize)
            .filter_map(|sale_id| self.sales.get(sale_id).cloned())
            .collect()
    }

    pub fn get_sales_by_scarce_contract_id(
        &self,
        scarce_contract_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Sale> {
        let Some(sales) = self.by_scarce_contract_id.get(&scarce_contract_id) else {
            return vec![];
        };

        let start = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);

        sales
            .iter()
            .skip(start as usize)
            .take(limit as usize)
            .filter_map(|sale_id| self.sales.get(sale_id).cloned())
            .collect()
    }

    pub fn get_sales(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Sale> {
        let start = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);

        self.sales
            .iter()
            .skip(start as usize)
            .take(limit as usize)
            .map(|(_, sale)| sale.clone())
            .collect()
    }

    pub fn is_sale_expired(&self, scarce_contract_id: AccountId, token_id: String) -> Option<bool> {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        let sale = self.sales.get(&sale_id)?;
        Some(sale.expires_at.is_some_and(|exp| env::block_timestamp() > exp))
    }

    pub fn get_expired_sales(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<(String, Sale)> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100);
        let now = env::block_timestamp();

        self.sales
            .iter()
            .skip(start)
            .filter(|(_, sale)| sale.expires_at.is_some_and(|exp| now > exp))
            .take(limit as usize)
            .map(|(id, sale)| (id.clone(), sale.clone()))
            .collect()
    }

    pub fn get_auction(&self, token_id: String) -> Option<AuctionView> {
        let sale_id = Contract::make_sale_id(&env::current_account_id(), &token_id);
        let sale = self.sales.get(&sale_id)?;
        let auction = sale.auction.as_ref()?;
        Some(AuctionView {
            token_id,
            seller_id: sale.owner_id.clone(),
            reserve_price: U128(auction.reserve_price),
            min_bid_increment: U128(auction.min_bid_increment),
            highest_bid: U128(auction.highest_bid),
            highest_bidder: auction.highest_bidder.clone(),
            bid_count: auction.bid_count,
            expires_at: sale.expires_at,
            anti_snipe_extension_ns: auction.anti_snipe_extension_ns,
            buy_now_price: auction.buy_now_price.map(U128),
            is_ended: sale.expires_at.is_some_and(|e| env::block_timestamp() >= e),
            reserve_met: auction.highest_bid >= auction.reserve_price && auction.highest_bid > 0,
        })
    }

    pub fn get_auctions(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<AuctionView> {
        let start = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);

        self.sales
            .iter()
            .skip(start as usize)
            .filter(|(_, sale)| sale.auction.is_some())
            .take(limit as usize)
            .filter_map(|(_, sale)| {
                let auction = sale.auction.as_ref()?;
                let token_id = match &sale.sale_type {
                    SaleType::NativeScarce { token_id } => token_id.clone(),
                    _ => return None,
                };
                Some(AuctionView {
                    token_id,
                    seller_id: sale.owner_id.clone(),
                    reserve_price: U128(auction.reserve_price),
                    min_bid_increment: U128(auction.min_bid_increment),
                    highest_bid: U128(auction.highest_bid),
                    highest_bidder: auction.highest_bidder.clone(),
                    bid_count: auction.bid_count,
                    expires_at: sale.expires_at,
                    anti_snipe_extension_ns: auction.anti_snipe_extension_ns,
                    buy_now_price: auction.buy_now_price.map(U128),
                    is_ended: sale.expires_at.is_some_and(|e| env::block_timestamp() >= e),
                    reserve_met: auction.highest_bid >= auction.reserve_price
                        && auction.highest_bid > 0,
                })
            })
            .collect()
    }
}
