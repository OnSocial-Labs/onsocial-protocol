import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

export interface TicketTokenStatus {
  tokenId: string;
  ownerId: string;
  creatorId: string;
  collectionId: string | null;
  title: string | null;
  mediaUrl: string | null;
  isValid: boolean;
  isRevoked: boolean;
  isExpired: boolean;
  isFullyRedeemed: boolean;
  redeemCount: number;
  maxRedeems: number | null;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asNonNegInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Live redeem / validity view for Show pass and Door admit. */
export async function fetchTicketTokenStatus(
  tokenId: string
): Promise<TicketTokenStatus | null> {
  const id = tokenId.trim();
  if (!id) return null;

  const status = await viewNearContract<{
    token_id?: string;
    owner_id?: string;
    creator_id?: string;
    collection_id?: string | null;
    metadata?: {
      title?: string | null;
      media?: string | null;
    } | null;
    is_valid?: boolean;
    is_revoked?: boolean;
    is_expired?: boolean;
    is_fully_redeemed?: boolean;
    redeem_count?: number;
    max_redeems?: number | null;
  } | null>(SCARCES_CONTRACT, 'get_token_status', { token_id: id });

  if (!status) return null;

  const ownerId = asOptionalString(status.owner_id);
  const creatorId = asOptionalString(status.creator_id);
  if (!ownerId || !creatorId) return null;

  const maxRedeemsRaw = status.max_redeems;
  const maxRedeems =
    maxRedeemsRaw == null || Number(maxRedeemsRaw) <= 0
      ? null
      : asNonNegInt(maxRedeemsRaw);

  return {
    tokenId: asOptionalString(status.token_id) ?? id,
    ownerId,
    creatorId,
    collectionId: asOptionalString(status.collection_id),
    title: asOptionalString(status.metadata?.title),
    mediaUrl: asOptionalString(status.metadata?.media),
    isValid: Boolean(status.is_valid),
    isRevoked: Boolean(status.is_revoked),
    isExpired: Boolean(status.is_expired),
    isFullyRedeemed: Boolean(status.is_fully_redeemed),
    redeemCount: asNonNegInt(status.redeem_count),
    maxRedeems,
  };
}
