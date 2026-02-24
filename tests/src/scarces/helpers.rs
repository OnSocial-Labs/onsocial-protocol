// =============================================================================
// Scarces Integration Test Helpers
// =============================================================================
// Shared setup, deploy, and call helpers used across all scarces test files.
//
// CONVENTIONS:
// - Every test gets a fresh sandbox via `setup_sandbox()`
// - `deploy_scarces()` deploys the WASM and calls `new`
// - Action helpers wrap the `execute` entry point for readability
// - View helpers provide typed deserialization of common queries

use anyhow::Result;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::utils::get_wasm_path;

// =============================================================================
// Re-export sandbox setup so test files only need `use super::helpers::*`
// =============================================================================
pub use crate::utils::setup_sandbox as create_sandbox;

// =============================================================================
// Constants
// =============================================================================

/// 1 yoctoNEAR — required for owner-gated state-change calls
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

/// A generous deposit for storage / minting (0.1 NEAR)
pub const DEPOSIT_STORAGE: NearToken = NearToken::from_millinear(100);

/// A larger deposit for operations that need more gas (0.5 NEAR)
pub const DEPOSIT_LARGE: NearToken = NearToken::from_millinear(500);

/// Minimum storage deposit to register (0.01 NEAR)
pub const DEPOSIT_REGISTER: NearToken = NearToken::from_millinear(10);

// =============================================================================
// View Structs (mirror contract return types for typed deserialization)
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScarceContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub token_id: String,
    pub owner_id: String,
    pub metadata: Option<TokenMetadata>,
    pub approved_account_ids: Option<std::collections::HashMap<String, u64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub copies: Option<u64>,
    pub issued_at: Option<u64>,
    pub expires_at: Option<u64>,
    pub starts_at: Option<u64>,
    pub updated_at: Option<u64>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenStatus {
    pub token_id: String,
    pub owner_id: String,
    pub creator_id: String,
    pub minter_id: String,
    pub collection_id: Option<String>,
    pub metadata: TokenMetadata,
    pub royalty: Option<std::collections::HashMap<String, u32>>,
    pub is_valid: bool,
    pub is_revoked: bool,
    pub revoked_at: Option<u64>,
    pub revocation_memo: Option<String>,
    pub is_expired: bool,
    pub redeem_count: u32,
    pub max_redeems: Option<u32>,
    pub is_fully_redeemed: bool,
    pub redeemed_at: Option<u64>,
    pub is_refunded: bool,
    pub paid_price: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeConfig {
    pub total_fee_bps: u16,
    pub app_pool_fee_bps: u16,
    pub platform_storage_fee_bps: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payout {
    pub payout: std::collections::HashMap<String, String>,
}

// =============================================================================
// Deploy & Init
// =============================================================================

/// Deploy the scarces-onsocial contract and call `new` with the given owner.
/// Attaches 5 NEAR to seed the mandatory platform storage pool.
pub async fn deploy_scarces(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("scarces-onsocial");
    let wasm = std::fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;

    owner
        .call(contract.id(), "new")
        .args_json(json!({
            "owner_id": owner.id().to_string(),
        }))
        .deposit(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

/// Deploy with custom contract metadata.
pub async fn deploy_scarces_with_metadata(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
    name: &str,
    symbol: &str,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("scarces-onsocial");
    let wasm = std::fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;

    owner
        .call(contract.id(), "new")
        .args_json(json!({
            "owner_id": owner.id().to_string(),
            "contract_metadata": {
                "spec": "nft-2.0.0",
                "name": name,
                "symbol": symbol,
            }
        }))
        .deposit(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

// =============================================================================
// Execute Helper — wraps the single `execute` entry point
// =============================================================================

/// Call `execute` on the scarces contract as `caller` with the given action JSON.
/// Attaches `deposit` NEAR. Returns the raw JSON result.
pub async fn execute_action(
    contract: &Contract,
    caller: &Account,
    action: Value,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let result = caller
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": action,
            }
        }))
        .deposit(deposit)
        .max_gas()
        .transact()
        .await?;

    Ok(result)
}

/// Same as `execute_action` but with `target_account` set.
pub async fn execute_action_with_target(
    contract: &Contract,
    caller: &Account,
    action: Value,
    target_account: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let result = caller
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": target_account,
                "action": action,
            }
        }))
        .deposit(deposit)
        .max_gas()
        .transact()
        .await?;

    Ok(result)
}

// =============================================================================
// Storage Helpers
// =============================================================================

/// Deposit storage for `account_id` (or the caller if None).
pub async fn storage_deposit(
    contract: &Contract,
    caller: &Account,
    account_id: Option<&str>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({ "type": "storage_deposit" });
    if let Some(id) = account_id {
        action["account_id"] = json!(id);
    }
    execute_action(contract, caller, action, deposit).await
}

/// View the storage balance of an account.
pub async fn storage_balance_of(
    contract: &Contract,
    account_id: &str,
) -> Result<String> {
    let result = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    let balance: String = serde_json::from_slice(&result.result)?;
    Ok(balance)
}

// =============================================================================
// QuickMint Helper
// =============================================================================

/// Mint a single NFT via QuickMint action. Returns the execute result.
pub async fn quick_mint(
    contract: &Contract,
    caller: &Account,
    title: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "quick_mint",
            "metadata": {
                "title": title,
            },
            "transferable": true,
            "burnable": true,
        }),
        deposit,
    )
    .await
}

/// Mint with full metadata + options.
pub async fn quick_mint_full(
    contract: &Contract,
    caller: &Account,
    metadata: Value,
    royalty: Option<Value>,
    app_id: Option<&str>,
    transferable: bool,
    burnable: bool,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "quick_mint",
        "metadata": metadata,
        "transferable": transferable,
        "burnable": burnable,
    });
    if let Some(r) = royalty {
        action["royalty"] = r;
    }
    if let Some(app) = app_id {
        action["app_id"] = json!(app);
    }
    execute_action(contract, caller, action, deposit).await
}

// =============================================================================
// NFT View Helpers
// =============================================================================

/// View `nft_token` for a given token_id.
pub async fn nft_token(contract: &Contract, token_id: &str) -> Result<Option<Token>> {
    let result = contract
        .view("nft_token")
        .args_json(json!({ "token_id": token_id }))
        .await?;
    let token: Option<Token> = serde_json::from_slice(&result.result)?;
    Ok(token)
}

/// View `nft_total_supply`.
pub async fn nft_total_supply(contract: &Contract) -> Result<String> {
    let result = contract.view("nft_total_supply").await?;
    let supply: String = serde_json::from_slice(&result.result)?;
    Ok(supply)
}

/// View `nft_supply_for_owner`.
pub async fn nft_supply_for_owner(contract: &Contract, account_id: &str) -> Result<String> {
    let result = contract
        .view("nft_supply_for_owner")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    let supply: String = serde_json::from_slice(&result.result)?;
    Ok(supply)
}

/// View `nft_tokens_for_owner`.
pub async fn nft_tokens_for_owner(
    contract: &Contract,
    account_id: &str,
    from_index: Option<&str>,
    limit: Option<u64>,
) -> Result<Vec<Token>> {
    let mut args = json!({ "account_id": account_id });
    if let Some(idx) = from_index {
        args["from_index"] = json!(idx);
    }
    if let Some(l) = limit {
        args["limit"] = json!(l);
    }
    let result = contract
        .view("nft_tokens_for_owner")
        .args_json(args)
        .await?;
    let tokens: Vec<Token> = serde_json::from_slice(&result.result)?;
    Ok(tokens)
}

