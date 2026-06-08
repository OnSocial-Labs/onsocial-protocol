export interface SeasonZeroOnChainConfig {
  label: string;
  active: boolean;
  starts_at_ns: string;
  ends_at_ns: string;
  claim_starts_at_ns?: string | null;
  is_live: boolean;
  claim_open: boolean;
}

export interface SeasonZeroSettlementSummary {
  seasonId: string;
  status: string;
  root: string;
  totalAmountYocto: string;
  indexedPoolAmountYocto: string;
  participantCount: number;
  rewardCount: number;
  active: boolean;
  publishedTxHash: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonZeroStatusPayload {
  success?: boolean;
  seasonId?: string;
  joinMinYocto?: string;
  onChainConfig?: SeasonZeroOnChainConfig | null;
  indexedPoolYocto?: string;
  settlement?: SeasonZeroSettlementSummary | null;
  error?: string;
}

export interface SeasonZeroClaimRecord {
  seasonId: string;
  accountId: string;
  root: string;
  amountYocto: string;
  proof: string[];
  rank: number;
  score: number;
  claimed: boolean | null;
}

export interface SeasonZeroClaimPayload {
  success?: boolean;
  seasonId?: string;
  accountId?: string;
  claim?: SeasonZeroClaimRecord | null;
  error?: string;
}

export type SeasonZeroLifecyclePhase =
  | 'live'
  | 'ended_pending_settlement'
  | 'finalized_pending_publish'
  | 'published_claim_soon'
  | 'claim_open';

export function resolveSeasonZeroLifecyclePhase(
  onChain: SeasonZeroOnChainConfig | null | undefined,
  settlement: SeasonZeroSettlementSummary | null | undefined
): SeasonZeroLifecyclePhase {
  if (onChain?.is_live) return 'live';
  if (onChain?.claim_open) return 'claim_open';
  if (settlement?.publishedTxHash) return 'published_claim_soon';
  if (settlement) return 'finalized_pending_publish';
  return 'ended_pending_settlement';
}
