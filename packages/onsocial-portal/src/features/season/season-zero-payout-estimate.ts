/** Keep aligned with backend `SEASON_ZERO_BASE_REBATE_BPS`. */
export const SEASON_ZERO_PAYOUT_BASE_REBATE_BPS = 5_000n;
const BASE_REBATE_BPS = SEASON_ZERO_PAYOUT_BASE_REBATE_BPS;
const BPS_DENOMINATOR = 10_000n;
const JOIN_POINTS = 1_000;

export interface SeasonZeroPayoutRoutingContext {
  joinAmountYocto: string | bigint;
  seasonPoolBps: number;
}

function parseJoinAmountYocto(raw: string | bigint | undefined): bigint | null {
  if (typeof raw === 'bigint') {
    return raw > 0n ? raw : null;
  }
  if (typeof raw === 'string' && /^\d+$/u.test(raw)) {
    try {
      const value = BigInt(raw);
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

function resolveSeasonPoolBps(seasonPoolBps: number | undefined): number | null {
  return typeof seasonPoolBps === 'number' &&
    Number.isFinite(seasonPoolBps) &&
    seasonPoolBps > 0
    ? seasonPoolBps
    : null;
}

function perJoinPoolContributionYocto(
  routing?: SeasonZeroPayoutRoutingContext
): bigint | null {
  if (!routing) {
    return null;
  }

  const joinAmountYocto = parseJoinAmountYocto(routing.joinAmountYocto);
  const seasonPoolBps = resolveSeasonPoolBps(routing.seasonPoolBps);
  if (joinAmountYocto == null || seasonPoolBps == null) {
    return null;
  }

  return (joinAmountYocto * BigInt(seasonPoolBps)) / BPS_DENOMINATOR;
}

/** Max standings rows used for live payout estimates (API cap is 100). */
export const SEASON_ZERO_PAYOUT_STANDINGS_LIMIT = 100;

export interface SeasonZeroPayoutParticipant {
  accountId: string;
  rank: number;
  score: number;
  eligible?: boolean;
}

interface RewardShare {
  accountId: string;
  rank: number;
  numerator: bigint;
}

function syntheticMeritScores(participantCount: number): number[] {
  if (participantCount <= 0) return [];
  if (participantCount === 1) return [800];
  const minMerit = 200;
  const maxMerit = 1_400;
  return Array.from({ length: participantCount }, (_, index) => {
    const ratio = index / (participantCount - 1);
    return Math.round(minMerit + (maxMerit - minMerit) * (1 - ratio));
  });
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

/** Same allocation as backend `buildSeasonZeroSettlementSnapshot`. */
export function allocateSeasonZeroClaims(
  poolYocto: bigint,
  participants: SeasonZeroPayoutParticipant[]
): Map<string, bigint> {
  if (poolYocto <= 0n || participants.length === 0) return new Map();

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

  const allocations = new Map<string, bigint>();
  for (const participant of participants) {
    allocations.set(
      participant.accountId,
      (baseAllocations.get(participant.accountId) ?? 0n) +
        (bonusAllocations.get(participant.accountId) ?? 0n)
    );
  }
  return allocations;
}

export function standingsToPayoutParticipants(
  standings: Array<{
    accountId: string;
    rank: number;
    score: number;
    eligible: boolean;
  }>
): SeasonZeroPayoutParticipant[] {
  return standings
    .filter((standing) => standing.eligible)
    .sort((a, b) => a.rank - b.rank)
    .map((standing) => ({
      accountId: standing.accountId,
      rank: standing.rank,
      score: standing.score,
      eligible: true,
    }));
}

function buildEstimateParticipants(input: {
  registeredCount: number;
  includeProspectiveJoin?: boolean;
  participants?: SeasonZeroPayoutParticipant[];
}): { participants: SeasonZeroPayoutParticipant[]; exact: boolean } {
  const registeredCount = Math.max(0, input.registeredCount);
  const known = (input.participants ?? [])
    .filter((participant) => participant.eligible !== false)
    .sort((a, b) => a.rank - b.rank);

  let exact = false;
  let participants: SeasonZeroPayoutParticipant[] = [];

  if (registeredCount > 0 && known.length >= registeredCount) {
    participants = known.slice(0, registeredCount);
    exact = true;
  } else if (registeredCount > 0 && known.length > 0) {
    participants = [...known];
    while (participants.length < registeredCount) {
      const rank = participants.length + 1;
      participants.push({
        accountId: `synthetic-tail-${rank}`,
        rank,
        score: JOIN_POINTS,
      });
    }
  } else if (registeredCount > 0) {
    participants = syntheticMeritScores(registeredCount).map(
      (merit, index) => ({
        accountId: `synthetic-${index}`,
        rank: index + 1,
        score: JOIN_POINTS + merit,
      })
    );
  }

  if (input.includeProspectiveJoin) {
    participants = [
      ...participants,
      {
        accountId: '__prospective__',
        rank: participants.length + 1,
        score: JOIN_POINTS,
      },
    ];
  }

  return { participants, exact };
}

export interface SeasonZeroPayoutEstimate {
  poolYocto: bigint;
  participantCount: number;
  minClaimYocto: bigint;
  maxClaimYocto: bigint;
  midClaimYocto: bigint;
  personalClaimYocto: bigint | null;
  /** True when every registered participant score is from live standings. */
  exact: boolean;
}

export function projectSeasonZeroPoolYocto(
  indexedPoolYocto: string | bigint,
  participantCount: number,
  options: {
    includeProspectiveJoin?: boolean;
    routing?: SeasonZeroPayoutRoutingContext;
  } = {}
): bigint {
  let pool = parsePoolYocto(indexedPoolYocto);
  if (options.includeProspectiveJoin) {
    const contribution = perJoinPoolContributionYocto(options.routing);
    if (contribution == null) {
      return pool;
    }
    pool += contribution;
  }
  if (pool <= 0n && participantCount <= 0 && options.includeProspectiveJoin) {
    const contribution = perJoinPoolContributionYocto(options.routing);
    return contribution ?? 0n;
  }
  return pool;
}

export function estimateSeasonZeroPayouts(input: {
  indexedPoolYocto: string | bigint;
  participantCount: number;
  includeProspectiveJoin?: boolean;
  participants?: SeasonZeroPayoutParticipant[];
  personalAccountId?: string | null;
  routing?: SeasonZeroPayoutRoutingContext;
  /** @deprecated Prefer `participants` + `personalAccountId`. */
  personalScore?: number | null;
  /** @deprecated Prefer `participants` + `personalAccountId`. */
  personalRank?: number | null;
}): SeasonZeroPayoutEstimate | null {
  const registeredCount = Math.max(0, input.participantCount);
  if (registeredCount <= 0 && !input.includeProspectiveJoin) return null;

  const { participants, exact } = buildEstimateParticipants({
    registeredCount,
    includeProspectiveJoin: input.includeProspectiveJoin,
    participants: input.participants,
  });
  if (participants.length === 0) return null;

  const poolYocto = projectSeasonZeroPoolYocto(
    input.indexedPoolYocto,
    registeredCount,
    {
      includeProspectiveJoin: input.includeProspectiveJoin,
      routing: input.routing,
    }
  );
  if (poolYocto <= 0n) return null;

  const allocations = allocateSeasonZeroClaims(poolYocto, participants);
  const claims = participants.map(
    (participant) => allocations.get(participant.accountId) ?? 0n
  );
  if (claims.length === 0) return null;

  const sorted = [...claims].sort((a, b) => {
    if (a === b) return 0;
    return a > b ? -1 : 1;
  });

  let personalClaimYocto: bigint | null = null;
  if (input.personalAccountId) {
    const personalAccountId = input.personalAccountId.trim();
    personalClaimYocto = allocations.get(personalAccountId) ?? null;
    if (personalClaimYocto == null) {
      const match = participants.find(
        (participant) =>
          participant.accountId.toLowerCase() ===
          personalAccountId.toLowerCase()
      );
      if (match) {
        personalClaimYocto = allocations.get(match.accountId) ?? null;
      }
    }
  } else if (
    input.personalScore != null &&
    input.personalRank != null &&
    input.personalRank >= 1 &&
    input.personalRank <= participants.length
  ) {
    personalClaimYocto = claims[input.personalRank - 1] ?? null;
  }

  const midIndex = Math.floor((sorted.length - 1) / 2);

  return {
    poolYocto,
    participantCount: participants.length,
    minClaimYocto: sorted[sorted.length - 1] ?? 0n,
    maxClaimYocto: sorted[0] ?? 0n,
    midClaimYocto: sorted[midIndex] ?? 0n,
    personalClaimYocto,
    exact,
  };
}