/// View `nft_metadata` (contract-level metadata).
pub async fn nft_metadata(contract: &Contract) -> Result<ScarceContractMetadata> {
    let result = contract.view("nft_metadata").await?;
    let meta: ScarceContractMetadata = serde_json::from_slice(&result.result)?;
    Ok(meta)
}

/// View `get_token_status`.
pub async fn get_token_status(contract: &Contract, token_id: &str) -> Result<Option<TokenStatus>> {
    let result = contract
        .view("get_token_status")
        .args_json(json!({ "token_id": token_id }))
        .await?;
    let status: Option<TokenStatus> = serde_json::from_slice(&result.result)?;
    Ok(status)
}

/// View `get_fee_config`.
pub async fn get_fee_config(contract: &Contract) -> Result<FeeConfig> {
    let result = contract.view("get_fee_config").await?;
    let config: FeeConfig = serde_json::from_slice(&result.result)?;
    Ok(config)
}

/// View `get_fee_recipient`.
pub async fn get_fee_recipient(contract: &Contract) -> Result<String> {
    let result = contract.view("get_fee_recipient").await?;
    let recipient: String = serde_json::from_slice(&result.result)?;
    Ok(recipient)
}

// =============================================================================
// Admin View Helpers
// =============================================================================

/// View `get_owner`.
pub async fn get_owner(contract: &Contract) -> Result<String> {
    let result = contract.view("get_owner").await?;
    let owner: String = serde_json::from_slice(&result.result)?;
    Ok(owner)
}

/// View `get_version`.
pub async fn get_version(contract: &Contract) -> Result<String> {
    let result = contract.view("get_version").await?;
    let version: String = serde_json::from_slice(&result.result)?;
    Ok(version)
}

/// View `get_approved_nft_contracts`.
pub async fn get_approved_nft_contracts(contract: &Contract) -> Result<Vec<String>> {
    let result = contract.view("get_approved_nft_contracts").await?;
    let contracts: Vec<String> = serde_json::from_slice(&result.result)?;
    Ok(contracts)
}

// =============================================================================
// Collection View Structs
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LazyCollection {
    pub creator_id: String,
    pub collection_id: String,
    pub total_supply: u32,
    pub minted_count: u32,
    pub metadata_template: String,
    pub price_near: String,
    pub start_price: Option<String>,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub created_at: u64,
    pub app_id: Option<String>,
    pub royalty: Option<std::collections::HashMap<String, u32>>,
    pub renewable: bool,
    #[serde(default)]
    pub revocation_mode: String,
    #[serde(default)]
    pub max_redeems: Option<u32>,
    #[serde(default)]
    pub redeemed_count: u32,
    #[serde(default)]
    pub fully_redeemed_count: u32,
    pub burnable: bool,
    pub transferable: bool,
    pub paused: bool,
    pub cancelled: bool,
    pub mint_mode: String,
    pub max_per_wallet: Option<u32>,
    pub banned: bool,
    pub metadata: Option<String>,
    #[serde(default)]
    pub app_metadata: Option<String>,
    #[serde(default)]
    pub refund_pool: String,
    #[serde(default)]
    pub refund_per_token: String,
    #[serde(default)]
    pub refunded_count: u32,
    #[serde(default)]
    pub refund_deadline: Option<u64>,
    #[serde(default)]
    pub total_revenue: String,
    #[serde(default)]
    pub allowlist_price: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionStats {
    pub collection_id: String,
    pub creator_id: String,
    pub total_supply: u32,
    pub minted_count: u32,
    pub remaining: u32,
    pub price_near: String,
    pub current_price: String,
    pub total_revenue: String,
    pub is_active: bool,
    pub is_sold_out: bool,
    pub cancelled: bool,
    pub paused: bool,
    pub banned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionProgress {
    pub minted: u32,
    pub total: u32,
    pub remaining: u32,
    pub percentage: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sale {
    pub owner_id: String,
    pub sale_conditions: String,
    pub sale_type: Value,
    pub expires_at: Option<u64>,
    pub auction: Option<Value>,
}

// =============================================================================
// Collection Helpers
// =============================================================================

/// Create a collection via the execute action.
pub async fn create_collection(
    contract: &Contract,
    caller: &Account,
    collection_id: &str,
    total_supply: u32,
    price_near: &str,
    metadata_template: Value,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "create_collection",
            "collection_id": collection_id,
            "total_supply": total_supply,
            "metadata_template": metadata_template.to_string(),
            "price_near": price_near,
            "transferable": true,
            "burnable": true,
        }),
        deposit,
    )
    .await
}

/// Create a collection associated with an app_id.
pub async fn create_collection_for_app(
    contract: &Contract,
    caller: &Account,
    collection_id: &str,
    total_supply: u32,
    price_near: &str,
    metadata_template: Value,
    app_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "create_collection",
            "collection_id": collection_id,
            "total_supply": total_supply,
            "metadata_template": metadata_template.to_string(),
            "price_near": price_near,
            "transferable": true,
            "burnable": true,
            "app_id": app_id,
        }),
        deposit,
    )
    .await
}

/// Mint from collection via execute action (creator mint).
pub async fn mint_from_collection(
    contract: &Contract,
    caller: &Account,
    collection_id: &str,
    quantity: u32,
    receiver_id: Option<&str>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "mint_from_collection",
        "collection_id": collection_id,
        "quantity": quantity,
    });
    if let Some(recv) = receiver_id {
        action["receiver_id"] = json!(recv);
    }
    execute_action(contract, caller, action, deposit).await
}

/// Purchase from collection via execute action.
pub async fn purchase_from_collection(
    contract: &Contract,
    buyer: &Account,
    collection_id: &str,
    quantity: u32,
    max_price_per_token: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        buyer,
        json!({
            "type": "purchase_from_collection",
            "collection_id": collection_id,
            "quantity": quantity,
            "max_price_per_token": max_price_per_token,
        }),
        deposit,
    )
    .await
}

/// Airdrop from collection.
pub async fn airdrop_from_collection(
    contract: &Contract,
    caller: &Account,
    collection_id: &str,
    receivers: Vec<String>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "airdrop_from_collection",
            "collection_id": collection_id,
            "receivers": receivers,
        }),
        deposit,
    )
    .await
}

/// List a native scarce for sale via execute action.
pub async fn list_native_scarce(
    contract: &Contract,
    caller: &Account,
    token_id: &str,
    price: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "list_native_scarce",
            "token_id": token_id,
            "price": price,
        }),
        deposit,
    )
    .await
}

/// Delist a native scarce from sale.
pub async fn delist_native_scarce(
    contract: &Contract,
    caller: &Account,
    token_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "delist_native_scarce",
            "token_id": token_id,
        }),
        deposit,
    )
    .await
}

/// Purchase a native scarce listing.
pub async fn purchase_native_scarce(
    contract: &Contract,
    buyer: &Account,
    token_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        buyer,
        json!({
            "type": "purchase_native_scarce",
            "token_id": token_id,
        }),
        deposit,
    )
    .await
}

