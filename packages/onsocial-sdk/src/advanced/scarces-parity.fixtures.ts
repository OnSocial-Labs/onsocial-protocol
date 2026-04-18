// Scarces SDK ↔ contract parity fixtures — FULL coverage.
//
// Every variant of `contracts/scarces-onsocial/src/protocol/types.rs::Action`
// must appear here. Each case asserts that the JSON the SDK emits deserializes
// into a `protocol::Request` with the expected `Action` variant tag.
//
// Variants whose Rust shape uses `#[serde(flatten)]` over a sub-struct
// (CreateCollection, CreateLazyListing, ListNativeScarceAuction, RegisterApp,
// SetAppConfig) are covered with both a "minimal required-fields-only" case
// and at least one "fully populated" case to guard against silent field
// renames inside the flattened struct.

import type { Network } from '../types.js';
import type { ScarcesAction } from './actions.js';
import {
  buildScarcesCreateCollectionAction,
  buildScarcesCreateLazyListingAction,
  buildScarcesListNativeAction,
  buildScarcesMintFromCollectionAction,
  buildScarcesPurchaseNativeAction,
  buildScarcesQuickMintAction,
  buildScarcesTransferAction,
  prepareScarcesRequest,
} from './actions.js';

export interface ScarcesParityCase {
  name: string;
  action: ScarcesAction;
  expectedAction: ScarcesAction;
  targetAccount: string;
}

/**
 * Every Action variant defined in `protocol/types.rs`. Adding a new variant
 * on the contract side without adding a case here will cause the
 * `every Action variant has at least one parity case` assertion to fail.
 */
export const ALL_SCARCES_ACTION_TYPES = [
  // tokens
  'quick_mint',
  'transfer_scarce',
  'batch_transfer',
  'approve_scarce',
  'revoke_scarce',
  'revoke_all_scarce',
  'burn_scarce',
  'renew_token',
  'revoke_token',
  'redeem_token',
  'claim_refund',
  // collections
  'create_collection',
  'update_collection_price',
  'update_collection_timing',
  'mint_from_collection',
  'airdrop_from_collection',
  'delete_collection',
  'pause_collection',
  'resume_collection',
  'set_allowlist',
  'remove_from_allowlist',
  'set_collection_metadata',
  'set_collection_app_metadata',
  'withdraw_unclaimed_refunds',
  // sale / auction
  'list_native_scarce',
  'delist_native_scarce',
  'list_native_scarce_auction',
  'settle_auction',
  'cancel_auction',
  'delist_scarce',
  'update_price',
  // offers
  'accept_offer',
  'cancel_offer',
  'accept_collection_offer',
  'cancel_collection_offer',
  // lazy listings
  'create_lazy_listing',
  'cancel_lazy_listing',
  'update_lazy_listing_price',
  'update_lazy_listing_expiry',
  // purchases
  'purchase_from_collection',
  'purchase_lazy_listing',
  'purchase_native_scarce',
  'place_bid',
  'make_offer',
  'make_collection_offer',
  'cancel_collection',
  // pool / storage
  'fund_app_pool',
  'storage_deposit',
  'register_app',
  'set_spending_cap',
  'storage_withdraw',
  'withdraw_app_pool',
  'withdraw_platform_storage',
  // app admin
  'set_app_config',
  'transfer_app_ownership',
  'add_moderator',
  'remove_moderator',
  'ban_collection',
  'unban_collection',
] as const;

