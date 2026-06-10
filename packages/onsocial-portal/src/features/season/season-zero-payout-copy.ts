import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import {
  estimateSeasonZeroPayouts,
  type SeasonZeroPayoutEstimate,
} from '@/features/season/season-zero-payout-estimate';

export function formatSeasonZeroPayoutBand(
  estimate: SeasonZeroPayoutEstimate
): string {
  return `${formatGenesisSocialBalanceDisplay(estimate.minClaimYocto)}–${formatGenesisSocialBalanceDisplay(estimate.maxClaimYocto)}`;
}

export function buildSeasonZeroPayoutEstimate(input: {
  indexedPoolYocto?: string | null;
  participantCount: number;
  includeProspectiveJoin?: boolean;
  personalScore?: number | null;
  personalRank?: number | null;
}): SeasonZeroPayoutEstimate | null {
  return estimateSeasonZeroPayouts({
    indexedPoolYocto: input.indexedPoolYocto ?? '0',
    participantCount: input.participantCount,
    includeProspectiveJoin: input.includeProspectiveJoin,
    personalScore: input.personalScore,
    personalRank: input.personalRank,
  });
}

export function seasonZeroPayoutSummary(input: {
  indexedPoolYocto?: string | null;
  participantCount: number;
  includeProspectiveJoin?: boolean;
  personalScore?: number | null;
  personalRank?: number | null;
}): string | null {
  const estimate = buildSeasonZeroPayoutEstimate(input);
  if (!estimate) return null;

  if (estimate.personalClaimYocto != null) {
    return `Your est. claim ~${formatGenesisSocialBalanceDisplay(estimate.personalClaimYocto)} SOCIAL · field ~${formatSeasonZeroPayoutBand(estimate)}`;
  }

  return `Est. claim ~${formatSeasonZeroPayoutBand(estimate)} SOCIAL at ${estimate.participantCount} in`;
}