/// Update the price of a listed native scarce.
pub async fn update_native_price(
    contract: &Contract,
    caller: &Account,
    token_id: &str,
    new_price: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    // update_price uses scarce_contract_id = the contract itself for native scarces
    execute_action(
        contract,
        caller,
        json!({
            "type": "update_price",
            "scarce_contract_id": contract.id().to_string(),
            "token_id": token_id,
            "price": new_price,
        }),
        deposit,
    )
    .await
}

// =============================================================================
// Collection View Helpers
// =============================================================================

/// View `get_collection`.
pub async fn get_collection(
    contract: &Contract,
    collection_id: &str,
) -> Result<Option<LazyCollection>> {
    let result = contract
        .view("get_collection")
        .args_json(json!({ "collection_id": collection_id }))
        .await?;
    let col: Option<LazyCollection> = serde_json::from_slice(&result.result)?;
    Ok(col)
}

/// View `get_collection_availability`.
pub async fn get_collection_availability(
    contract: &Contract,
    collection_id: &str,
) -> Result<u32> {
    let result = contract
        .view("get_collection_availability")
        .args_json(json!({ "collection_id": collection_id }))
        .await?;
    let avail: u32 = serde_json::from_slice(&result.result)?;
    Ok(avail)
}

/// View `is_collection_sold_out`.
pub async fn is_collection_sold_out(
    contract: &Contract,
    collection_id: &str,
) -> Result<bool> {
    let result = contract
        .view("is_collection_sold_out")
        .args_json(json!({ "collection_id": collection_id }))
        .await?;
    let sold_out: bool = serde_json::from_slice(&result.result)?;
    Ok(sold_out)
}

/// View `is_collection_mintable`.
pub async fn is_collection_mintable(
    contract: &Contract,
    collection_id: &str,
) -> Result<bool> {
    let result = contract
        .view("is_collection_mintable")
        .args_json(json!({ "collection_id": collection_id }))
        .await?;
    let mintable: bool = serde_json::from_slice(&result.result)?;
    Ok(mintable)
}

/// View `get_collection_progress`.
pub async fn get_collection_progress(
    contract: &Contract,
    collection_id: &str,
) -> Result<Option<CollectionProgress>> {
    let result = contract
        .view("get_collection_progress")
        .args_json(json!({ "collection_id": collection_id }))
        .await?;
    let progress: Option<CollectionProgress> = serde_json::from_slice(&result.result)?;
    Ok(progress)
}

/// View `get_total_collections`.
pub async fn get_total_collections(contract: &Contract) -> Result<u64> {
    let result = contract.view("get_total_collections").await?;
    let count: u64 = serde_json::from_slice(&result.result)?;
    Ok(count)
}

/// View `get_app_count`.
pub async fn get_app_count(contract: &Contract) -> Result<u32> {
    let result = contract.view("get_app_count").await?;
    let count: u32 = serde_json::from_slice(&result.result)?;
    Ok(count)
}

/// View `get_all_app_ids` with optional pagination.
pub async fn get_all_app_ids(
    contract: &Contract,
    from_index: Option<u32>,
    limit: Option<u32>,
) -> Result<Vec<String>> {
    let result = contract
        .view("get_all_app_ids")
        .args_json(json!({ "from_index": from_index, "limit": limit }))
        .await?;
    let ids: Vec<String> = serde_json::from_slice(&result.result)?;
    Ok(ids)
}

/// View `get_collections_by_creator`.
pub async fn get_collections_by_creator(
    contract: &Contract,
    creator_id: &str,
) -> Result<Vec<LazyCollection>> {
    let result = contract
        .view("get_collections_by_creator")
        .args_json(json!({ "creator_id": creator_id }))
        .await?;
    let cols: Vec<LazyCollection> = serde_json::from_slice(&result.result)?;
    Ok(cols)
}

// =============================================================================
// Sale View Helpers
// =============================================================================

/// View `get_sale` for a native scarce (contract_id = the scarces contract itself).
pub async fn get_sale(
    contract: &Contract,
    token_id: &str,
) -> Result<Option<Sale>> {
    let result = contract
        .view("get_sale")
        .args_json(json!({
            "scarce_contract_id": contract.id().to_string(),
            "token_id": token_id,
        }))
        .await?;
    let sale: Option<Sale> = serde_json::from_slice(&result.result)?;
    Ok(sale)
}

/// View `get_supply_sales`.
pub async fn get_supply_sales(contract: &Contract) -> Result<u64> {
    let result = contract.view("get_supply_sales").await?;
    let count: u64 = serde_json::from_slice(&result.result)?;
    Ok(count)
}

/// View `get_supply_by_owner_id`.
pub async fn get_supply_by_owner_id(
    contract: &Contract,
    account_id: &str,
) -> Result<u64> {
    let result = contract
        .view("get_supply_by_owner_id")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    let count: u64 = serde_json::from_slice(&result.result)?;
    Ok(count)
}

/// View `get_sales_by_owner_id`.
pub async fn get_sales_by_owner_id(
    contract: &Contract,
    account_id: &str,
) -> Result<Vec<Sale>> {
    let result = contract
        .view("get_sales_by_owner_id")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    let sales: Vec<Sale> = serde_json::from_slice(&result.result)?;
    Ok(sales)
}

// =============================================================================
// Auction View Structs
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuctionView {
    pub token_id: String,
    pub seller_id: String,
    pub reserve_price: String,
    pub min_bid_increment: String,
    pub highest_bid: String,
    pub highest_bidder: Option<String>,
    pub bid_count: u32,
    pub expires_at: Option<u64>,
    pub anti_snipe_extension_ns: u64,
    pub buy_now_price: Option<String>,
    pub is_ended: bool,
    pub reserve_met: bool,
}

// =============================================================================
// Offer View Structs
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfferView {
    pub buyer_id: String,
    pub amount: String,
    pub expires_at: Option<u64>,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionOfferView {
    pub buyer_id: String,
    pub amount: String,
    pub expires_at: Option<u64>,
    pub created_at: u64,
}

// =============================================================================
// Lazy Listing View Structs
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LazyListingRecord {
    pub creator_id: String,
    pub metadata: TokenMetadata,
    pub price: String,
    pub royalty: Option<std::collections::HashMap<String, u32>>,
    pub app_id: Option<String>,
    pub transferable: bool,
    pub burnable: bool,
    pub expires_at: Option<u64>,
    pub created_at: u64,
}

// =============================================================================
// Auction Action Helpers
// =============================================================================

/// List a native scarce as an auction. Uses deferred-start (`auction_duration_ns`)
/// or fixed-end (`expires_at`).
pub async fn list_native_scarce_auction(
    contract: &Contract,
    caller: &Account,
    token_id: &str,
    reserve_price: &str,
    min_bid_increment: &str,
    auction_duration_ns: Option<u64>,
    expires_at: Option<u64>,
    buy_now_price: Option<&str>,
    anti_snipe_extension_ns: u64,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "list_native_scarce_auction",
        "token_id": token_id,
        "reserve_price": reserve_price,
        "min_bid_increment": min_bid_increment,
        "anti_snipe_extension_ns": anti_snipe_extension_ns,
    });
    if let Some(dur) = auction_duration_ns {
        action["auction_duration_ns"] = json!(dur);
    }
    if let Some(exp) = expires_at {
        action["expires_at"] = json!(exp);
    }
    if let Some(bnp) = buy_now_price {
        action["buy_now_price"] = json!(bnp);
    }
    execute_action(contract, caller, action, deposit).await
}

