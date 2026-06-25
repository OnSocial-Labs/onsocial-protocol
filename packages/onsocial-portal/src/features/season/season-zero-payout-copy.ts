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

/** Rules modal — how the indexed pool is split at collect. */
export const seasonZeroPoolSplitRulesLabel =
  '50% shared among participants · 50% by your score';

export interface SeasonZeroPayoutSummaryLines {
  personal: string | null;
  field: string | null;
}

export function seasonZeroPayoutSummaryLines(input: {
  indexedPoolYocto?: string | null;
  participantCount: number;
  includeProspectiveJoin?: boolean;
  participants?: SeasonZeroPayoutParticipant[];
  personalAccountId?: string | null;
  personalScore?: number | null;
  personalRank?: number | null;
  routing?: SeasonZeroPayoutRoutingContext;
}): SeasonZeroPayoutSummaryLines | null {
  const estimate = buildSeasonZeroPayoutEstimate(input);
  if (!estimate) return null;

  const qualifier = estimateQualifier(estimate.exact);

  if (estimate.personalClaimYocto != null) {
    return {
      personal: `${qualifier} collect ~${formatGenesisSocialBalanceDisplay(estimate.personalClaimYocto)} SOCIAL`,
      field: `Field ~${formatSeasonZeroPayoutBand(estimate)}`,
    };
  }

  return {
    personal: null,
    field: `${qualifier} collect ~${formatSeasonZeroPayoutBand(estimate)} SOCIAL at ${estimate.participantCount} in`,
  };
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
  const lines = seasonZeroPayoutSummaryLines(input);
  if (!lines) return null;

  if (lines.personal && lines.field) {
    return `Your ${lines.personal} · ${lines.field}`;
  }

  return lines.field ?? lines.personal;
}
