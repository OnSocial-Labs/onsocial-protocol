// ---------------------------------------------------------------------------
// OnSocial SDK — advanced/actions
//
// Type-safe action builders matching the Rust Action enums.
// Uses internally-tagged format: { type: "snake_case_variant", ...fields }
// Must match contract's #[serde(tag = "type", rename_all = "snake_case")].
// ---------------------------------------------------------------------------

// ── Core Actions (core-onsocial) ────────────────────────────────────────────

export type CoreAction =
  | { type: 'set'; data: Record<string, string> }
  | { type: 'create_group'; group_id: string; config: Record<string, unknown> }
  | { type: 'join_group'; group_id: string }
  | { type: 'leave_group'; group_id: string }
  | { type: 'add_group_member'; group_id: string; member_id: string }
  | { type: 'remove_group_member'; group_id: string; member_id: string }
  | { type: 'approve_join_request'; group_id: string; requester_id: string }
  | { type: 'reject_join_request'; group_id: string; requester_id: string; reason?: string }
  | { type: 'cancel_join_request'; group_id: string }
  | { type: 'blacklist_group_member'; group_id: string; member_id: string }
  | { type: 'unblacklist_group_member'; group_id: string; member_id: string }
  | { type: 'transfer_group_ownership'; group_id: string; new_owner: string; remove_old_owner?: boolean }
  | { type: 'set_group_privacy'; group_id: string; is_private: boolean }
  | { type: 'create_proposal'; group_id: string; proposal_type: string; changes: Record<string, unknown>; auto_vote?: boolean; description?: string }
  | { type: 'vote_on_proposal'; group_id: string; proposal_id: string; approve: boolean }
  | { type: 'cancel_proposal'; group_id: string; proposal_id: string }
  | { type: 'set_permission'; grantee: string; path: string; level: number; expires_at?: string }
  | { type: 'set_key_permission'; public_key: string; path: string; level: number; expires_at?: string };

// ── Scarces Actions (scarces-onsocial) ──────────────────────────────────────

