# Skarces - Scarce by Design

# NFT Marketplace Contract (marketplace-onsocial)

A fully-featured NFT marketplace smart contract for NEAR Protocol that enables users to buy and sell Non-Fungible Tokens (NFTs) with support for royalty payments, storage management, and comprehensive enumeration.

## Features

##```rust
// Event structure (Borsh-serialized, then base64-encoded)
pub struct MarketplaceEvent {
    pub evt_standard: String,      // "onsocial" (unified across all OnSocial contracts)
    pub version: String,             // "1.0.0"
    pub evt_type: String,            // Event type (e.g., "nft_list", "nft_purchase")
    pub evt_id: String,              // Unique event identifier
    pub log_index: u32,              // Log index within transaction
    pub block_height: u64,           // Block height
    pub timestamp: u64,              // Block timestamp
    pub data: MarketplaceEventData,  // Event-specific data
}
```ionality
- **List NFTs for Sale**: Put your NFTs up for sale at a fixed price
- **Purchase NFTs**: Buy listed NFTs with automatic royalty distribution
- **Update Listings**: Change the price of your listed NFTs
- **Remove Listings**: Delist your NFTs from the marketplace
- **Auto-listing**: List NFTs directly when approving the marketplace (NEP-178)

### 💰 Storage Management
- **Deposit-based Model**: Pre-deposit storage to cover listing costs (~0.01 NEAR per sale)
- **Withdraw Excess**: Reclaim unused storage deposits
- **Transparent Costs**: Query minimum balance and your current storage balance

### 🎨 NFT Standards Support
- **NEP-171**: Core NFT standard compliance
- **NEP-177**: NFT metadata queries for displaying token information
- **NEP-178**: Approval management for secure transfers
- **NEP-181**: NFT enumeration for browsing collections
- **NEP-199**: Automatic royalty distribution to creators
- **Multi-contract**: Support NFTs from any compatible contract

### 🔍 Comprehensive Queries
- Get sales by owner, NFT contract, or specific token
- Query NFT metadata and contract information
- Browse NFT collections with pagination
- Paginated results for efficient data fetching
- Supply statistics and analytics
- Standardized events for indexers and explorers

## Architecture

```
marketplace-onsocial/
├── src/
│   ├── lib.rs           # Contract state, data structures, initialization
│   ├── storage.rs       # Storage deposit/withdrawal management
│   ├── sale.rs          # Listing, purchasing, price updates
│   ├── sale_views.rs    # Marketplace view/enumeration methods
│   ├── nft_callbacks.rs # NEP-178 approval callbacks
│   ├── nft_views.rs     # NEP-177/181 NFT metadata & enumeration
│   ├── events.rs        # Borsh-encoded event emission (onsocial standard)
│   ├── internal.rs      # Internal helper functions
│   └── external.rs      # External contract interfaces
└── Cargo.toml
```

## Usage

### Initialize the Contract

```bash
near call marketplace.near new '{"owner_id": "owner.near"}' --accountId owner.near
```

### Storage Management

Before listing NFTs, deposit storage:

```bash
# Deposit storage for 1 listing (0.01 NEAR)
near call marketplace.near storage_deposit '' \
  --accountId seller.near \
  --deposit 0.01

# Deposit storage for 10 listings
near call marketplace.near storage_deposit '' \
  --accountId seller.near \
  --deposit 0.1

# Check your storage balance
near view marketplace.near storage_balance_of '{"account_id": "seller.near"}'

# Withdraw excess storage
near call marketplace.near storage_withdraw '' \
  --accountId seller.near
```

### List an NFT

**Method 1: Two-step process (Approve + List)**

```bash
# Step 1: Approve the marketplace on the NFT contract
near call nft.near nft_approve '{
  "token_id": "token-1",
  "account_id": "marketplace.near"
}' --accountId seller.near --deposit 0.01

