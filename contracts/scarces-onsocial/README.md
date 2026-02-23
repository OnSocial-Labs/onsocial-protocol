# scarces-onsocial

NFT marketplace and minting contract for the OnSocial protocol. Supports standalone mints, lazy collections, fixed-price sales, auctions, offers, and gasless execution via `onsocial-auth`.

## Standards

| Standard | Version | Purpose |
|----------|---------|---------|
| NEP-171  | 1.2.0   | Non-fungible token core |
| NEP-177  | 2.0.0   | Token metadata |
| NEP-178  | 1.0.0   | Approval management |
| NEP-181  | 1.0.0   | Token enumeration |
| NEP-199  | 2.1.0   | Royalties / payouts |
| NEP-297  | 1.0.0   | Event standard |

## Features

- **Standalone minting** — `QuickMint` creates a one-off NFT with metadata and optional royalties
- **Lazy collections** — Creator defines supply, price, timing; buyers mint on purchase
- **Fixed-price sales** — List native scarces with optional expiry
- **Auctions** — Reserve price, anti-snipe extension, buy-now support
- **Offers** — Per-token and per-collection offers with expiry
- **Lazy listings** — Off-chain metadata, minted on first purchase
- **Token lifecycle** — Renewable, revocable, redeemable, burnable, refundable tokens
- **App pools** — Per-app storage sponsorship with moderators and spending caps
- **Gasless auth** — All actions routed through `execute()` with NEAR Intents support
- **Configurable fees** — Platform + app pool fee split in basis points

## Build

```bash
make build-contract-scarces-onsocial
```

## Test

```bash
# Unit tests
make test-unit-contract-scarces-onsocial

# Integration tests
make test-integration-contract-scarces-onsocial
```

## Deploy

```bash
near deploy <account> ./target/near/scarces_onsocial/scarces_onsocial.wasm
```

## Initialize

```bash
near call <contract> new '{"owner_id": "owner.near"}' \
  --accountId <deployer> --deposit 5
```

Requires 5 NEAR minimum deposit to seed the platform storage pool.

## Architecture

All state-changing operations go through a single entry point:

```
execute(Request { target_account, action, auth, options })
```

The `action` enum is dispatched internally. Auth supports direct calls, signed payloads, and NEAR Intents executors.

## API

### Entry Point

| Method | Description |
|--------|-------------|
| `execute(request)` | Single entry point for all actions (see Action table below) |

### Actions — Scarce Lifecycle

| Action | Description |
|--------|-------------|
| `QuickMint` | Mint a standalone NFT with metadata and optional royalties |
| `TransferScarce` | Transfer a token to another account |
| `BatchTransfer` | Transfer multiple tokens in one call |
| `ApproveScarce` | Approve an account for a token |
| `RevokeScarce` | Revoke approval for one account |
| `RevokeAllScarce` | Revoke all approvals on a token |
| `BurnScarce` | Permanently burn a token |
| `RenewToken` | Extend a renewable token's expiry |
| `RevokeToken` | Soft-revoke a collection token |
| `RedeemToken` | Mark a token as redeemed |
| `ClaimRefund` | Claim refund for a cancelled collection token |

### Actions — Collections

| Action | Description |
|--------|-------------|
| `CreateCollection` | Create a lazy mint collection |
| `UpdateCollectionPrice` | Update mint price |
| `UpdateCollectionTiming` | Update start/end time |
| `MintFromCollection` | Creator-mint tokens |
| `AirdropFromCollection` | Airdrop to multiple accounts |
| `DeleteCollection` | Delete an unminted collection |
| `PauseCollection` / `ResumeCollection` | Toggle minting |
| `SetAllowlist` / `RemoveFromAllowlist` | Manage allowlist |
| `SetCollectionMetadata` | Update collection metadata |
| `SetCollectionAppMetadata` | Update app-specific metadata |
| `CancelCollection` | Cancel with refund pool |
| `WithdrawUnclaimedRefunds` | Withdraw unclaimed refunds after deadline |

### Actions — Sales & Auctions

| Action | Description |
|--------|-------------|
| `ListNativeScarce` | List a token for fixed-price sale |
| `DelistNativeScarce` | Remove from sale |
| `UpdatePrice` | Update listing price |
| `PurchaseNativeScarce` | Buy a listed token |
| `ListNativeScarceAuction` | Create an auction |
| `PlaceBid` | Bid on an auction |
| `SettleAuction` | Finalize ended auction |
| `CancelAuction` | Cancel an auction |

### Actions — Offers

| Action | Description |
|--------|-------------|
| `MakeOffer` | Make an offer on a token |
| `AcceptOffer` | Accept a token offer |
| `CancelOffer` | Cancel own token offer |
| `MakeCollectionOffer` | Make an offer on a collection |
| `AcceptCollectionOffer` | Accept a collection offer |
| `CancelCollectionOffer` | Cancel own collection offer |

### Actions — Lazy Listings

| Action | Description |
|--------|-------------|
| `CreateLazyListing` | Create an off-chain metadata listing |
| `PurchaseLazyListing` | Buy and mint a lazy listing |
| `UpdateLazyListingPrice` | Update listing price |
| `UpdateLazyListingExpiry` | Update listing expiry |
| `CancelLazyListing` | Cancel a lazy listing |

### Actions — Payments & Storage

| Action | Description |
|--------|-------------|
| `PurchaseFromCollection` | Buy from a collection |
| `StorageDeposit` | Deposit storage for an account |
| `StorageWithdraw` | Withdraw excess storage |
| `SetSpendingCap` | Set prepaid balance spending cap |
| `FundAppPool` | Fund an app pool |
| `WithdrawAppPool` | Withdraw from app pool |
| `WithdrawPlatformStorage` | Owner withdraw from platform pool |
| `RegisterApp` | Register an app with config |

