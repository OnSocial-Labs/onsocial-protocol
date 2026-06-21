import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import {
  estimateSeasonZeroPayouts,
  type SeasonZeroPayoutEstimate,
  type SeasonZeroPayoutParticipant,
  type SeasonZeroPayoutRoutingContext,
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
  participants?: SeasonZeroPayoutParticipant[];
  personalAccountId?: string | null;
  personalScore?: number | null;
  personalRank?: number | null;
  routing?: SeasonZeroPayoutRoutingContext;
}): SeasonZeroPayoutEstimate | null {
  return estimateSeasonZeroPayouts({
    indexedPoolYocto: input.indexedPoolYocto ?? '0',
    participantCount: input.participantCount,
    includeProspectiveJoin: input.includeProspectiveJoin,
    participants: input.participants,
    personalAccountId: input.personalAccountId,
    personalScore: input.personalScore,
    personalRank: input.personalRank,
    routing: input.routing,
  });
}

function estimateQualifier(exact: boolean): string {
  return exact ? 'Est.' : 'Rough est.';
}

export function seasonZeroPayoutSummary(input: {
  indexedPoolYocto?: string | null;
  participantCount: number;
  includeProspectiveJoin?: boolean;
  participants?: SeasonZeroPayoutParticipant[];
  personalAccountId?: string | null;
  personalScore?: number | null;
  personalRank?: number | null;
  routing?: SeasonZeroPayoutRoutingContext;
}): string | null {
  const estimate = buildSeasonZeroPayoutEstimate(input);
  if (!estimate) return null;

  const qualifier = estimateQualifier(estimate.exact);

  if (estimate.personalClaimYocto != null) {
    return `Your ${qualifier} collect ~${formatGenesisSocialBalanceDisplay(estimate.personalClaimYocto)} SOCIAL · field ~${formatSeasonZeroPayoutBand(estimate)}`;
  }

  return `${qualifier} collect ~${formatSeasonZeroPayoutBand(estimate)} SOCIAL at ${estimate.participantCount} in`;
}