# Step 2: List on the marketplace
near call marketplace.near list_nft_for_sale '{
  "nft_contract_id": "nft.near",
  "token_id": "token-1",
  "approval_id": 0,
  "sale_conditions": "1000000000000000000000000"
}' --accountId seller.near --depositYocto 1
```

**Method 2: Auto-list via approval message**

```bash
# Approve and list in one call
near call nft.near nft_approve '{
  "token_id": "token-1",
  "account_id": "marketplace.near",
  "msg": "{\"sale_conditions\": \"1000000000000000000000000\"}"
}' --accountId seller.near --deposit 0.01
```

### Purchase an NFT

```bash
# Buy an NFT (attach the sale price)
near call marketplace.near offer '{
  "nft_contract_id": "nft.near",
  "token_id": "token-1"
}' --accountId buyer.near --deposit 1
```

The marketplace will:
1. Transfer the NFT to the buyer
2. Distribute royalties to creators
3. Pay the seller
4. Refund any excess deposit

### Update Listing Price

```bash
near call marketplace.near update_price '{
  "nft_contract_id": "nft.near",
  "token_id": "token-1",
  "price": "2000000000000000000000000"
}' --accountId seller.near --depositYocto 1
```

### Remove a Listing

```bash
near call marketplace.near remove_sale '{
  "nft_contract_id": "nft.near",
  "token_id": "token-1"
}' --accountId seller.near --depositYocto 1
```

### Query Sales

```bash
# Get a specific sale
near view marketplace.near get_sale '{
  "nft_contract_id": "nft.near",
  "token_id": "token-1"
}'

# Get all sales (paginated)
near view marketplace.near get_sales '{
  "from_index": 0,
  "limit": 10
}'

# Get sales by owner
near view marketplace.near get_sales_by_owner_id '{
  "account_id": "seller.near",
  "from_index": 0,
  "limit": 10
}'

# Get sales by NFT contract
near view marketplace.near get_sales_by_nft_contract_id '{
  "nft_contract_id": "nft.near",
  "from_index": 0,
  "limit": 10
}'

# Get supply statistics
near view marketplace.near get_supply_sales '{}'
near view marketplace.near get_supply_by_owner_id '{"account_id": "seller.near"}'
near view marketplace.near get_supply_by_nft_contract_id '{"nft_contract_id": "nft.near"}'
```

### Query NFT Metadata (NEP-177)

```bash
# Get NFT token with metadata
near view marketplace.near get_nft_token '{
  "nft_contract_id": "nft.near",
  "token_id": "token-1"
}'

# Get NFT contract metadata
near view marketplace.near get_nft_contract_metadata '{
  "nft_contract_id": "nft.near"
}'

# Get sale with NFT metadata combined
near view marketplace.near get_sale_with_nft_metadata '{
  "nft_contract_id": "nft.near",
  "token_id": "token-1"
}'
```

### Browse NFT Collections (NEP-181)

```bash
# Get all NFTs from a collection
near view marketplace.near get_nft_tokens '{
  "nft_contract_id": "nft.near",
  "from_index": "0",
  "limit": 10
}'

# Get NFTs owned by an account
near view marketplace.near get_nft_tokens_for_owner '{
  "nft_contract_id": "nft.near",
  "account_id": "seller.near",
  "from_index": "0",
  "limit": 10
}'

# Get total supply of NFTs
near view marketplace.near get_nft_total_supply '{
  "nft_contract_id": "nft.near"
}'