export function getScarcesParityCases(
  network: Network = 'testnet'
): ScarcesParityCase[] {
  const cases: Array<{
    name: string;
    action: ScarcesAction;
    expectedAction: ScarcesAction;
  }> = [
    // ── Tokens ──────────────────────────────────────────────────────────────
    {
      name: 'quick mint via builder',
      action: buildScarcesQuickMintAction({
        title: 'My Art',
        description: 'A test piece',
      }),
      expectedAction: {
        type: 'quick_mint',
        metadata: { title: 'My Art', description: 'A test piece' },
      },
    },
    {
      name: 'quick mint with all options',
      action: {
        type: 'quick_mint',
        metadata: { title: 'Limited', extra: '{"rarity":"epic"}' },
        royalty: { 'creator.near': 500 },
        app_id: 'app.near',
        transferable: false,
        burnable: false,
      },
      expectedAction: {
        type: 'quick_mint',
        metadata: { title: 'Limited', extra: '{"rarity":"epic"}' },
        royalty: { 'creator.near': 500 },
        app_id: 'app.near',
        transferable: false,
        burnable: false,
      },
    },
    {
      name: 'transfer scarce via builder',
      action: buildScarcesTransferAction('t1', 'bob.near', 'gift'),
      expectedAction: {
        type: 'transfer_scarce',
        token_id: 't1',
        receiver_id: 'bob.near',
        memo: 'gift',
      },
    },
    {
      name: 'batch transfer',
      action: {
        type: 'batch_transfer',
        transfers: [
          { receiver_id: 'a.near', token_id: 't1' },
          { receiver_id: 'b.near', token_id: 't2', memo: 'thx' },
        ],
      },
      expectedAction: {
        type: 'batch_transfer',
        transfers: [
          { receiver_id: 'a.near', token_id: 't1' },
          { receiver_id: 'b.near', token_id: 't2', memo: 'thx' },
        ],
      },
    },
    {
      name: 'approve scarce',
      action: {
        type: 'approve_scarce',
        token_id: 't1',
        account_id: 'market.near',
        msg: '{"price":"100"}',
      },
      expectedAction: {
        type: 'approve_scarce',
        token_id: 't1',
        account_id: 'market.near',
        msg: '{"price":"100"}',
      },
    },
    {
      name: 'revoke scarce approval',
      action: {
        type: 'revoke_scarce',
        token_id: 't1',
        account_id: 'market.near',
      },
      expectedAction: {
        type: 'revoke_scarce',
        token_id: 't1',
        account_id: 'market.near',
      },
    },
    {
      name: 'revoke all scarce approvals',
      action: { type: 'revoke_all_scarce', token_id: 't1' },
      expectedAction: { type: 'revoke_all_scarce', token_id: 't1' },
    },
    {
      name: 'burn scarce without collection',
      action: { type: 'burn_scarce', token_id: 't1' },
      expectedAction: { type: 'burn_scarce', token_id: 't1' },
    },
    {
      name: 'burn scarce with collection',
      action: { type: 'burn_scarce', token_id: 't1', collection_id: 'genesis' },
      expectedAction: {
        type: 'burn_scarce',
        token_id: 't1',
        collection_id: 'genesis',
      },
    },
    {
      name: 'renew token',
      action: {
        type: 'renew_token',
        token_id: 't1',
        collection_id: 'genesis',
        new_expires_at: 1_999_999_999_000_000_000,
      },
      expectedAction: {
        type: 'renew_token',
        token_id: 't1',
        collection_id: 'genesis',
        new_expires_at: 1_999_999_999_000_000_000,
      },
    },
    {
      name: 'revoke token',
      action: {
        type: 'revoke_token',
        token_id: 't1',
        collection_id: 'genesis',
        memo: 'fraud',
      },
      expectedAction: {
        type: 'revoke_token',
        token_id: 't1',
        collection_id: 'genesis',
        memo: 'fraud',
      },
    },
    {
      name: 'redeem token',
      action: {
        type: 'redeem_token',
        token_id: 't1',
        collection_id: 'genesis',
      },
      expectedAction: {
        type: 'redeem_token',
        token_id: 't1',
        collection_id: 'genesis',
      },
    },
    {
      name: 'claim refund',
      action: {
        type: 'claim_refund',
        token_id: 't1',
        collection_id: 'genesis',
      },
      expectedAction: {
        type: 'claim_refund',
        token_id: 't1',
        collection_id: 'genesis',
      },
    },

    // ── Collections ─────────────────────────────────────────────────────────
    {
      name: 'create collection minimal via builder',
      action: buildScarcesCreateCollectionAction({
        collectionId: 'genesis',
        totalSupply: 1000,
        title: 'Genesis',
        priceNear: '1',
      }),
      expectedAction: {
        type: 'create_collection',
        collection_id: 'genesis',
        total_supply: 1000,
        metadata_template: '{"title":"Genesis"}',
        price_near: '1000000000000000000000000',
      },
    },
    {
      name: 'create collection fully populated (flatten ScarceOptions + extras)',
      action: {
        type: 'create_collection',
        collection_id: 'fully',
        total_supply: 250,
        metadata_template: '{"title":"Fully"}',
        price_near: '5000000000000000000000000',
        start_time: 1_900_000_000_000_000_000,
        end_time: 1_999_000_000_000_000_000,
        royalty: { 'creator.near': 500 },
        app_id: 'app.near',
        mint_mode: 'creator_only',
        max_per_wallet: 5,
        renewable: true,
        transferable: false,
        burnable: false,
        revocation_mode: 'invalidate',
        max_redeems: 3,
        metadata: '{"banner":"ipfs://x"}',
        start_price: '10000000000000000000000000',
        allowlist_price: '500000000000000000000000',
      },
      expectedAction: {
        type: 'create_collection',
        collection_id: 'fully',
        total_supply: 250,
        metadata_template: '{"title":"Fully"}',
        price_near: '5000000000000000000000000',
        start_time: 1_900_000_000_000_000_000,
        end_time: 1_999_000_000_000_000_000,
        royalty: { 'creator.near': 500 },
        app_id: 'app.near',
        mint_mode: 'creator_only',
        max_per_wallet: 5,
        renewable: true,
        transferable: false,
        burnable: false,
        revocation_mode: 'invalidate',
        max_redeems: 3,
        metadata: '{"banner":"ipfs://x"}',
        start_price: '10000000000000000000000000',
        allowlist_price: '500000000000000000000000',
      },
    },
    {
      name: 'update collection price',
      action: {
        type: 'update_collection_price',
        collection_id: 'genesis',
        new_price_near: '2000000000000000000000000',
      },
      expectedAction: {
        type: 'update_collection_price',
        collection_id: 'genesis',
        new_price_near: '2000000000000000000000000',
      },
    },
    {
      name: 'update collection timing',
      action: {
        type: 'update_collection_timing',
        collection_id: 'genesis',
        start_time: 1_900_000_000_000_000_000,
        end_time: 1_999_000_000_000_000_000,
      },
      expectedAction: {
        type: 'update_collection_timing',
        collection_id: 'genesis',
        start_time: 1_900_000_000_000_000_000,
        end_time: 1_999_000_000_000_000_000,
      },
    },
    {
      name: 'mint from collection',
      action: buildScarcesMintFromCollectionAction('genesis', 2),
      expectedAction: {
        type: 'mint_from_collection',
        collection_id: 'genesis',
        quantity: 2,
      },
    },
    {
      name: 'mint from collection with receiver',
      action: buildScarcesMintFromCollectionAction('genesis', 1, 'bob.near'),
      expectedAction: {
        type: 'mint_from_collection',
        collection_id: 'genesis',
        quantity: 1,
        receiver_id: 'bob.near',
      },
    },
    {
      name: 'airdrop from collection',
      action: {
        type: 'airdrop_from_collection',
        collection_id: 'genesis',
        receivers: ['alice.near', 'bob.near'],
      },
      expectedAction: {
        type: 'airdrop_from_collection',
        collection_id: 'genesis',
        receivers: ['alice.near', 'bob.near'],
      },
    },
    {
      name: 'delete collection',
      action: { type: 'delete_collection', collection_id: 'genesis' },
      expectedAction: { type: 'delete_collection', collection_id: 'genesis' },
    },
    {
      name: 'pause collection',
      action: { type: 'pause_collection', collection_id: 'genesis' },
      expectedAction: { type: 'pause_collection', collection_id: 'genesis' },
    },
    {
      name: 'resume collection',
      action: { type: 'resume_collection', collection_id: 'genesis' },
      expectedAction: { type: 'resume_collection', collection_id: 'genesis' },
    },
    {
      name: 'set allowlist',
      action: {
        type: 'set_allowlist',
        collection_id: 'genesis',
        entries: [
          { account_id: 'alice.near', allocation: 2 },
          { account_id: 'bob.near', allocation: 5 },
        ],
      },
      expectedAction: {
        type: 'set_allowlist',
        collection_id: 'genesis',
        entries: [
          { account_id: 'alice.near', allocation: 2 },
          { account_id: 'bob.near', allocation: 5 },
        ],
      },
    },
    {
      name: 'remove from allowlist',
      action: {
        type: 'remove_from_allowlist',
        collection_id: 'genesis',
        accounts: ['alice.near'],
      },
      expectedAction: {
        type: 'remove_from_allowlist',
        collection_id: 'genesis',
        accounts: ['alice.near'],
      },
    },
    {
      name: 'set collection metadata',
      action: {
        type: 'set_collection_metadata',
        collection_id: 'genesis',
        metadata: '{"banner":"ipfs://abc"}',
      },
      expectedAction: {
        type: 'set_collection_metadata',
        collection_id: 'genesis',
        metadata: '{"banner":"ipfs://abc"}',
      },
    },
    {
      name: 'set collection app metadata',
      action: {
        type: 'set_collection_app_metadata',
        app_id: 'app.near',
        collection_id: 'genesis',
        metadata: '{"category":"art"}',
      },
      expectedAction: {
        type: 'set_collection_app_metadata',
        app_id: 'app.near',
        collection_id: 'genesis',
        metadata: '{"category":"art"}',
      },
    },
    {
      name: 'withdraw unclaimed refunds',
      action: {
        type: 'withdraw_unclaimed_refunds',
        collection_id: 'genesis',
      },
      expectedAction: {
        type: 'withdraw_unclaimed_refunds',
        collection_id: 'genesis',
      },
    },

    // ── Sale / auction ──────────────────────────────────────────────────────
    {
      name: 'list native scarce via builder',
      action: buildScarcesListNativeAction({
        tokenId: 't1',
        priceNear: '5',
      }),
      expectedAction: {
        type: 'list_native_scarce',
        token_id: 't1',
        price: '5000000000000000000000000',
      },
    },
    {
      name: 'list native scarce with expiry',
      action: {
        type: 'list_native_scarce',
        token_id: 't1',
        price: '5000000000000000000000000',
        expires_at: 1_999_000_000_000_000_000,
      },
      expectedAction: {
        type: 'list_native_scarce',
        token_id: 't1',
        price: '5000000000000000000000000',
        expires_at: 1_999_000_000_000_000_000,
      },
    },
    {
      name: 'delist native scarce',
      action: { type: 'delist_native_scarce', token_id: 't1' },
      expectedAction: { type: 'delist_native_scarce', token_id: 't1' },
    },
    {
      name: 'list native scarce auction minimal (flatten AuctionListing)',
      action: {
        type: 'list_native_scarce_auction',
        token_id: 't1',
        reserve_price: '1000000000000000000000000',
        min_bid_increment: '100000000000000000000000',
      },
      expectedAction: {
        type: 'list_native_scarce_auction',
        token_id: 't1',
        reserve_price: '1000000000000000000000000',
        min_bid_increment: '100000000000000000000000',
      },
    },
    {
      name: 'list native scarce auction fully populated',
      action: {
        type: 'list_native_scarce_auction',
        token_id: 't1',
        reserve_price: '1000000000000000000000000',
        min_bid_increment: '100000000000000000000000',
        expires_at: 1_999_000_000_000_000_000,
        auction_duration_ns: 86_400_000_000_000,
        anti_snipe_extension_ns: 300_000_000_000,
        buy_now_price: '5000000000000000000000000',
      },
      expectedAction: {
        type: 'list_native_scarce_auction',
        token_id: 't1',
        reserve_price: '1000000000000000000000000',
        min_bid_increment: '100000000000000000000000',
        expires_at: 1_999_000_000_000_000_000,
        auction_duration_ns: 86_400_000_000_000,
        anti_snipe_extension_ns: 300_000_000_000,
        buy_now_price: '5000000000000000000000000',
      },
    },
    {
      name: 'settle auction',
      action: { type: 'settle_auction', token_id: 't1' },
      expectedAction: { type: 'settle_auction', token_id: 't1' },
    },
    {
      name: 'cancel auction',
      action: { type: 'cancel_auction', token_id: 't1' },
      expectedAction: { type: 'cancel_auction', token_id: 't1' },
    },
    {
      name: 'delist scarce (cross-contract)',
      action: {
        type: 'delist_scarce',
        scarce_contract_id: 'other.near',
        token_id: 't1',
      },
      expectedAction: {
        type: 'delist_scarce',
        scarce_contract_id: 'other.near',
        token_id: 't1',
      },
    },
    {
      name: 'update price (cross-contract)',
      action: {
        type: 'update_price',
        scarce_contract_id: 'other.near',
        token_id: 't1',
        price: '2000000000000000000000000',
      },
      expectedAction: {
        type: 'update_price',
        scarce_contract_id: 'other.near',
        token_id: 't1',
        price: '2000000000000000000000000',
      },
    },

    // ── Offers ──────────────────────────────────────────────────────────────
    {
      name: 'accept offer',
      action: {
        type: 'accept_offer',
        token_id: 't1',
        buyer_id: 'bob.near',
      },
      expectedAction: {
        type: 'accept_offer',
        token_id: 't1',
        buyer_id: 'bob.near',
      },
    },
    {
      name: 'cancel offer',
      action: { type: 'cancel_offer', token_id: 't1' },
      expectedAction: { type: 'cancel_offer', token_id: 't1' },
    },
    {
      name: 'accept collection offer',
      action: {
        type: 'accept_collection_offer',
        collection_id: 'genesis',
        token_id: 't1',
        buyer_id: 'bob.near',
      },
      expectedAction: {
        type: 'accept_collection_offer',
        collection_id: 'genesis',
        token_id: 't1',
        buyer_id: 'bob.near',
      },
    },
    {
      name: 'cancel collection offer',
      action: { type: 'cancel_collection_offer', collection_id: 'genesis' },
      expectedAction: {
        type: 'cancel_collection_offer',
        collection_id: 'genesis',
      },
    },

    // ── Lazy listings ───────────────────────────────────────────────────────
    {
      name: 'create lazy listing via builder',
      action: buildScarcesCreateLazyListingAction({
        title: 'Limited',
        priceNear: '10',
      }),
      expectedAction: {
        type: 'create_lazy_listing',
        metadata: { title: 'Limited' },
        price: '10000000000000000000000000',
      },
    },
    {
      name: 'create lazy listing fully populated (flatten ScarceOptions + expiry)',
      action: {
        type: 'create_lazy_listing',
        metadata: { title: 'Limited', media: 'ipfs://x' },
        price: '10000000000000000000000000',
        royalty: { 'creator.near': 750 },
        app_id: 'app.near',
        transferable: false,
        burnable: false,
        expires_at: 1_999_000_000_000_000_000,
      },
      expectedAction: {
        type: 'create_lazy_listing',
        metadata: { title: 'Limited', media: 'ipfs://x' },
        price: '10000000000000000000000000',
        royalty: { 'creator.near': 750 },
        app_id: 'app.near',
        transferable: false,
        burnable: false,
        expires_at: 1_999_000_000_000_000_000,
      },
    },
    {
      name: 'cancel lazy listing',
      action: { type: 'cancel_lazy_listing', listing_id: 'l1' },
      expectedAction: { type: 'cancel_lazy_listing', listing_id: 'l1' },
    },
    {
      name: 'update lazy listing price',
      action: {
        type: 'update_lazy_listing_price',
        listing_id: 'l1',
        new_price: '20000000000000000000000000',
      },
      expectedAction: {
        type: 'update_lazy_listing_price',
        listing_id: 'l1',
        new_price: '20000000000000000000000000',
      },
    },
    {
      name: 'update lazy listing expiry',
      action: {
        type: 'update_lazy_listing_expiry',
        listing_id: 'l1',
        new_expires_at: 1_999_000_000_000_000_000,
      },
      expectedAction: {
        type: 'update_lazy_listing_expiry',
        listing_id: 'l1',
        new_expires_at: 1_999_000_000_000_000_000,
      },
    },
    {
      name: 'update lazy listing expiry to none',
      action: { type: 'update_lazy_listing_expiry', listing_id: 'l1' },
      expectedAction: {
        type: 'update_lazy_listing_expiry',
        listing_id: 'l1',
      },
    },

    // ── Purchases / bids ────────────────────────────────────────────────────
    {
      name: 'purchase from collection',
      action: {
        type: 'purchase_from_collection',
        collection_id: 'genesis',
        quantity: 3,
        max_price_per_token: '2000000000000000000000000',
      },
      expectedAction: {
        type: 'purchase_from_collection',
        collection_id: 'genesis',
        quantity: 3,
        max_price_per_token: '2000000000000000000000000',
      },
    },
    {
      name: 'purchase lazy listing',
      action: { type: 'purchase_lazy_listing', listing_id: 'l1' },
      expectedAction: { type: 'purchase_lazy_listing', listing_id: 'l1' },
    },
    {
      name: 'purchase native scarce via builder',
      action: buildScarcesPurchaseNativeAction('t1'),
      expectedAction: {
        type: 'purchase_native_scarce',
        token_id: 't1',
      },
    },
    {
      name: 'place bid',
      action: { type: 'place_bid', token_id: 't1', amount: '1000' },
      expectedAction: { type: 'place_bid', token_id: 't1', amount: '1000' },
    },
    {
      name: 'make offer',
      action: { type: 'make_offer', token_id: 't1', amount: '500' },
      expectedAction: { type: 'make_offer', token_id: 't1', amount: '500' },
    },
    {
      name: 'make offer with expiry',
      action: {
        type: 'make_offer',
        token_id: 't1',
        amount: '500',
        expires_at: 1_999_000_000_000_000_000,
      },
      expectedAction: {
        type: 'make_offer',
        token_id: 't1',
        amount: '500',
        expires_at: 1_999_000_000_000_000_000,
      },
    },
    {
      name: 'make collection offer',
      action: {
        type: 'make_collection_offer',
        collection_id: 'genesis',
        amount: '750',
      },
      expectedAction: {
        type: 'make_collection_offer',
        collection_id: 'genesis',
        amount: '750',
      },
    },
    {
      name: 'cancel collection (refund flow)',
      action: {
        type: 'cancel_collection',
        collection_id: 'genesis',
        refund_per_token: '1000000000000000000000000',
        refund_deadline_ns: 1_999_000_000_000_000_000,
      },
      expectedAction: {
        type: 'cancel_collection',
        collection_id: 'genesis',
        refund_per_token: '1000000000000000000000000',
        refund_deadline_ns: 1_999_000_000_000_000_000,
      },
    },

    // ── Pool / storage ──────────────────────────────────────────────────────
    {
      name: 'fund app pool',
      action: { type: 'fund_app_pool', app_id: 'app.near' },
      expectedAction: { type: 'fund_app_pool', app_id: 'app.near' },
    },
    {
      name: 'storage deposit (no account)',
      action: { type: 'storage_deposit' },
      expectedAction: { type: 'storage_deposit' },
    },
    {
      name: 'storage deposit (with account)',
      action: { type: 'storage_deposit', account_id: 'alice.near' },
      expectedAction: { type: 'storage_deposit', account_id: 'alice.near' },
    },
    {
      name: 'register app minimal (flatten AppConfig defaults)',
      action: { type: 'register_app', app_id: 'app.near' },
      expectedAction: { type: 'register_app', app_id: 'app.near' },
    },
    {
      name: 'register app fully populated',
      action: {
        type: 'register_app',
        app_id: 'app.near',
        max_user_bytes: 1024,
        default_royalty: { 'creator.near': 500 },
        primary_sale_bps: 250,
        curated: true,
        metadata: '{"name":"My App"}',
      },
      expectedAction: {
        type: 'register_app',
        app_id: 'app.near',
        max_user_bytes: 1024,
        default_royalty: { 'creator.near': 500 },
        primary_sale_bps: 250,
        curated: true,
        metadata: '{"name":"My App"}',
      },
    },
    {
      name: 'set spending cap to none',
      action: { type: 'set_spending_cap' },
      expectedAction: { type: 'set_spending_cap' },
    },
    {
      name: 'set spending cap to value',
      action: { type: 'set_spending_cap', cap: '5000000000000000000000000' },
      expectedAction: {
        type: 'set_spending_cap',
        cap: '5000000000000000000000000',
      },
    },
    {
      name: 'storage withdraw',
      action: { type: 'storage_withdraw' },
      expectedAction: { type: 'storage_withdraw' },
    },
    {
      name: 'withdraw app pool',
      action: {
        type: 'withdraw_app_pool',
        app_id: 'app.near',
        amount: '1000000000000000000000000',
      },
      expectedAction: {
        type: 'withdraw_app_pool',
        app_id: 'app.near',
        amount: '1000000000000000000000000',
      },
    },
    {
      name: 'withdraw platform storage',
      action: {
        type: 'withdraw_platform_storage',
        amount: '500000000000000000000000',
      },
      expectedAction: {
        type: 'withdraw_platform_storage',
        amount: '500000000000000000000000',
      },
    },

    // ── App admin ───────────────────────────────────────────────────────────
    {
      name: 'set app config minimal (flatten AppConfig defaults)',
      action: { type: 'set_app_config', app_id: 'app.near' },
      expectedAction: { type: 'set_app_config', app_id: 'app.near' },
    },
    {
      name: 'set app config fully populated',
      action: {
        type: 'set_app_config',
        app_id: 'app.near',
        max_user_bytes: 2048,
        default_royalty: { 'creator.near': 250 },
        primary_sale_bps: 500,
        curated: false,
        metadata: '{"description":"updated"}',
      },
      expectedAction: {
        type: 'set_app_config',
        app_id: 'app.near',
        max_user_bytes: 2048,
        default_royalty: { 'creator.near': 250 },
        primary_sale_bps: 500,
        curated: false,
        metadata: '{"description":"updated"}',
      },
    },
    {
      name: 'transfer app ownership',
      action: {
        type: 'transfer_app_ownership',
        app_id: 'app.near',
        new_owner: 'newowner.near',
      },
      expectedAction: {
        type: 'transfer_app_ownership',
        app_id: 'app.near',
        new_owner: 'newowner.near',
      },
    },
    {
      name: 'add moderator',
      action: {
        type: 'add_moderator',
        app_id: 'app.near',
        account_id: 'mod.near',
      },
      expectedAction: {
        type: 'add_moderator',
        app_id: 'app.near',
        account_id: 'mod.near',
      },
    },
    {
      name: 'remove moderator',
      action: {
        type: 'remove_moderator',
        app_id: 'app.near',
        account_id: 'mod.near',
      },
      expectedAction: {
        type: 'remove_moderator',
        app_id: 'app.near',
        account_id: 'mod.near',
      },
    },
    {
      name: 'ban collection',
      action: {
        type: 'ban_collection',
        app_id: 'app.near',
        collection_id: 'genesis',
        reason: 'policy violation',
      },
      expectedAction: {
        type: 'ban_collection',
        app_id: 'app.near',
        collection_id: 'genesis',
        reason: 'policy violation',
      },
    },
    {
      name: 'unban collection',
      action: {
        type: 'unban_collection',
        app_id: 'app.near',
        collection_id: 'genesis',
      },
      expectedAction: {
        type: 'unban_collection',
        app_id: 'app.near',
        collection_id: 'genesis',
      },
    },
  ];

  return cases.map(({ name, action, expectedAction }) => ({
    name,
    action,
    expectedAction,
    targetAccount: prepareScarcesRequest(action, network).targetAccount,
  }));
}