/// Place a bid on an auction. Attached deposit must be >= amount.
pub async fn place_bid(
    contract: &Contract,
    bidder: &Account,
    token_id: &str,
    amount: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        bidder,
        json!({
            "type": "place_bid",
            "token_id": token_id,
            "amount": amount,
        }),
        deposit,
    )
    .await
}

/// Settle an ended auction. Anyone can call.
pub async fn settle_auction(
    contract: &Contract,
    caller: &Account,
    token_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "settle_auction",
            "token_id": token_id,
        }),
        deposit,
    )
    .await
}

/// Cancel an auction with zero bids. Requires 1 yoctoNEAR.
pub async fn cancel_auction(
    contract: &Contract,
    caller: &Account,
    token_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "cancel_auction",
            "token_id": token_id,
        }),
        deposit,
    )
    .await
}

// =============================================================================
// Offer Action Helpers
// =============================================================================

/// Make an offer on a specific token. Attached deposit must be >= amount.
pub async fn make_offer(
    contract: &Contract,
    buyer: &Account,
    token_id: &str,
    amount: &str,
    expires_at: Option<u64>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "make_offer",
        "token_id": token_id,
        "amount": amount,
    });
    if let Some(exp) = expires_at {
        action["expires_at"] = json!(exp);
    }
    execute_action(contract, buyer, action, deposit).await
}

/// Accept an offer — transfers token to buyer. Requires 1 yoctoNEAR.
pub async fn accept_offer(
    contract: &Contract,
    owner: &Account,
    token_id: &str,
    buyer_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        owner,
        json!({
            "type": "accept_offer",
            "token_id": token_id,
            "buyer_id": buyer_id,
        }),
        deposit,
    )
    .await
}

/// Cancel an offer — refunds buyer. Requires 1 yoctoNEAR.
pub async fn cancel_offer(
    contract: &Contract,
    buyer: &Account,
    token_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        buyer,
        json!({
            "type": "cancel_offer",
            "token_id": token_id,
        }),
        deposit,
    )
    .await
}

/// Make a collection offer. Attached deposit must be >= amount.
pub async fn make_collection_offer(
    contract: &Contract,
    buyer: &Account,
    collection_id: &str,
    amount: &str,
    expires_at: Option<u64>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "make_collection_offer",
        "collection_id": collection_id,
        "amount": amount,
    });
    if let Some(exp) = expires_at {
        action["expires_at"] = json!(exp);
    }
    execute_action(contract, buyer, action, deposit).await
}

/// Accept a collection offer with a specific token. Requires 1 yoctoNEAR.
pub async fn accept_collection_offer(
    contract: &Contract,
    owner: &Account,
    collection_id: &str,
    token_id: &str,
    buyer_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        owner,
        json!({
            "type": "accept_collection_offer",
            "collection_id": collection_id,
            "token_id": token_id,
            "buyer_id": buyer_id,
        }),
        deposit,
    )
    .await
}

/// Cancel a collection offer. Requires 1 yoctoNEAR.
pub async fn cancel_collection_offer(
    contract: &Contract,
    buyer: &Account,
    collection_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        buyer,
        json!({
            "type": "cancel_collection_offer",
            "collection_id": collection_id,
        }),
        deposit,
    )
    .await
}

// =============================================================================
// Lazy Listing Action Helpers
// =============================================================================

/// Create a lazy listing (mint-on-demand). Metadata fields are flattened.
pub async fn create_lazy_listing(
    contract: &Contract,
    creator: &Account,
    metadata: Value,
    price: &str,
    transferable: bool,
    burnable: bool,
    expires_at: Option<u64>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "create_lazy_listing",
        "metadata": metadata,
        "price": price,
        "transferable": transferable,
        "burnable": burnable,
    });
    if let Some(exp) = expires_at {
        action["expires_at"] = json!(exp);
    }
    execute_action(contract, creator, action, deposit).await
}

/// Cancel a lazy listing. Requires 1 yoctoNEAR.
pub async fn cancel_lazy_listing(
    contract: &Contract,
    creator: &Account,
    listing_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        creator,
        json!({
            "type": "cancel_lazy_listing",
            "listing_id": listing_id,
        }),
        deposit,
    )
    .await
}

/// Update the price of a lazy listing. Requires 1 yoctoNEAR.
pub async fn update_lazy_listing_price(
    contract: &Contract,
    creator: &Account,
    listing_id: &str,
    new_price: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        creator,
        json!({
            "type": "update_lazy_listing_price",
            "listing_id": listing_id,
            "new_price": new_price,
        }),
        deposit,
    )
    .await
}

/// Update the expiry of a lazy listing. Requires 1 yoctoNEAR.
pub async fn update_lazy_listing_expiry(
    contract: &Contract,
    creator: &Account,
    listing_id: &str,
    new_expires_at: Option<u64>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        creator,
        json!({
            "type": "update_lazy_listing_expiry",
            "listing_id": listing_id,
            "new_expires_at": new_expires_at,
        }),
        deposit,
    )
    .await
}

/// Purchase a lazy listing — mints the token to buyer. Deposit must be >= price.
pub async fn purchase_lazy_listing(
    contract: &Contract,
    buyer: &Account,
    listing_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        buyer,
        json!({
            "type": "purchase_lazy_listing",
            "listing_id": listing_id,
        }),
        deposit,
    )
    .await
}

// =============================================================================
// Auction View Helpers
// =============================================================================

/// View `get_auction` for a token.
pub async fn get_auction(
    contract: &Contract,
    token_id: &str,
) -> Result<Option<AuctionView>> {
    let result = contract
        .view("get_auction")
        .args_json(json!({ "token_id": token_id }))
        .await?;
    let auction: Option<AuctionView> = serde_json::from_slice(&result.result)?;
    Ok(auction)
}

/// View `get_auctions` — paginated list of active auctions.
pub async fn get_auctions(
    contract: &Contract,
    from_index: Option<u64>,
    limit: Option<u64>,
) -> Result<Vec<AuctionView>> {
    let mut args = json!({});
    if let Some(idx) = from_index {
        args["from_index"] = json!(idx);
    }
    if let Some(l) = limit {
        args["limit"] = json!(l);
    }
    let result = contract
        .view("get_auctions")
        .args_json(args)
        .await?;
    let auctions: Vec<AuctionView> = serde_json::from_slice(&result.result)?;
    Ok(auctions)
}

// =============================================================================
// Offer View Helpers
// =============================================================================

/// View `get_offer` for a specific token + buyer.
pub async fn get_offer(
    contract: &Contract,
    token_id: &str,
    buyer_id: &str,
) -> Result<Option<OfferView>> {
    let result = contract
        .view("get_offer")
        .args_json(json!({
            "token_id": token_id,
            "buyer_id": buyer_id,
        }))
        .await?;
    let offer: Option<OfferView> = serde_json::from_slice(&result.result)?;
    Ok(offer)
}

/// View `get_offers_for_token` — all offers on a token.
pub async fn get_offers_for_token(
    contract: &Contract,
    token_id: &str,
    from_index: Option<u64>,
    limit: Option<u64>,
) -> Result<Vec<OfferView>> {
    let mut args = json!({ "token_id": token_id });
    if let Some(idx) = from_index {
        args["from_index"] = json!(idx);
    }
    if let Some(l) = limit {
        args["limit"] = json!(l);
    }
    let result = contract
        .view("get_offers_for_token")
        .args_json(args)
        .await?;
    let offers: Vec<OfferView> = serde_json::from_slice(&result.result)?;
    Ok(offers)
}

