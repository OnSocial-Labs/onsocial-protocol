use near_sdk::{env, near, AccountId, Balance, borsh::{BorshDeserialize, BorshSerialize}, collections::LookupMap, json_types::U128, near_bindgen, Promise, Gas};

#[derive(BorshDeserialize, BorshSerialize)]
pub struct PendingRewards {
    amount: Balance,
    last_action_time: u64,
    daily_earned: Balance,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct RewardsContract {
    pending: LookupMap<AccountId, PendingRewards>,
    pool: Balance,
    initial_pool: Balance,  // Set on first deposit
    token_account: AccountId,
    daily_max_per_user: Balance,  // e.g., 2 * 10^24
    relayer_account: AccountId,  // relayer.account for gas sponsorship
}

impl Default for RewardsContract {
    fn default() -> Self {
        Self {
            pending: LookupMap::new(b"p"),
            pool: 0,
            initial_pool: 0,
            token_account: env::predecessor_account_id(),
            daily_max_per_user: 2 * 10u128.pow(24),  // Adjust decimals
            relayer_account: env::predecessor_account_id(),
        }
    }
}

#[near_bindgen]
impl RewardsContract {
    #[init]
    pub fn new(token_account: AccountId, relayer_account: AccountId) -> Self {
        Self {
            token_account,
            relayer_account,
            ..Default::default()
        }
    }

    pub fn accrue(&mut self, user: AccountId, action_type: String) {
        let base = match action_type.as_str() {
            "like" => 0.1 * 10u128.pow(24),  // Adjust decimals
            "share" => 0.2 * 10u128.pow(24),
            "post" => 0.5 * 10u128.pow(24),
            "comment" => 0.3 * 10u128.pow(24),
            _ => 0,
        };
        let mut pend = self.pending.get(&user).unwrap_or(PendingRewards {
            amount: 0,
            last_action_time: 0,
            daily_earned: 0,
        });
        let now = env::block_timestamp();
        if now - pend.last_action_time >= 86400 * 1_000_000_000 {
            pend.daily_earned = 0;  // Reset daily
        }
        let pool_factor = if self.initial_pool > 0 {
            ((self.pool * 100 / self.initial_pool) as f64).powf(0.5) / 10.0  // Curve; use int approx in prod
        } else { 1.0 };
        let amount = (base as f64 * pool_factor.max(0.1)) as u128;
        assert!(pend.daily_earned + amount <= self.daily_max_per_user, "Daily cap exceeded");
        pend.amount += amount;
        pend.daily_earned += amount;
        pend.last_action_time = now;
        self.pending.insert(&user, &pend);
        self.pool -= amount;
    }

    pub fn claim(&mut self) {
        let user = env::predecessor_account_id();
        let mut pend = self.pending.get(&user).unwrap_or_default();
        let amount = pend.amount;
        let relayer_share = amount * 5 / 100;  // 5% to relayer
        pend.amount = 0;
        pend.daily_earned = 0;
        self.pending.insert(&user, &pend);
        // Redirect to relayer
        ext_ft::ext(self.token_account.clone())
            .with_attached_deposit(1)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(self.relayer_account.clone(), U128(relayer_share), None);
        // User gets net
        ext_ft::ext(self.token_account.clone())
            .with_attached_deposit(1)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(user, U128(amount - relayer_share), None);
    }

    #[payable]
    pub fn deposit_rewards(&mut self, amount: U128) {
        if self.initial_pool == 0 { self.initial_pool = amount.0; }
        self.pool += amount.0;
    }

    // View methods
    pub fn get_pending(&self, account_id: AccountId) -> Balance {
        self.pending.get(&account_id).map_or(0, |p| p.amount)
    }

    pub fn get_pool(&self) -> U128 {
        U128(self.pool)
    }
}

// External interfaces
#[near_bindgen]
#[ext_contract(ext_ft)]
pub trait Ft {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

const GAS_FOR_FT_TRANSFER: Gas = Gas(5_000_000_000_000);