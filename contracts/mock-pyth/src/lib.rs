//! Pyth stand-in for sandbox purchases.
//!
//! `update_price_feeds` accepts the hex payload. `get_price_no_older_than`
//! returns the quote this contract was initialized with. The scarce contract
//! reads that JSON the same way it reads the real oracle.

use near_sdk::{env, near, PanicOnDefault};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockPyth {
    price: String,
    conf: String,
    expo: i32,
    fail_updates: bool,
}

#[near(serializers = [json])]
pub struct MockPrice {
    pub price: String,
    pub conf: String,
    pub expo: i32,
    pub publish_time: String,
}

#[near]
impl MockPyth {
    #[init]
    pub fn new(price: String, conf: String, expo: i32) -> Self {
        Self {
            price,
            conf,
            expo,
            fail_updates: false,
        }
    }

    pub fn set_quote(&mut self, price: String, conf: String, expo: i32) {
        self.price = price;
        self.conf = conf;
        self.expo = expo;
    }

    pub fn set_fail_updates(&mut self, fail: bool) {
        self.fail_updates = fail;
    }

    #[payable]
    pub fn update_price_feeds(&mut self, data: String) {
        if self.fail_updates {
            env::panic_str("Pyth update rejected");
        }
        if data.is_empty() {
            env::panic_str("Pyth update is empty");
        }
    }

    pub fn get_price_no_older_than(&self, price_id: String, age: u64) -> MockPrice {
        let _ = (price_id, age);
        MockPrice {
            price: self.price.clone(),
            conf: self.conf.clone(),
            expo: self.expo,
            publish_time: "1".to_string(),
        }
    }
}