export type ScarcesAction =
  // Minting
  | { type: 'quick_mint'; metadata: TokenMetadata; royalty?: Record<string, number>; app_id?: string; transferable?: boolean; burnable?: boolean }
  | { type: 'mint_from_collection'; collection_id: string; quantity: number; receiver_id?: string }
  | { type: 'airdrop_from_collection'; collection_id: string; receivers: string[] }
  // Transfers
  | { type: 'transfer_scarce'; receiver_id: string; token_id: string; memo?: string }
  | { type: 'batch_transfer'; transfers: Array<{ receiver_id: string; token_id: string; memo?: string }> }
  // Approvals
  | { type: 'approve_scarce'; token_id: string; account_id: string; msg?: string }
  | { type: 'revoke_scarce'; token_id: string; account_id: string }
  | { type: 'revoke_all_scarce'; token_id: string }
  // Lifecycle
  | { type: 'burn_scarce'; token_id: string; collection_id?: string }
  | { type: 'renew_token'; token_id: string; collection_id: string; new_expires_at: number }
  | { type: 'revoke_token'; token_id: string; collection_id: string; memo?: string }
  | { type: 'redeem_token'; token_id: string; collection_id: string }
  | { type: 'claim_refund'; token_id: string; collection_id: string }
  // Collections
  | { type: 'create_collection'; collection_id: string; total_supply: number; metadata_template: string; price_near: string; start_time?: number; end_time?: number; royalty?: Record<string, number>; app_id?: string; mint_mode?: string; max_per_wallet?: number; renewable?: boolean; transferable?: boolean; burnable?: boolean; revocation_mode?: string; max_redeems?: number; metadata?: string; start_price?: string; allowlist_price?: string }
  | { type: 'update_collection_price'; collection_id: string; new_price_near: string }
  | { type: 'update_collection_timing'; collection_id: string; start_time?: number; end_time?: number }
  | { type: 'delete_collection'; collection_id: string }
  | { type: 'pause_collection'; collection_id: string }
  | { type: 'resume_collection'; collection_id: string }
  | { type: 'set_allowlist'; collection_id: string; entries: AllowlistEntry[] }
  | { type: 'remove_from_allowlist'; collection_id: string; accounts: string[] }
  | { type: 'set_collection_metadata'; collection_id: string; metadata?: string }
  | { type: 'set_collection_app_metadata'; app_id: string; collection_id: string; metadata?: string }
  | { type: 'withdraw_unclaimed_refunds'; collection_id: string }
  | { type: 'cancel_collection'; collection_id: string; refund_per_token: string; refund_deadline_ns?: number }
  // Marketplace
  | { type: 'list_native_scarce'; token_id: string; price: string; expires_at?: number }
  | { type: 'delist_native_scarce'; token_id: string }
  | { type: 'list_native_scarce_auction'; token_id: string; reserve_price: string; min_bid_increment: string; expires_at?: number; auction_duration_ns?: number; anti_snipe_extension_ns?: number; buy_now_price?: string }
  | { type: 'settle_auction'; token_id: string }
  | { type: 'cancel_auction'; token_id: string }
  | { type: 'delist_scarce'; scarce_contract_id: string; token_id: string }
  | { type: 'update_price'; scarce_contract_id: string; token_id: string; price: string }
  | { type: 'purchase_from_collection'; collection_id: string; quantity: number; max_price_per_token: string }
  | { type: 'purchase_lazy_listing'; listing_id: string }
  | { type: 'purchase_native_scarce'; token_id: string }
  | { type: 'place_bid'; token_id: string; amount: string }
  // Offers
  | { type: 'make_offer'; token_id: string; amount: string; expires_at?: number }
  | { type: 'cancel_offer'; token_id: string }
  | { type: 'accept_offer'; token_id: string; buyer_id: string }
  | { type: 'make_collection_offer'; collection_id: string; amount: string; expires_at?: number }
  | { type: 'cancel_collection_offer'; collection_id: string }
  | { type: 'accept_collection_offer'; collection_id: string; token_id: string; buyer_id: string }
  // Lazy listings
  | { type: 'create_lazy_listing'; metadata: TokenMetadata; price: string; royalty?: Record<string, number>; app_id?: string; transferable?: boolean; burnable?: boolean; expires_at?: number }
  | { type: 'cancel_lazy_listing'; listing_id: string }
  | { type: 'update_lazy_listing_price'; listing_id: string; new_price: string }
  | { type: 'update_lazy_listing_expiry'; listing_id: string; new_expires_at?: number }
  // App/Admin
  | { type: 'fund_app_pool'; app_id: string }
  | { type: 'storage_deposit'; account_id?: string }
  | { type: 'register_app'; app_id: string; max_user_bytes?: number; default_royalty?: Record<string, number>; primary_sale_bps?: number; curated?: boolean; metadata?: string }
  | { type: 'set_spending_cap'; cap?: string }
  | { type: 'storage_withdraw' }
  | { type: 'withdraw_app_pool'; app_id: string; amount: string }
  | { type: 'withdraw_platform_storage'; amount: string }
  | { type: 'set_app_config'; app_id: string; max_user_bytes?: number; default_royalty?: Record<string, number>; primary_sale_bps?: number; curated?: boolean; metadata?: string }
  | { type: 'transfer_app_ownership'; app_id: string; new_owner: string }
  | { type: 'add_moderator'; app_id: string; account_id: string }
  | { type: 'remove_moderator'; app_id: string; account_id: string }
  | { type: 'ban_collection'; app_id: string; collection_id: string; reason?: string }
  | { type: 'unban_collection'; app_id: string; collection_id: string };

export interface TokenMetadata {
  title: string;
  description?: string;
  media?: string;
  media_hash?: string;
  copies?: number;
  extra?: string;
  reference?: string;
  reference_hash?: string;
}

export interface AllowlistEntry {
  account_id: string;
  allocation: number;
}

// ── Rewards Actions (rewards-onsocial) ──────────────────────────────────────

export type RewardsAction =
  | { type: 'credit_reward'; account_id: string; amount: string; source?: string; app_id?: string }
  | { type: 'claim' };

// ── Union of all actions ────────────────────────────────────────────────────

export type Action = CoreAction | ScarcesAction | RewardsAction;

// ── Contract IDs ────────────────────────────────────────────────────────────

export const CONTRACTS = {
  mainnet: {
    core: 'core.onsocial.near',
    scarces: 'scarces.onsocial.near',
    rewards: 'rewards.onsocial.near',
    boost: 'boost.onsocial.near',
    token: 'token.onsocial.near',
  },
  testnet: {
    core: 'core.onsocial.testnet',
    scarces: 'scarces.onsocial.testnet',
    rewards: 'rewards.onsocial.testnet',
    boost: 'boost.onsocial.testnet',
    token: 'token.onsocial.testnet',
  },
} as const;
