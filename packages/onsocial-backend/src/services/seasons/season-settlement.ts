import { createHash } from 'node:crypto';

import type { SeasonZeroStanding } from './season-standings.js';

/** 50% equal base rebate · 50% merit bonus (keep portal estimator in sync). */
export const SEASON_ZERO_BASE_REBATE_BPS = 5_000n;
const BASE_REBATE_BPS = SEASON_ZERO_BASE_REBATE_BPS;
const BPS_DENOMINATOR = 10_000n;
const SEASON_LEAF_PREFIX = 'onsocial-season-v1';

export interface SeasonZeroSettlementClaim {
  accountId: string;
  rank: number;
  score: number;
  amountYocto: string;
  proof: string[];
  standing: SeasonZeroStanding;
}

export interface SeasonZeroSettlementSnapshot {
  seasonId: string;
  root: string;
  totalAmountYocto: string;
  indexedPoolAmountYocto: string;
  participantCount: number;
  rewardCount: number;
  claims: SeasonZeroSettlementClaim[];
  policy: {
    baseRebateBps: number;
    scoreBonusBps: number;
    scoreWeight: 'score_minus_join_points';
  };
}

interface RewardShare {
  accountId: string;
  rank: number;
  numerator: bigint;
}

function sha256(bytes: string | Buffer): Buffer {
  return createHash('sha256').update(bytes).digest();
}

function sortedPairHash(left: Buffer, right: Buffer): Buffer {
  return sha256(
    Buffer.concat(
      Buffer.compare(left, right) <= 0 ? [left, right] : [right, left]
    )
  );
}

export function seasonRewardLeafHash(
  seasonId: string,
  accountId: string,
  amountYocto: string | bigint
): Buffer {
  return sha256(
    `${SEASON_LEAF_PREFIX}:${seasonId}:${accountId}:${amountYocto.toString()}`
  );
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
      if (a.remainder !== b.remainder)
        return a.remainder > b.remainder ? -1 : 1;
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

function buildMerkleProofs(
  leaves: Array<{ accountId: string; hash: Buffer }>
): { root: string; proofs: Map<string, string[]> } {
  if (leaves.length === 0) {
    throw new Error('Cannot build a Season 0 settlement without claim leaves');
  }

  const levels: Buffer[][] = [leaves.map((leaf) => leaf.hash)];
  while (levels[levels.length - 1].length > 1) {
    const current = levels[levels.length - 1];
    const next: Buffer[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1];
      next.push(right ? sortedPairHash(left, right) : left);
    }
    levels.push(next);
  }

  const proofs = new Map<string, string[]>();
  leaves.forEach((leaf, leafIndex) => {
    const proof: string[] = [];
    let index = leafIndex;
    for (const level of levels.slice(0, -1)) {
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      const sibling = level[siblingIndex];
      if (sibling) proof.push(sibling.toString('base64'));
      index = Math.floor(index / 2);
    }
    proofs.set(leaf.accountId, proof);
  });

  return {
    root: levels[levels.length - 1][0].toString('base64'),
    proofs,
  };
}

export function buildSeasonZeroSettlementSnapshot(
  seasonId: string,
  standings: SeasonZeroStanding[],
  indexedPoolAmountYocto: string | bigint
): SeasonZeroSettlementSnapshot {
  const poolYocto =
    typeof indexedPoolAmountYocto === 'bigint'
      ? indexedPoolAmountYocto
      : BigInt(indexedPoolAmountYocto || '0');
  if (poolYocto <= 0n) {
    throw new Error(`Season ${seasonId} pool is empty; nothing can be settled`);
  }

  const participants = standings
    .filter((standing) => standing.eligible)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.accountId.localeCompare(b.accountId);
    });
  if (participants.length === 0) {
    throw new Error(
      `Season ${seasonId} has no eligible participants to settle`
    );
  }

  const basePool = (poolYocto * BASE_REBATE_BPS) / BPS_DENOMINATOR;
  const bonusPool = poolYocto - basePool;
  const equalShares = participants.map((standing) => ({
    accountId: standing.accountId,
    rank: standing.rank,
    numerator: 1n,
  }));
  const bonusShares = participants.map((standing) => ({
    accountId: standing.accountId,
    rank: standing.rank,
    numerator: BigInt(Math.max(0, standing.score - standing.breakdown.join)),
  }));

  const baseAllocations = distributePool(basePool, equalShares);
  const bonusAllocations = distributePool(bonusPool, bonusShares);
  const claimsWithoutProof = participants
    .map((standing) => {
      const amount =
        (baseAllocations.get(standing.accountId) ?? 0n) +
        (bonusAllocations.get(standing.accountId) ?? 0n);
      return { standing, amount };
    })
    .filter((claim) => claim.amount > 0n);

  const leaves = claimsWithoutProof.map((claim) => ({
    accountId: claim.standing.accountId,
    hash: seasonRewardLeafHash(
      seasonId,
      claim.standing.accountId,
      claim.amount
    ),
  }));
  const { root, proofs } = buildMerkleProofs(leaves);

  const claims = claimsWithoutProof.map(({ standing, amount }) => ({
    accountId: standing.accountId,
    rank: standing.rank,
    score: standing.score,
    amountYocto: amount.toString(),
    proof: proofs.get(standing.accountId) ?? [],
    standing,
  }));
  const totalAmountYocto = claims.reduce(
    (sum, claim) => sum + BigInt(claim.amountYocto),
    0n
  );

  return {
    seasonId,
    root,
    totalAmountYocto: totalAmountYocto.toString(),
    indexedPoolAmountYocto: poolYocto.toString(),
    participantCount: participants.length,
    rewardCount: claims.length,
    claims,
    policy: {
      baseRebateBps: Number(BASE_REBATE_BPS),
      scoreBonusBps: Number(BPS_DENOMINATOR - BASE_REBATE_BPS),
      scoreWeight: 'score_minus_join_points',
    },
  };
}