# Get supply for an owner
near view marketplace.near get_nft_supply_for_owner '{
  "nft_contract_id": "nft.near",
  "account_id": "seller.near"
}'
```

## Data Structures

### Sale Object

```rust
pub struct Sale {
    pub owner_id: AccountId,        // Who listed the NFT
    pub approval_id: u64,            // Approval ID from NFT contract
    pub nft_contract_id: AccountId,  // Which NFT contract
    pub token_id: String,            // Specific token ID
    pub sale_conditions: U128,       // Price in yoctoNEAR
}
```

### Payout Object (from NFT contract)

```rust
pub struct Payout {
    pub payout: HashMap<AccountId, U128>, // Beneficiary -> Amount
}
```

### Token Metadata (NEP-177)

```rust
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
```

## Events (Substreams-Optimized)

The marketplace emits Borsh-encoded events optimized for Substreams indexing. Events are serialized using Borsh and base64-encoded with the prefix `EVENT:`.

### Event Format

```rust
// Event structure (Borsh-serialized, then base64-encoded)
pub struct MarketplaceEvent {
    pub evt_standard: String,      // "onsocial" (unified across all OnSocial contracts)
    pub version: String,             // "1.0.0"
    pub evt_type: String,            // Event type (e.g., "nft_list", "nft_purchase")
    pub evt_id: String,              // Unique event ID
    pub tx_hash: String,             // Transaction hash
    pub log_index: u32,              // Log index within transaction
    pub block_height: u64,           // Block height
    pub timestamp: u64,              // Block timestamp
    pub data: MarketplaceEventData,  // Event-specific data
}
```

### Event Types

**nft_list** - Emitted when NFTs are listed for sale
```
Log format: EVENT:{base64_encoded_borsh_data}

```
Decoded structure:
{
  evt_standard: "onsocial",
  version: "1.0.0",
  evt_type: "nft_list",
  evt_id: "nft_list-seller.near-12345678-1234567890000-0",
  log_index: 0,
  block_height: 12345678,
  timestamp: 1234567890000,
  data: NftList {
    owner_id: "seller.near",
    nft_contract_id: "nft.near",
    token_ids: ["token-1", "token-2"],
    prices: ["1000000000000000000000000", "2000000000000000000000000"]
  }
}
```

**nft_purchase** - Emitted when an NFT is successfully purchased
```
Decoded structure:
{
  evt_standard: "onsocial",
  version: "1.0.0",
  evt_type: "nft_purchase",
  evt_id: "nft_purchase-buyer.near-12345678-1234567890000-0",
  tx_hash: "tx:aGFzaAo=",
  log_index: 0,
  block_height: 12345678,
  timestamp: 1234567890000,
  data: NftPurchase {
    buyer_id: "buyer.near",
    seller_id: "seller.near",
    nft_contract_id: "nft.near",
    token_id: "token-1",
    price: "1000000000000000000000000"
  }
}
```
```

**Other Event Types:**
- `nft_delist` - When NFT is removed from sale
- `nft_update_price` - When listing price is changed
- `nft_purchase_failed` - When purchase attempt fails
- `storage_deposit` - When storage is deposited
- `storage_withdraw` - When storage is withdrawn

### Why Borsh Encoding?

**Borsh binary encoding provides optimal Substreams performance:**

- **Gas efficient**: ~1,900 gas per event emission
- **Fast parsing**: Rust Substreams modules parse Borsh directly (zero-copy deserialization)
- **Compact logs**: Binary format is 40-60% smaller than JSON
- **Type-safe**: Compile-time schema validation
- **Consistent**: Matches core-onsocial contract architecture

### Event Fields

All events include these Substreams-compatible fields:

- **`evt_id`**: Unique event identifier: `{event_type}-{account}-{block_height}-{timestamp}-{log_index}`
- **`log_index`**: Sequential index of the event within the transaction
- **`block_height`**: Block number when event was emitted
- **`timestamp`**: Block timestamp in nanoseconds

**Note:** Transaction hash is available in the blockchain receipt data when indexing with Substreams.

### Unified Event Standard

All OnSocial Protocol contracts use `evt_standard: "onsocial"` for consistency:
- **Social contract**: Events like `set`, `delete`, `follow`
- **Marketplace contract**: Events like `nft_list`, `nft_purchase`
- **Future contracts**: Tokens, DAO, etc. will use the same standard

This unified approach simplifies Substreams filtering and indexing across the entire protocol.

### Substreams Integration

```rust
// Example Substreams Rust module for parsing ALL OnSocial events
use substreams_near::pb::near::Block;
use borsh::BorshDeserialize;