/// View `get_collection_offer` for a specific collection + buyer.
pub async fn get_collection_offer(
    contract: &Contract,
    collection_id: &str,
    buyer_id: &str,
) -> Result<Option<CollectionOfferView>> {
    let result = contract
        .view("get_collection_offer")
        .args_json(json!({
            "collection_id": collection_id,
            "buyer_id": buyer_id,
        }))
        .await?;
    let offer: Option<CollectionOfferView> = serde_json::from_slice(&result.result)?;
    Ok(offer)
}

/// View `get_collection_offers` — all offers on a collection.
pub async fn get_collection_offers(
    contract: &Contract,
    collection_id: &str,
    from_index: Option<u64>,
    limit: Option<u64>,
) -> Result<Vec<CollectionOfferView>> {
    let mut args = json!({ "collection_id": collection_id });
    if let Some(idx) = from_index {
        args["from_index"] = json!(idx);
    }
    if let Some(l) = limit {
        args["limit"] = json!(l);
    }
    let result = contract
        .view("get_collection_offers")
        .args_json(args)
        .await?;
    let offers: Vec<CollectionOfferView> = serde_json::from_slice(&result.result)?;
    Ok(offers)
}

// =============================================================================
// Lazy Listing View Helpers
// =============================================================================

/// View `get_lazy_listing` by listing_id.
pub async fn get_lazy_listing(
    contract: &Contract,
    listing_id: &str,
) -> Result<Option<LazyListingRecord>> {
    let result = contract
        .view("get_lazy_listing")
        .args_json(json!({ "listing_id": listing_id }))
        .await?;
    let listing: Option<LazyListingRecord> = serde_json::from_slice(&result.result)?;
    Ok(listing)
}

/// View `get_lazy_listings_by_creator` — returns Vec<(listing_id, record)>.
pub async fn get_lazy_listings_by_creator(
    contract: &Contract,
    creator_id: &str,
) -> Result<Vec<(String, LazyListingRecord)>> {
    let result = contract
        .view("get_lazy_listings_by_creator")
        .args_json(json!({ "creator_id": creator_id }))
        .await?;
    let listings: Vec<(String, LazyListingRecord)> = serde_json::from_slice(&result.result)?;
    Ok(listings)
}

/// View `get_lazy_listings_count`.
pub async fn get_lazy_listings_count(contract: &Contract) -> Result<u64> {
    let result = contract.view("get_lazy_listings_count").await?;
    let count: u64 = serde_json::from_slice(&result.result)?;
    Ok(count)
}

// =============================================================================
// P4: Refund Action Helpers
// =============================================================================

/// Cancel a collection — creator deposits refund pool.
pub async fn cancel_collection(
    contract: &Contract,
    creator: &Account,
    collection_id: &str,
    refund_per_token: &str,
    refund_deadline_ns: Option<u64>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "cancel_collection",
        "collection_id": collection_id,
        "refund_per_token": refund_per_token,
    });
    if let Some(deadline) = refund_deadline_ns {
        action["refund_deadline_ns"] = json!(deadline);
    }
    execute_action(contract, creator, action, deposit).await
}

/// Claim a refund for a token from a cancelled collection.
pub async fn claim_refund(
    contract: &Contract,
    holder: &Account,
    token_id: &str,
    collection_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        holder,
        json!({
            "type": "claim_refund",
            "token_id": token_id,
            "collection_id": collection_id,
        }),
        deposit,
    )
    .await
}

/// Withdraw unclaimed refunds after deadline.
pub async fn withdraw_unclaimed_refunds(
    contract: &Contract,
    creator: &Account,
    collection_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        creator,
        json!({
            "type": "withdraw_unclaimed_refunds",
            "collection_id": collection_id,
        }),
        deposit,
    )
    .await
}

// =============================================================================
// P4: Revocation & Lifecycle Action Helpers
// =============================================================================

/// Revoke a token (invalidate or burn depending on collection mode).
pub async fn revoke_token(
    contract: &Contract,
    creator: &Account,
    token_id: &str,
    collection_id: &str,
    memo: Option<&str>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "revoke_token",
        "token_id": token_id,
        "collection_id": collection_id,
    });
    if let Some(m) = memo {
        action["memo"] = json!(m);
    }
    execute_action(contract, creator, action, deposit).await
}

/// Redeem a token (increment redeem_count).
pub async fn redeem_token(
    contract: &Contract,
    creator: &Account,
    token_id: &str,
    collection_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        creator,
        json!({
            "type": "redeem_token",
            "token_id": token_id,
            "collection_id": collection_id,
        }),
        deposit,
    )
    .await
}

/// Renew a token (extend expiry).
pub async fn renew_token(
    contract: &Contract,
    creator: &Account,
    token_id: &str,
    collection_id: &str,
    new_expires_at: u64,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        creator,
        json!({
            "type": "renew_token",
            "token_id": token_id,
            "collection_id": collection_id,
            "new_expires_at": new_expires_at,
        }),
        deposit,
    )
    .await
}

/// Burn a scarce token (standalone or collection).
pub async fn burn_scarce(
    contract: &Contract,
    owner: &Account,
    token_id: &str,
    collection_id: Option<&str>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "burn_scarce",
        "token_id": token_id,
    });
    if let Some(cid) = collection_id {
        action["collection_id"] = json!(cid);
    }
    execute_action(contract, owner, action, deposit).await
}

/// Create a collection with revocation mode and redeemable options.
pub async fn create_collection_with_options(
    contract: &Contract,
    caller: &Account,
    collection_id: &str,
    total_supply: u32,
    price_near: &str,
    metadata_template: Value,
    revocation_mode: &str,
    max_redeems: Option<u32>,
    renewable: bool,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "create_collection",
        "collection_id": collection_id,
        "total_supply": total_supply,
        "metadata_template": metadata_template.to_string(),
        "price_near": price_near,
        "transferable": true,
        "burnable": true,
        "revocation_mode": revocation_mode,
        "renewable": renewable,
    });
    if let Some(mr) = max_redeems {
        action["max_redeems"] = json!(mr);
    }
    execute_action(contract, caller, action, deposit).await
}

// =============================================================================
// P4: Revocation View Helpers
// =============================================================================

/// View `is_token_valid`.
pub async fn is_token_valid(contract: &Contract, token_id: &str) -> Result<bool> {
    let result = contract
        .view("is_token_valid")
        .args_json(json!({ "token_id": token_id }))
        .await?;
    let valid: bool = serde_json::from_slice(&result.result)?;
    Ok(valid)
}

/// View `is_token_revoked`.
pub async fn is_token_revoked(contract: &Contract, token_id: &str) -> Result<Option<bool>> {
    let result = contract
        .view("is_token_revoked")
        .args_json(json!({ "token_id": token_id }))
        .await?;
    let revoked: Option<bool> = serde_json::from_slice(&result.result)?;
    Ok(revoked)
}

