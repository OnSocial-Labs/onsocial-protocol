import type { SeasonZeroStanding } from '@/features/season/season-zero-standing-row';
import type {
  SeasonZeroClaimRecord,
  SeasonZeroLifecyclePhase,
} from '@/features/season/season-zero-types';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';

function formatScore(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    value
  );
}

function formatPayoutAmount(yocto: string): string {
  return formatGenesisSocialBalanceDisplay(yocto);
}

function seasonCollectExplorerHref(
  txHash: string | null | undefined
): string | null {
  const hash = typeof txHash === 'string' ? txHash.trim() : '';
  return hash ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${hash}` : null;
}

function claimNextStepCopy(
  phase: Exclude<SeasonZeroLifecyclePhase, 'live' | 'upcoming'>
): string {
  switch (phase) {
    case 'finalized_pending_publish':
      return 'Collect opens after publish';
    case 'published_claim_soon':
      return 'Collect opens soon';
    case 'ended_pending_settlement':
      return 'Pending settlement';
    case 'claim_open':
      return 'Ready to collect';
  }
}

export function isPostLiveSeasonPhase(
  phase: SeasonZeroLifecyclePhase | null | undefined
): phase is Exclude<SeasonZeroLifecyclePhase, 'live' | 'upcoming'> {
  return phase != null && phase !== 'live' && phase !== 'upcoming';
}

export interface SeasonZeroClaimMetricsStatus {
  statusLabel: string;
  detailLine?: string | null;
  statusHref?: string | null;
}

export function resolveSeasonZeroClaimStatusCopy(
  phase: Exclude<SeasonZeroLifecyclePhase, 'live' | 'upcoming'>,
  myStanding: Pick<SeasonZeroStanding, 'rank' | 'score'> | null | undefined,
  options?: { omitStanding?: boolean }
): SeasonZeroClaimMetricsStatus {
  const omitStanding = options?.omitStanding ?? false;
  const rankLine = myStanding
    ? `#${myStanding.rank} · ${formatScore(myStanding.score)} pts`
    : null;

  switch (phase) {
    case 'ended_pending_settlement':
      return {
        statusLabel: 'Awaiting settlement',
        detailLine: omitStanding ? null : (rankLine ?? 'Season ended'),
      };
    case 'finalized_pending_publish':
      return {
        statusLabel: 'Awaiting publish',
        detailLine: omitStanding ? null : (rankLine ?? 'Reward list ready'),
      };
    case 'published_claim_soon':
      return {
        statusLabel: 'Collect opening soon',
        detailLine: omitStanding ? null : rankLine,
      };
    case 'claim_open':
      return {
        statusLabel: omitStanding ? 'No payout' : 'Rewards finalized',
        detailLine: omitStanding
          ? null
          : rankLine
            ? `${rankLine} · no payout for this wallet`
            : 'No payout for this wallet',
      };
  }
}

export function resolveSeasonZeroClaimMetricsStatus({
  phase,
  claim,
  accountId,
  myStanding,
  omitStanding = false,
  claimStatusReady = true,
}: {
  phase: SeasonZeroLifecyclePhase | null;
  claim: SeasonZeroClaimRecord | null;
  accountId: string | null;
  myStanding: Pick<SeasonZeroStanding, 'rank' | 'score'> | null | undefined;
  omitStanding?: boolean;
  /** When false, wallet claim state is still loading — avoid interim copy. */
  claimStatusReady?: boolean;
}): SeasonZeroClaimMetricsStatus | null {
  if (!isPostLiveSeasonPhase(phase)) return null;

  if (accountId && !claimStatusReady) {
    return null;
  }

  if (claim?.claimed) {
    const amount = formatPayoutAmount(claim.amountYocto);
    return {
      statusLabel: 'Collected',
      detailLine: `${amount} SOCIAL collected`,
      statusHref: seasonCollectExplorerHref(claim.claimedTxHash),
    };
  }

  if (claim && phase !== 'claim_open') {
    const amount = formatPayoutAmount(claim.amountYocto);
    const step = claimNextStepCopy(phase);
    return {
      statusLabel: `${amount} SOCIAL`,
      detailLine: omitStanding
        ? `Final rank #${claim.rank} · ${step}`
        : `Final rank #${claim.rank} · ${formatScore(claim.score)} pts · ${step}`,
    };
  }

  if (phase === 'claim_open' && claim && !claim.claimed) {
    return null;
  }

  if (!accountId) {
    return {
      statusLabel: 'Connect wallet',
      detailLine: 'Check payout status',
    };
  }

  if (!claim) {
    return resolveSeasonZeroClaimStatusCopy(phase, myStanding, {
      omitStanding,
    });
  }

  return null;
}
