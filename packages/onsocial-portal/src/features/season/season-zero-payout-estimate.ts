import {
  GENESIS_RALLY_JOIN_YOCTO,
  GENESIS_RALLY_SEASON_POOL_BPS,
} from '@/lib/genesis-season';

/** Keep aligned with backend `SEASON_ZERO_BASE_REBATE_BPS`. */
const BASE_REBATE_BPS = 5_000n;
const BPS_DENOMINATOR = 10_000n;
const JOIN_POINTS = 1_000;

interface RewardShare {
  accountId: string;
  rank: number;
  numerator: bigint;
}

function distributePool(
  poolYocto: bigint,
  shares: RewardShare[]
): Map<string, bigint> {
  const allocations = new Map<string, bigint>();
  if (poolYocto <= 0n || shares.length === 0) return allocations;

  const effectiveShares = shares.map((share) => ({
    ...share,
    numerator: share.numerator > 0n ? share.numerator : 0n,
  }));
  const denominator = effectiveShares.reduce(
    (sum, share) => sum + share.numerator,
    0n
  );
  const normalizedShares =
    denominator > 0n
      ? effectiveShares
      : effectiveShares.map((share) => ({ ...share, numerator: 1n }));
  const normalizedDenominator =
    denominator > 0n ? denominator : BigInt(normalizedShares.length);

  let allocated = 0n;
  const remainders: Array<RewardShare & { remainder: bigint }> = [];

  for (const share of normalizedShares) {
    const weighted = poolYocto * share.numerator;
    const amount = weighted / normalizedDenominator;
    const remainder = weighted % normalizedDenominator;
    allocations.set(share.accountId, amount);
    allocated += amount;
    remainders.push({ ...share, remainder });
  }

  const leftover = Number(poolYocto - allocated);
  remainders
    .sort((a, b) => {
      if (a.remainder !== b.remainder) {
        return a.remainder > b.remainder ? -1 : 1;
      }
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.accountId.localeCompare(b.accountId);
    })
    .slice(0, leftover)
    .forEach((share) => {
      allocations.set(
        share.accountId,
        (allocations.get(share.accountId) ?? 0n) + 1n
      );
    });

  return allocations;
}

function parsePoolYocto(value: string | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (!/^\d+$/u.test(value)) return 0n;
  return BigInt(value);
}

function perJoinPoolContributionYocto(): bigint {
  return (
    (GENESIS_RALLY_JOIN_YOCTO * BigInt(GENESIS_RALLY_SEASON_POOL_BPS)) /
    BPS_DENOMINATOR
  );
}

function syntheticMeritScores(participantCount: number): number[] {
  if (participantCount <= 0) return [];
  if (participantCount === 1) return [800];
  const minMerit = 200;
  const maxMerit = 1_400;
  return Array.from({ length: participantCount }, (_, index) => {
    if (participantCount === 1) return maxMerit;
    const ratio = index / (participantCount - 1);
    return Math.round(minMerit + (maxMerit - minMerit) * (1 - ratio));
  });
}

function allocateClaims(
  poolYocto: bigint,
  participants: Array<{ accountId: string; rank: number; score: number }>
): bigint[] {
  if (poolYocto <= 0n || participants.length === 0) return [];

  const basePool = (poolYocto * BASE_REBATE_BPS) / BPS_DENOMINATOR;
  const bonusPool = poolYocto - basePool;
  const equalShares = participants.map((participant) => ({
    accountId: participant.accountId,
    rank: participant.rank,
    numerator: 1n,
  }));
  const bonusShares = participants.map((participant) => ({
    accountId: participant.accountId,
    rank: participant.rank,
    numerator: BigInt(Math.max(0, participant.score - JOIN_POINTS)),
  }));

  const baseAllocations = distributePool(basePool, equalShares);
  const bonusAllocations = distributePool(bonusPool, bonusShares);

  return participants.map((participant) => {
    return (
      (baseAllocations.get(participant.accountId) ?? 0n) +
      (bonusAllocations.get(participant.accountId) ?? 0n)
    );
  });
}

export interface SeasonZeroPayoutEstimate {
  poolYocto: bigint;
  participantCount: number;
  minClaimYocto: bigint;
  maxClaimYocto: bigint;
  midClaimYocto: bigint;
  personalClaimYocto: bigint | null;
}

export function projectSeasonZeroPoolYocto(
  indexedPoolYocto: string | bigint,
  participantCount: number,
  options: { includeProspectiveJoin?: boolean } = {}
): bigint {
  let pool = parsePoolYocto(indexedPoolYocto);
  if (options.includeProspectiveJoin) {
    pool += perJoinPoolContributionYocto();
  }
  if (pool <= 0n && participantCount <= 0 && options.includeProspectiveJoin) {
    return perJoinPoolContributionYocto();
  }
  return pool;
}

export function estimateSeasonZeroPayouts(input: {
  indexedPoolYocto: string | bigint;
  participantCount: number;
  includeProspectiveJoin?: boolean;
  personalScore?: number | null;
  personalRank?: number | null;
}): SeasonZeroPayoutEstimate | null {
  const participantCount = Math.max(
    0,
    input.participantCount + (input.includeProspectiveJoin ? 1 : 0)
  );
  if (participantCount <= 0) return null;

  const poolYocto = projectSeasonZeroPoolYocto(
    input.indexedPoolYocto,
    input.participantCount,
    { includeProspectiveJoin: input.includeProspectiveJoin }
  );
  if (poolYocto <= 0n) return null;

  const meritScores = syntheticMeritScores(participantCount);
  const participants = meritScores.map((merit, index) => ({
    accountId: `synthetic-${index}`,
    rank: index + 1,
    score: JOIN_POINTS + merit,
  }));

  const claims = allocateClaims(poolYocto, participants);
  if (claims.length === 0) return null;

  const sorted = [...claims].sort((a, b) => {
    if (a === b) return 0;
    return a > b ? -1 : 1;
  });

  let personalClaimYocto: bigint | null = null;
  if (
    input.personalScore != null &&
    input.personalRank != null &&
    input.personalRank >= 1 &&
    input.personalRank <= participantCount
  ) {
    const personalParticipants = participants.map((participant) =>
      participant.rank === input.personalRank
        ? { ...participant, score: input.personalScore ?? participant.score }
        : participant
    );
    personalClaimYocto =
      allocateClaims(poolYocto, personalParticipants)[input.personalRank - 1] ??
      null;
  }

  const midIndex = Math.floor((sorted.length - 1) / 2);

  return {
    poolYocto,
    participantCount,
    minClaimYocto: sorted[sorted.length - 1] ?? 0n,
    maxClaimYocto: sorted[0] ?? 0n,
    midClaimYocto: sorted[midIndex] ?? 0n,
    personalClaimYocto,
  };
}