#[substreams::handlers::map]
pub fn map_onsocial_events(block: Block) -> Result<Events, Error> {
    let mut marketplace_events = vec![];
    let mut social_events = vec![];
    
    for chunk in block.shards {
        for receipt in chunk.receipt_execution_outcomes {
            for log in receipt.execution_outcome.logs {
                if log.starts_with("EVENT:") {
                    let bytes = base64::decode(&log[6..])?;
                    
                    // Try to parse as marketplace event
                    if let Ok(event) = MarketplaceEvent::try_from_slice(&bytes) {
                        if event.evt_standard == "onsocial" {
                            marketplace_events.push(event);
                        }
                        continue;
                    }
                    
                    // Try to parse as social event
                    if let Ok(event) = SocialEvent::try_from_slice(&bytes) {
                        if event.evt_standard == "onsocial" {
                            social_events.push(event);
                        }
                    }
                }
            }
        }
    }
    
    Ok(Events { marketplace_events, social_events })
}
```

### Hash Function

The contract uses **xxhash (fast_hash)** for generating event identifiers:
- **Gas efficient**: Optimized for on-chain use
- **Consistent**: Matches core-onsocial contract architecture
- **Non-cryptographic**: Appropriate for event IDs (not security-critical)
- **Deterministic**: Same inputs always produce same outputs

## Security Features

✅ **Approval Verification**: Validates marketplace approval before listing  
✅ **Owner Verification**: Ensures only token owner can list/remove/update  
✅ **One yoctoNEAR**: Required for state-changing operations (prevents unauthorized calls)  
✅ **Payout Validation**: Checks royalty payouts don't exceed sale price  
✅ **Storage Checks**: Ensures sufficient storage before listing  
✅ **Promise Validation**: Verifies cross-contract call results  

## Storage Costs

- **Per Sale**: ~0.01 NEAR (10^22 yoctoNEAR)
- **Minimum Deposit**: 0.01 NEAR for 1 listing
- **Recommended**: Deposit more to avoid frequent deposits

## Gas Costs

- **List NFT**: ~35 TGas (with cross-contract calls)
- **Purchase NFT**: ~70 TGas (transfer + royalty distribution)
- **Update/Remove**: ~5 TGas
- **View Methods**: <1 TGas
- **Event Emission**: ~2 TGas per event

## Building

```bash
cd contracts/marketplace-onsocial
cargo near build
```

## Testing

```bash
cargo test
```

## Deployment

```bash
# Deploy to testnet
near deploy marketplace.testnet \
  --wasmFile target/near/marketplace_onsocial.wasm \
  --initFunction new \
  --initArgs '{"owner_id": "owner.testnet"}'
```

## NEP Standards Compliance

| Standard | Description | Status |
|----------|-------------|--------|
| NEP-171 | Core NFT | ✅ Fully Supported |
| NEP-177 | NFT Metadata | ✅ Query Support |
| NEP-178 | Approval Management | ✅ Fully Implemented |
| NEP-181 | NFT Enumeration | ✅ Query Support |
| NEP-199 | Royalties & Payouts | ✅ Fully Implemented |

## Event System

The marketplace uses a custom **"onsocial" event standard** optimized for Substreams indexing:
- **Format**: Borsh-encoded binary events (not NEP-297 JSON)
- **Standard**: `evt_standard: "onsocial"` (unified across all OnSocial contracts)
- **Encoding**: Borsh serialization + base64 with `EVENT:` prefix
- **Performance**: ~1,900 gas per event, 40-60% smaller logs than JSON

## Integration with OnSocial Protocol

This marketplace is part of the OnSocial Protocol ecosystem and can be used to trade NFTs from:
- `core-onsocial` (social graph NFTs)
- `ft-wrapper-onsocial` (wrapped token NFTs)
- Any NEP-171 compatible NFT contract

## License

See [LICENSE.md](../../LICENSE.md)

## Resources

- [NEAR NFT Standards](https://nomicon.io/Standards/Tokens/NonFungibleToken)
- [NEAR Marketplace Tutorial](https://docs.near.org/tutorials/nfts/marketplace)
- [OnSocial Protocol Docs](../../README.md)



