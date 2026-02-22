use near_sdk::{
    env, near, AccountId, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    store::LookupMap,
};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::json;

pub type Balance = u128;

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct UserInfo {
    pub claimable: Balance,
    pub daily_earned: Balance,
    pub last_day: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct FtTransferCallMessage {
    pub action: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct RewardsContract {
    owner: AccountId,
    social_token: AccountId,
    max_daily: Balance,
    users: LookupMap<AccountId, UserInfo>,
    pool_balance: Balance, // Now represents actual tokens held
}

#[near]
impl RewardsContract {
    #[init]
    pub fn new(
        owner: AccountId,
        social_token: AccountId,
        max_daily: Balance,
    ) -> Self {
        Self {
            owner,
            social_token,
            max_daily,
            users: LookupMap::new(b"u"),
            pool_balance: 0, // Starts at 0, tokens must be deposited
        }
    }

    /// Credit rewards to a user (only callable by owner/backend)
    pub fn credit_reward(&mut self, account: AccountId, amount: Balance) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner can credit rewards"
        );

        assert!(
            self.pool_balance >= amount,
            "Insufficient pool balance"
        );

        let today = self.get_current_day();
        let mut user = self.users.get(&account).cloned().unwrap_or(UserInfo {
            claimable: 0,
            daily_earned: 0,
            last_day: 0,
        });

        // Reset daily counter if it's a new day
        if user.last_day < today {
            user.daily_earned = 0;
            user.last_day = today;
        }

        // Enforce daily cap
        let remaining_daily = self.max_daily.saturating_sub(user.daily_earned);
        let allowed = amount.min(remaining_daily);

        if allowed == 0 {
            env::panic_str("User has reached daily limit");
        }

        // Update user info with checked arithmetic
        user.claimable = user.claimable.checked_add(allowed)
            .expect("Claimable overflow");
        user.daily_earned = user.daily_earned.checked_add(allowed)
            .expect("Daily earned overflow");
        
        self.pool_balance = self.pool_balance.checked_sub(allowed)
            .expect("Pool balance underflow");

        self.users.insert(account, user);
    }

    /// User claims their accumulated rewards
    pub fn claim(&mut self) -> Promise {
        let account = env::predecessor_account_id();
        let mut user = self.users.get(&account).cloned()
            .expect("No rewards to claim");

        assert!(user.claimable > 0, "No claimable tokens");

        let amount = user.claimable;
        user.claimable = 0;

        self.users.insert(account.clone(), user);

        // Transfer tokens from THIS contract to the user
        Promise::new(self.social_token.clone()).function_call(
            "ft_transfer".to_string(),
            json!({
                "receiver_id": account,
                "amount": amount.to_string(),
                "memo": "Reward claim"
            })
            .to_string()
            .into_bytes(),
            NearToken::from_yoctonear(1),
            near_sdk::Gas::from_tgas(10),
        )
    }

    /// Owner can adjust the maximum daily reward limit
    pub fn set_max_daily(&mut self, new_max: Balance) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner can set max daily"
        );
        self.max_daily = new_max;
    }

    /// Transfer ownership
    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner can transfer ownership"
        );
        self.owner = new_owner;
    }

    // ========== NEP-141 Fungible Token Receiver ==========

    /// This is the callback that receives tokens when someone does:
    /// near contract call-function as-transaction social-token.near ft_transfer_call \
    ///   json-args '{"receiver_id": "rewards.near", "amount": "1000000", "msg": "{\"action\":\"deposit\"}"}' \
    ///   prepaid-gas '100.0 Tgas' attached-deposit '1 yoctoNEAR'
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: String,
        msg: String,
    ) -> PromiseOrValue<String> {
        // Verify the call is from the social token contract
        assert_eq!(
            env::predecessor_account_id(),
            self.social_token,
            "Only social token contract can call this"
        );

        let amount: Balance = amount.parse().expect("Invalid amount");

        // Parse the message to determine what to do
        let message: FtTransferCallMessage = near_sdk::serde_json::from_str(&msg)
            .unwrap_or(FtTransferCallMessage {
                action: "deposit".to_string(),
            });

        match message.action.as_str() {
            "deposit" => {
                // Only owner can deposit to pool
                assert_eq!(sender_id, self.owner, "Only owner can deposit tokens to pool");
                
                self.pool_balance = self.pool_balance.checked_add(amount)
                    .expect("Pool balance overflow");
                
                env::log_str(&format!("Deposited {} tokens to pool. New balance: {}", amount, self.pool_balance));
                
                // Return "0" to keep all tokens (don't refund)
                PromiseOrValue::Value("0".to_string())
            }
            _ => {
                env::panic_str("Invalid action in message");
            }
        }
    }

    // ========== View Methods ==========

    pub fn get_claimable(&self, account: AccountId) -> Balance {
        self.users.get(&account)
            .map(|u| u.claimable)
            .unwrap_or(0)
    }

    pub fn get_user_info(&self, account: AccountId) -> Option<UserInfo> {
        self.users.get(&account).cloned()
    }

    pub fn get_pool_balance(&self) -> Balance {
        self.pool_balance
    }

    pub fn get_max_daily(&self) -> Balance {
        self.max_daily
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_social_token(&self) -> AccountId {
        self.social_token.clone()
    }

    // ========== Private Methods ==========

    fn get_current_day(&self) -> u64 {
        env::block_timestamp() / 86_400_000_000_000
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn test_ft_on_transfer_deposit() {
        let owner = accounts(0);
        let token = accounts(1);
        
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let mut contract = RewardsContract::new(
            owner.clone(),
            token.clone(),
            10_000,
        );

        // Simulate token contract calling ft_on_transfer
        let context = get_context(token.clone());
        testing_env!(context.build());

        let result = contract.ft_on_transfer(
            owner,
            "50000".to_string(),
            r#"{"action":"deposit"}"#.to_string(),
        );

        assert_eq!(contract.get_pool_balance(), 50000);
        
        match result {
            PromiseOrValue::Value(v) => assert_eq!(v, "0"),
            _ => panic!("Expected Value"),
        }
    }
}