### Actions — Admin

| Action | Description |
|--------|-------------|
| `SetAppConfig` | Update app configuration |
| `TransferAppOwnership` | Transfer app to new owner |
| `AddModerator` / `RemoveModerator` | Manage app moderators |
| `BanCollection` / `UnbanCollection` | Moderate collections |

### View Methods — Tokens

| Method | Description |
|--------|-------------|
| `nft_token(token_id)` | Get token by ID (NEP-171) |
| `nft_total_supply()` | Total minted tokens |
| `nft_tokens(from_index, limit)` | Paginated token list |
| `nft_supply_for_owner(account_id)` | Token count for owner |
| `nft_tokens_for_owner(account_id, from_index, limit)` | Tokens owned by account |
| `nft_metadata()` | Contract-level metadata (NEP-177) |
| `nft_payout(token_id, balance, max_len_payout)` | Royalty payout (NEP-199) |
| `is_token_valid(token_id)` | Check token not revoked/expired/redeemed |
| `is_token_revoked(token_id)` | Check revocation status |
| `is_token_redeemed(token_id)` | Check redemption status |
| `get_redeem_info(token_id)` | Redeem count and max |
| `get_token_status(token_id)` | Full token lifecycle status |

### View Methods — Collections

| Method | Description |
|--------|-------------|
| `get_collection(collection_id)` | Collection details |
| `get_collection_availability(collection_id)` | Remaining supply |
| `is_collection_sold_out(collection_id)` | Sold out check |
| `is_collection_mintable(collection_id)` | Active + in window + supply remaining |
| `get_collection_progress(collection_id)` | Minted / total / remaining / percentage |
| `get_collections_by_creator(creator_id, from_index, limit)` | Creator's collections |
| `get_collections_count_by_creator(creator_id)` | Creator collection count |
| `get_active_collections(from_index, limit)` | Currently mintable collections |
| `get_total_collections()` | Total collection count |
| `get_all_collections(from_index, limit)` | Paginated all collections |

### View Methods — Sales & Auctions

| Method | Description |
|--------|-------------|
| `get_sale(scarce_contract_id, token_id)` | Sale details |
| `get_supply_sales()` | Total active sales |
| `get_supply_by_owner_id(account_id)` | Sales count by owner |
| `get_sales_by_owner_id(account_id, from_index, limit)` | Owner's sales |
| `get_sales_by_scarce_contract_id(scarce_contract_id, from_index, limit)` | Sales by contract |
| `get_sales(from_index, limit)` | Paginated all sales |
| `is_sale_expired(scarce_contract_id, token_id)` | Expiry check |
| `get_expired_sales(from_index, limit)` | Expired sales list |
| `get_auction(token_id)` | Auction details |
| `get_auctions(from_index, limit)` | Paginated auctions |

### View Methods — Fees & Platform

| Method | Description |
|--------|-------------|
| `get_fee_config()` | Current fee configuration |
| `get_fee_recipient()` | Fee recipient account |
| `get_platform_storage_balance()` | Platform storage pool balance |

### Owner Methods

| Method | Description |
|--------|-------------|
| `transfer_ownership(new_owner)` | Transfer contract ownership (1 yocto) |
| `set_fee_recipient(account_id)` | Change fee recipient (1 yocto) |
| `update_fee_config(patch)` | Update fee basis points (1 yocto) |
| `add_intents_executor(executor)` | Authorize an intents executor |
| `remove_intents_executor(executor)` | Remove an intents executor |
| `update_contract()` | Deploy new WASM (self-upgrade) |

## Fee Structure

| Parameter | Default | Range |
|-----------|---------|-------|
| Total fee | 200 bps (2%) | 100–300 bps |
| App pool fee | 50 bps | 25–100 bps |
| Platform storage fee | 50 bps | 25–100 bps |
| Max royalty | 5000 bps (50%) | — |

## Constants

| Constant | Value |
|----------|-------|
| Max collection supply | 100,000 |
| Max batch mint | 10 |
| Max airdrop recipients | 50 |
| Max batch transfer | 20 |
| Default refund deadline | 90 days |
| Min refund deadline | 7 days |
| Platform storage reserve | 5 NEAR |
| Max metadata length | 16,384 bytes |

## Events

All events follow NEP-297 with `onsocial` standard prefix:

- **Token**: `mint`, `transfer`, `burn`, `metadata_update`, `contract_metadata_update`
- **Scarce**: `list`, `delist`, `purchase`, `price_update`, `renewed`, `revoked`, `redeemed`, `burned`, `approval`, `auto_delist`
- **Auction**: `created`, `bid`, `settled`, `cancelled`
- **Collection**: `created`, `purchase`, `mint`, `airdrop`, `cancelled`, `paused`, `resumed`, `deleted`, `banned`, `metadata_update`
- **Offer**: `made`, `accepted`, `cancelled` (token + collection variants)
- **Lazy listing**: `created`, `purchased`, `cancelled`
- **Storage**: `deposit`, `withdraw`, `credit_unused`, `refund`, `prepaid_drawn`, `prepaid_restored`, `spending_cap_set`
- **App pool**: `register`, `fund`, `withdraw`, `config_update`, `owner_transferred`, `moderator_added`, `moderator_removed`
- **Contract**: `upgraded`, `owner_transferred`, `fee_recipient_changed`, `fee_config_updated`, `intents_executor_added/removed`

## License

See [LICENSE.md](../../LICENSE.md) in repository root.
