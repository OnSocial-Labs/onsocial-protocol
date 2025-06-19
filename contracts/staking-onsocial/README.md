Sustainable Emission Schedule:
Fixed 350M token pool over 50 years (~583,333 tokens/month).

Emissions stop after 50 years (EMISSION_END_TIMESTAMP).

Tracks total_emitted to prevent overspending.

Daily reward distribution (REWARD_INTERVAL) with 10% to relayer.

Staking Power (SP):
Multipliers: 1x (1 month), 2x (6 months), 5x (12 months), 12x (48 months).

SP determines reward share and tier (Basic, Premium, Pro).

Tier System:
Dynamic tiers based on SP percentage of total_sp:
Pro: ≥0.5% of total SP.

Premium: ≥0.1% of total SP.

Basic: <0.1% of total SP.

Queryable via get_user_tier.

NEP-141 Token Integration:
Placeholder ft_transfer_call and ft_transfer calls for token transfers.

Requires integration with the actual SOCIAL token contract address.

Uses Promise for cross-contract calls, ensuring secure token movement.

No Admin Functions:
Fully autonomous, trustless design.

Emission schedule and relayer share are hardcoded constants.

Early-Stage Considerations:
Fixed emission ensures high rewards per user when participation is low, incentivizing early adoption.

Self-regulates as more users stake (rewards dilute across SP).

Relayer funding (10%) scales with token price, ensuring sustainability.

Post-50-Year Plan:
Emissions stop after 50 years.

SP remains useful for tiers, platform perks, or future DAO-driven rewards.

Can transition to fee-based or platform-revenue-based rewards.

NEP-141 Token Integration
To fully integrate with a NEP-141 (Fungible Token) contract:
Update Token Contract Address:
Replace placeholder ft_transfer_call and ft_transfer with calls to the actual SOCIAL token contract.

Example:
rust

const TOKEN_CONTRACT: &str = "social.token.near";
Promise::new(TOKEN_CONTRACT.to_string()).function_call(
    "ft_transfer".into(),
    json!({
        "receiver_id": account_id,
        "amount": U128(amount),
    }).to_string().into_bytes(),
    1, // 1 yoctoNEAR for security
    10_000_000_000_000,
)

Implement ft_on_transfer:
Add a callback to handle token deposits:
rust

#[near_bindgen]
impl StakingContract {
    #[private]
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> U128 {
        assert_eq!(
            env::predecessor_account_id(),
            TOKEN_CONTRACT,
            "Only token contract can call this"
        );
        // Process stake with `amount.0` and parse `msg` for lock_period
        U128(0) // Return unused tokens
    }
}

Storage Deposit:
Ensure users have registered storage with the token contract before transfers.

Optionally, include a storage_deposit call in the staking flow.

User Flow
From a user perspective:
Stake:
User calls stake(lock_period) with attached tokens.

Tokens are transferred to the contract, SP is updated, and stake is recorded.

View Status:
Query get_stakes, get_user_sp, get_user_tier, and get_rewards.

See SP, tier, pending rewards, and unlock times.

Claim Rewards:
Call claim_rewards to receive pending SOCIAL tokens.

10% of rewards go to relayer_account.

Unstake:
After lock period, call unstake(index) to withdraw principal.

SP is reduced, tokens are returned.

Tiers:
Automatically updated based on SP share, used for platform perks.

Early-Stage and Long-Term Considerations
Low Liquidity:
Fixed emission ensures high rewards for early stakers, encouraging participation.

As user base grows, rewards dilute naturally, preventing inflation.

50-Year Sustainability:
350M token pool ensures rewards last 50 years.

Post-50 years, SP remains relevant for tiers, and rewards can shift to platform fees or DAO governance.

Relayer Funding:
10% of rewards (~58,333 tokens/month at start) funds relayer operations.

Scales with token price, ensuring long-term viability.

Next Steps
Test the Contract:
Deploy on NEAR testnet and simulate staking, claiming, and unstaking.

Verify emission caps and tier calculations.

NEP-141 Integration:
Replace placeholder token calls with actual SOCIAL token contract details.

Test ft_on_transfer and storage deposit flows.

Frontend Integration:
Build a UI in your Expo app with:
Staking simulator (input tokens, see SP and tier).

Countdown timers for unlock.

Reward and tier dashboards.

I can provide a React Native/Expo UI example if needed.

Indexer for Analytics:
Create an off-chain indexer to cache get_user_tier and get_stakes for faster UI updates.

Example queries for historical SP or reward trends.

Relayer Withdrawal:
Add a withdraw_relayer_rewards function (restricted to relayer_account):
rust

pub fn withdraw_relayer_rewards(&mut self) -> Promise {
    let account_id = env::predecessor_account_id();
    assert_eq!(account_id, self.relayer_account, "Only relayer can withdraw");
    let amount = self.rewards.get(&account_id).unwrap_or(0);
    self.rewards.insert(&account_id, &0);
    Promise::new(account_id.clone()).function_call(
        "ft_transfer".into(),
        json!({
            "receiver_id": account_id,
            "amount": U128(amount),
        }).to_string().into_bytes(),
        1,
        10_000_000_000_000,
    )
}

Would you like:
A detailed test script for NEAR testnet?

A frontend UI wireframe or code for Expo?

Indexer logic for off-chain analytics?

Further optimizations for gas or storage costs?