/// View `is_token_redeemed` (fully redeemed).
pub async fn is_token_redeemed(contract: &Contract, token_id: &str) -> Result<Option<bool>> {
    let result = contract
        .view("is_token_redeemed")
        .args_json(json!({ "token_id": token_id }))
        .await?;
    let redeemed: Option<bool> = serde_json::from_slice(&result.result)?;
    Ok(redeemed)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemInfo {
    pub redeem_count: u32,
    pub max_redeems: Option<u32>,
}

/// View `get_redeem_info`.
pub async fn get_redeem_info(contract: &Contract, token_id: &str) -> Result<Option<RedeemInfo>> {
    let result = contract
        .view("get_redeem_info")
        .args_json(json!({ "token_id": token_id }))
        .await?;
    let info: Option<RedeemInfo> = serde_json::from_slice(&result.result)?;
    Ok(info)
}

// =============================================================================
// P4: App Pool Action Helpers
// =============================================================================

/// Register an app pool.
pub async fn register_app(
    contract: &Contract,
    caller: &Account,
    app_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "register_app",
            "app_id": app_id,
        }),
        deposit,
    )
    .await
}

/// Fund an app pool with attached NEAR.
pub async fn fund_app_pool(
    contract: &Contract,
    caller: &Account,
    app_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "fund_app_pool",
            "app_id": app_id,
        }),
        deposit,
    )
    .await
}

/// Withdraw from an app pool.
pub async fn withdraw_app_pool(
    contract: &Contract,
    owner: &Account,
    app_id: &str,
    amount: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        owner,
        json!({
            "type": "withdraw_app_pool",
            "app_id": app_id,
            "amount": amount,
        }),
        deposit,
    )
    .await
}

/// Set app config (metadata, royalty, etc.).
pub async fn set_app_config(
    contract: &Contract,
    owner: &Account,
    app_id: &str,
    params: Value,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "set_app_config",
        "app_id": app_id,
    });
    // Merge params into the action
    if let Some(obj) = params.as_object() {
        for (k, v) in obj {
            action[k] = v.clone();
        }
    }
    execute_action(contract, owner, action, deposit).await
}

/// Transfer app ownership.
pub async fn transfer_app_ownership(
    contract: &Contract,
    owner: &Account,
    app_id: &str,
    new_owner: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        owner,
        json!({
            "type": "transfer_app_ownership",
            "app_id": app_id,
            "new_owner": new_owner,
        }),
        deposit,
    )
    .await
}

// =============================================================================
// P4: App Pool View Helpers
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPool {
    pub owner_id: String,
    pub balance: String,
    #[serde(default)]
    pub used_bytes: u64,
    #[serde(default)]
    pub max_user_bytes: Option<u64>,
    #[serde(default)]
    pub default_royalty: Option<std::collections::HashMap<String, u32>>,
    #[serde(default)]
    pub primary_sale_bps: Option<u16>,
    #[serde(default)]
    pub moderators: Vec<String>,
    #[serde(default)]
    pub curated: bool,
    #[serde(default)]
    pub metadata: Option<String>,
}

/// View `get_app_pool`.
pub async fn get_app_pool(contract: &Contract, app_id: &str) -> Result<Option<AppPool>> {
    let result = contract
        .view("get_app_pool")
        .args_json(json!({ "app_id": app_id }))
        .await?;
    let pool: Option<AppPool> = serde_json::from_slice(&result.result)?;
    Ok(pool)
}

/// View `get_platform_storage_balance`.
pub async fn get_platform_storage_balance(contract: &Contract) -> Result<String> {
    let result = contract.view("get_platform_storage_balance").await?;
    let balance: String = serde_json::from_slice(&result.result)?;
    Ok(balance)
}

/// Fund platform storage pool (owner-only, payable).
pub async fn fund_platform_storage(
    contract: &Contract,
    owner: &Account,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    owner
        .call(contract.id(), "fund_platform_storage")
        .deposit(deposit)
        .transact()
        .await
        .map_err(Into::into)
}

/// Withdraw from platform storage pool (dispatched via execute).
pub async fn withdraw_platform_storage(
    contract: &Contract,
    caller: &Account,
    amount: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "withdraw_platform_storage",
            "amount": amount,
        }),
        deposit,
    )
    .await
}

// =============================================================================
// P1: NEP-171 nft_transfer_call
// =============================================================================

/// Direct NEP-171 `nft_transfer_call` (cross-contract).
pub async fn nft_transfer_call(
    contract: &Contract,
    caller: &Account,
    receiver_id: &str,
    token_id: &str,
    msg: &str,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    caller
        .call(contract.id(), "nft_transfer_call")
        .args_json(json!({
            "receiver_id": receiver_id,
            "token_id": token_id,
            "msg": msg,
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await
        .map_err(Into::into)
}

// =============================================================================
// P1: NEP-199 Payout Helpers
// =============================================================================

/// View `nft_payout` — compute royalty split without transferring.
pub async fn nft_payout(
    contract: &Contract,
    token_id: &str,
    balance: &str,
    max_len_payout: Option<u32>,
) -> Result<Payout> {
    let mut args = json!({
        "token_id": token_id,
        "balance": balance,
    });
    if let Some(max_len) = max_len_payout {
        args["max_len_payout"] = json!(max_len);
    }
    let result = contract.view("nft_payout").args_json(args).await?;
    let payout: Payout = serde_json::from_slice(&result.result)?;
    Ok(payout)
}

/// Direct NEP-199 `nft_transfer_payout` — transfer token and return payout.
pub async fn nft_transfer_payout(
    contract: &Contract,
    caller: &Account,
    receiver_id: &str,
    token_id: &str,
    balance: &str,
    max_len_payout: Option<u32>,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut args = json!({
        "receiver_id": receiver_id,
        "token_id": token_id,
        "balance": balance,
    });
    if let Some(max_len) = max_len_payout {
        args["max_len_payout"] = json!(max_len);
    }
    caller
        .call(contract.id(), "nft_transfer_payout")
        .args_json(args)
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await
        .map_err(Into::into)
}

// =============================================================================
// P2: Moderation Helpers
// =============================================================================

/// Add a moderator to an app.
pub async fn add_moderator(
    contract: &Contract,
    caller: &Account,
    app_id: &str,
    account_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "add_moderator",
            "app_id": app_id,
            "account_id": account_id,
        }),
        deposit,
    )
    .await
}

/// Remove a moderator from an app.
pub async fn remove_moderator(
    contract: &Contract,
    caller: &Account,
    app_id: &str,
    account_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "remove_moderator",
            "app_id": app_id,
            "account_id": account_id,
        }),
        deposit,
    )
    .await
}

/// Ban a collection from an app.
pub async fn ban_collection(
    contract: &Contract,
    caller: &Account,
    app_id: &str,
    collection_id: &str,
    reason: Option<&str>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "ban_collection",
        "app_id": app_id,
        "collection_id": collection_id,
    });
    if let Some(r) = reason {
        action["reason"] = json!(r);
    }
    execute_action(contract, caller, action, deposit).await
}

/// Unban a collection from an app.
pub async fn unban_collection(
    contract: &Contract,
    caller: &Account,
    app_id: &str,
    collection_id: &str,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "unban_collection",
            "app_id": app_id,
            "collection_id": collection_id,
        }),
        deposit,
    )
    .await
}

// =============================================================================
// P3: Allowlist Helpers
// =============================================================================

