use crate::*;
pub(crate) fn compute_dutch_price(collection: &LazyCollection) -> u128 {
    let floor = collection.price_near.0;
    let start_price = match collection.start_price {
        Some(sp) if sp.0 > floor => sp.0,
        _ => return floor,
    };
    let start = match collection.start_time {
        Some(t) => t,
        None => return floor,
    };
    let end = match collection.end_time {
        Some(t) => t,
        None => return floor,
    };
    let now = env::block_timestamp();
    if now <= start {
        return start_price;
    }
    if now >= end {
        return floor;
    }
    let elapsed = (now - start) as u128;
    let duration = (end - start) as u128;
    let diff = start_price - floor;
    let price_drop = (primitive_types::U256::from(diff) * primitive_types::U256::from(elapsed)
        / primitive_types::U256::from(duration))
    .as_u128();
    start_price - price_drop
}

pub(crate) fn refund_excess(buyer: &AccountId, deposit: u128, price: u128) {
    let refund = deposit.saturating_sub(price);
    if refund > 0 {
        let _ = Promise::new(buyer.clone()).transfer(NearToken::from_yoctonear(refund));
    }
}