/// Set allowlist entries on a collection.
pub async fn set_allowlist(
    contract: &Contract,
    caller: &Account,
    collection_id: &str,
    entries: Value,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "set_allowlist",
            "collection_id": collection_id,
            "entries": entries,
        }),
        deposit,
    )
    .await
}

/// Remove accounts from a collection's allowlist.
pub async fn remove_from_allowlist(
    contract: &Contract,
    caller: &Account,
    collection_id: &str,
    accounts: Vec<&str>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        caller,
        json!({
            "type": "remove_from_allowlist",
            "collection_id": collection_id,
            "accounts": accounts,
        }),
        deposit,
    )
    .await
}

/// Update collection timing (start_time and/or end_time).
pub async fn update_collection_timing(
    contract: &Contract,
    caller: &Account,
    collection_id: &str,
    start_time: Option<u64>,
    end_time: Option<u64>,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "update_collection_timing",
        "collection_id": collection_id,
    });
    if let Some(s) = start_time {
        action["start_time"] = json!(s);
    }
    if let Some(e) = end_time {
        action["end_time"] = json!(e);
    }
    execute_action(contract, caller, action, deposit).await
}

// =============================================================================
// P4+: Collection View Helpers (untested)
// =============================================================================

/// View `get_collection_stats`.
pub async fn get_collection_stats(
    contract: &Contract,
    collection_id: &str,
) -> Result<Option<CollectionStats>> {
    let result = contract
        .view("get_collection_stats")
        .args_json(json!({ "collection_id": collection_id }))
        .await?;
    let stats: Option<CollectionStats> = serde_json::from_slice(&result.result)?;
    Ok(stats)
}

/// View `get_active_collections`.
pub async fn get_active_collections(
    contract: &Contract,
    from_index: Option<u64>,
    limit: Option<u64>,
) -> Result<Vec<LazyCollection>> {
    let result = contract
        .view("get_active_collections")
        .args_json(json!({
            "from_index": from_index,
            "limit": limit,
        }))
        .await?;
    let cols: Vec<LazyCollection> = serde_json::from_slice(&result.result)?;
    Ok(cols)
}

/// View `get_all_collections`.
pub async fn get_all_collections(
    contract: &Contract,
    from_index: Option<u64>,
    limit: Option<u64>,
) -> Result<Vec<LazyCollection>> {
    let result = contract
        .view("get_all_collections")
        .args_json(json!({
            "from_index": from_index,
            "limit": limit,
        }))
        .await?;
    let cols: Vec<LazyCollection> = serde_json::from_slice(&result.result)?;
    Ok(cols)
}

/// View `get_collections_count_by_creator`.
pub async fn get_collections_count_by_creator(
    contract: &Contract,
    creator_id: &str,
) -> Result<u64> {
    let result = contract
        .view("get_collections_count_by_creator")
        .args_json(json!({ "creator_id": creator_id }))
        .await?;
    let count: u64 = serde_json::from_slice(&result.result)?;
    Ok(count)
}

/// View `get_wallet_mint_count`.
pub async fn get_wallet_mint_count(
    contract: &Contract,
    collection_id: &str,
    account_id: &str,
) -> Result<u32> {
    let result = contract
        .view("get_wallet_mint_count")
        .args_json(json!({
            "collection_id": collection_id,
            "account_id": account_id,
        }))
        .await?;
    let count: u32 = serde_json::from_slice(&result.result)?;
    Ok(count)
}

/// View `get_wallet_mint_remaining`.
pub async fn get_wallet_mint_remaining(
    contract: &Contract,
    collection_id: &str,
    account_id: &str,
) -> Result<Option<u32>> {
    let result = contract
        .view("get_wallet_mint_remaining")
        .args_json(json!({
            "collection_id": collection_id,
            "account_id": account_id,
        }))
        .await?;
    let remaining: Option<u32> = serde_json::from_slice(&result.result)?;
    Ok(remaining)
}

/// View `is_allowlisted`.
pub async fn is_allowlisted(
    contract: &Contract,
    collection_id: &str,
    account_id: &str,
) -> Result<bool> {
    let result = contract
        .view("is_allowlisted")
        .args_json(json!({
            "collection_id": collection_id,
            "account_id": account_id,
        }))
        .await?;
    let allowed: bool = serde_json::from_slice(&result.result)?;
    Ok(allowed)
}

/// View `get_allowlist_remaining`.
pub async fn get_allowlist_remaining(
    contract: &Contract,
    collection_id: &str,
    account_id: &str,
) -> Result<u32> {
    let result = contract
        .view("get_allowlist_remaining")
        .args_json(json!({
            "collection_id": collection_id,
            "account_id": account_id,
        }))
        .await?;
    let remaining: u32 = serde_json::from_slice(&result.result)?;
    Ok(remaining)
}

/// View `get_collection_price`.
pub async fn get_collection_price(
    contract: &Contract,
    collection_id: &str,
) -> Result<String> {
    let result = contract
        .view("get_collection_price")
        .args_json(json!({ "collection_id": collection_id }))
        .await?;
    let price: String = serde_json::from_slice(&result.result)?;
    Ok(price)
}

/// View `calculate_collection_purchase_price`.
pub async fn calculate_collection_purchase_price(
    contract: &Contract,
    collection_id: &str,
    quantity: u32,
) -> Result<String> {
    let result = contract
        .view("calculate_collection_purchase_price")
        .args_json(json!({
            "collection_id": collection_id,
            "quantity": quantity,
        }))
        .await?;
    let price: String = serde_json::from_slice(&result.result)?;
    Ok(price)
}

// =============================================================================
// P5: Enumeration Helpers (untested)
// =============================================================================

/// View `nft_supply_for_collection`.
pub async fn nft_supply_for_collection(
    contract: &Contract,
    collection_id: &str,
) -> Result<String> {
    let result = contract
        .view("nft_supply_for_collection")
        .args_json(json!({ "collection_id": collection_id }))
        .await?;
    let supply: String = serde_json::from_slice(&result.result)?;
    Ok(supply)
}

/// View `nft_tokens_for_collection`.
pub async fn nft_tokens_for_collection(
    contract: &Contract,
    collection_id: &str,
    from_index: Option<&str>,
    limit: Option<u64>,
) -> Result<Vec<Token>> {
    let result = contract
        .view("nft_tokens_for_collection")
        .args_json(json!({
            "collection_id": collection_id,
            "from_index": from_index,
            "limit": limit,
        }))
        .await?;
    let tokens: Vec<Token> = serde_json::from_slice(&result.result)?;
    Ok(tokens)
}

/// View `nft_tokens` (all tokens, paginated).
pub async fn nft_tokens(
    contract: &Contract,
    from_index: Option<&str>,
    limit: Option<u64>,
) -> Result<Vec<Token>> {
    let result = contract
        .view("nft_tokens")
        .args_json(json!({
            "from_index": from_index,
            "limit": limit,
        }))
        .await?;
    let tokens: Vec<Token> = serde_json::from_slice(&result.result)?;
    Ok(tokens)
}

// =============================================================================
// Sale View Helpers (P1 coverage)
// =============================================================================

/// View `get_sales` — paginated global sales list.
pub async fn get_sales(
    contract: &Contract,
    from_index: Option<u64>,
    limit: Option<u64>,
) -> Result<Vec<Value>> {
    let result = contract
        .view("get_sales")
        .args_json(json!({ "from_index": from_index, "limit": limit }))
        .await?;
    let sales: Vec<Value> = serde_json::from_slice(&result.result)?;
    Ok(sales)
}

/// View `is_sale_expired`.
pub async fn is_sale_expired(
    contract: &Contract,
    scarce_contract_id: &str,
    token_id: &str,
) -> Result<Option<bool>> {
    let result = contract
        .view("is_sale_expired")
        .args_json(json!({
            "scarce_contract_id": scarce_contract_id,
            "token_id": token_id,
        }))
        .await?;
    let expired: Option<bool> = serde_json::from_slice(&result.result)?;
    Ok(expired)
}

/// View `get_expired_sales`.
pub async fn get_expired_sales(
    contract: &Contract,
    from_index: Option<u64>,
    limit: Option<u64>,
) -> Result<Vec<Value>> {
    let result = contract
        .view("get_expired_sales")
        .args_json(json!({ "from_index": from_index, "limit": limit }))
        .await?;
    let sales: Vec<Value> = serde_json::from_slice(&result.result)?;
    Ok(sales)
}

/// View `get_supply_by_scarce_contract_id`.
pub async fn get_supply_by_scarce_contract_id(
    contract: &Contract,
    scarce_contract_id: &str,
) -> Result<u64> {
    let result = contract
        .view("get_supply_by_scarce_contract_id")
        .args_json(json!({ "scarce_contract_id": scarce_contract_id }))
        .await?;
    let count: u64 = serde_json::from_slice(&result.result)?;
    Ok(count)
}

// =============================================================================
// App Pool View Helpers (P1 coverage)
// =============================================================================

/// View `get_app_user_usage`.
pub async fn get_app_user_usage(
    contract: &Contract,
    account_id: &str,
    app_id: &str,
) -> Result<u64> {
    let result = contract
        .view("get_app_user_usage")
        .args_json(json!({ "account_id": account_id, "app_id": app_id }))
        .await?;
    let usage: u64 = serde_json::from_slice(&result.result)?;
    Ok(usage)
}

/// View `get_app_user_remaining`.
pub async fn get_app_user_remaining(
    contract: &Contract,
    account_id: &str,
    app_id: &str,
) -> Result<u64> {
    let result = contract
        .view("get_app_user_remaining")
        .args_json(json!({ "account_id": account_id, "app_id": app_id }))
        .await?;
    let remaining: u64 = serde_json::from_slice(&result.result)?;
    Ok(remaining)
}

/// View `get_user_storage`.
pub async fn get_user_storage(contract: &Contract, account_id: &str) -> Result<Value> {
    let result = contract
        .view("get_user_storage")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    let storage: Value = serde_json::from_slice(&result.result)?;
    Ok(storage)
}

/// View `get_app_metadata`.
pub async fn get_app_metadata(contract: &Contract, app_id: &str) -> Result<Option<Value>> {
    let result = contract
        .view("get_app_metadata")
        .args_json(json!({ "app_id": app_id }))
        .await?;
    let meta: Option<Value> = serde_json::from_slice(&result.result)?;
    Ok(meta)
}

/// View `resolve_base_uri`.
pub async fn resolve_base_uri(contract: &Contract, collection_id: &str) -> Result<Option<String>> {
    let result = contract
        .view("resolve_base_uri")
        .args_json(json!({ "collection_id": collection_id }))
        .await?;
    let uri: Option<String> = serde_json::from_slice(&result.result)?;
    Ok(uri)
}

// =============================================================================
// Lazy Listing View Helpers (P1 coverage)
// =============================================================================

/// View `get_lazy_listings_by_app`.
pub async fn get_lazy_listings_by_app(
    contract: &Contract,
    app_id: &str,
    from_index: Option<u64>,
    limit: Option<u64>,
) -> Result<Vec<(String, Value)>> {
    let result = contract
        .view("get_lazy_listings_by_app")
        .args_json(json!({ "app_id": app_id, "from_index": from_index, "limit": limit }))
        .await?;
    let listings: Vec<(String, Value)> = serde_json::from_slice(&result.result)?;
    Ok(listings)
}

/// Call `cleanup_expired_lazy_listings`.
pub async fn cleanup_expired_lazy_listings(
    caller: &Account,
    contract: &Contract,
    limit: Option<u64>,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let result = caller
        .call(contract.id(), "cleanup_expired_lazy_listings")
        .args_json(json!({ "limit": limit }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    Ok(result)
}

// =============================================================================
// Collection Metadata Helpers (P1 coverage)
// =============================================================================

/// View `get_allowlist_allocation`.
pub async fn get_allowlist_allocation(
    contract: &Contract,
    collection_id: &str,
    account_id: &str,
) -> Result<u32> {
    let result = contract
        .view("get_allowlist_allocation")
        .args_json(json!({ "collection_id": collection_id, "account_id": account_id }))
        .await?;
    let allocation: u32 = serde_json::from_slice(&result.result)?;
    Ok(allocation)
}

// =============================================================================
// wNEAR / FT Receiver Helpers
// =============================================================================

/// Deploy mock-ft as a wNEAR stand-in. Mints `initial_supply` to `owner`.
pub async fn deploy_mock_wnear(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
    initial_supply: u128,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("mock-ft");
    let wasm = std::fs::read(&wasm_path)?;
    let wnear = worker.dev_deploy(&wasm).await?;

    wnear
        .call("new")
        .args_json(json!({
            "owner_id": owner.id().to_string(),
            "total_supply": initial_supply.to_string(),
            "decimals": 24
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(wnear)
}

/// Admin: configure the scarces contract to accept wNEAR from `wnear_contract`.
pub async fn set_wnear_account(
    contract: &Contract,
    owner: &Account,
    wnear_contract: &Contract,
) -> Result<()> {
    owner
        .call(contract.id(), "set_wnear_account")
        .args_json(json!({ "wnear_account_id": wnear_contract.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Mint mock wNEAR tokens to `recipient`.
pub async fn mint_wnear(
    wnear: &Contract,
    recipient: &Account,
    amount: u128,
) -> Result<()> {
    wnear
        .call("mint")
        .args_json(json!({
            "account_id": recipient.id().to_string(),
            "amount": amount.to_string()
        }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Register `account` for storage on the mock-ft contract.
pub async fn ft_storage_deposit(
    ft_contract: &Contract,
    account: &Account,
) -> Result<()> {
    account
        .call(ft_contract.id(), "storage_deposit")
        .args_json(json!({ "account_id": account.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Call `ft_transfer_call` on `wnear` as `sender`, sending `amount` to `receiver`
/// with `msg` (account_id to credit, or empty for sender).
pub async fn ft_transfer_call(
    wnear: &Contract,
    sender: &Account,
    receiver: &Contract,
    amount: u128,
    msg: &str,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let result = sender
        .call(wnear.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": receiver.id().to_string(),
            "amount": amount.to_string(),
            "msg": msg
        }))
        .deposit(ONE_YOCTO)
        .gas(near_workspaces::types::Gas::from_tgas(200))
        .transact()
        .await?;
    Ok(result)
}

/// View `ft_balance_of` on a fungible token contract.
pub async fn ft_balance_of(
    ft_contract: &Contract,
    account_id: &str,
) -> Result<u128> {
    let result = ft_contract
        .view("ft_balance_of")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    let balance: String = serde_json::from_slice(&result.result)?;
    Ok(balance.parse()?)
}
