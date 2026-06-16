import { pool, query } from '../../db/index.js';
import { indexerQuery } from '../../db/indexer.js';
import { logger } from '../../logger.js';
import { viewContractAt } from '../near.js';
import { relaySocialSpendSettlement } from '../social-spend-settlement-relay.js';
import {
  SEASON_ZERO_ID,
  SEASON_ZERO_JOIN_RALLY_MIN_YOCTO,
} from './season-policy.js';
import { getSeasonStandings } from './season-standings.js';
import {
  areSeasonZeroStandingsStable,
  SEASON_ZERO_STANDINGS_STABILITY_DELAY_MS,
  sleep,
} from './season-standings-stability.js';
import {
  buildSeasonZeroSettlementSnapshot,
  type SeasonZeroSettlementSnapshot,
} from './season-settlement.js';
import { lookupSeasonClaimTxHash } from './season-claim-tx-lookup.js';
import { config } from '../../config/index.js';
import { assertSeasonId } from './season-registry.js';
import {
  getSeasonOnChainConfig,
  getSeasonZeroOnChainConfig,
  type SeasonZeroOnChainConfig,
} from './season-onchain-config.js';

export type { SeasonZeroOnChainConfig } from './season-onchain-config.js';
export { getSeasonOnChainConfig, getSeasonZeroOnChainConfig };

interface SeasonPoolRow {
  pool_yocto: string;
}

interface SeasonSettlementRow {
  season_id: string;
  status: string;
  root: string;
  total_amount: string;
  indexed_pool_amount: string;
  participant_count: number;
  reward_count: number;
  snapshot: Omit<SeasonZeroSettlementSnapshot, 'claims'>;
  active: boolean;
  published_tx_hash: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface SeasonSettlementClaimRow {
  season_id: string;
  account_id: string;
  rank: number;
  score: number;
  amount: string;
  proof: string[];
  standing: unknown;
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
  policy: SeasonZeroSettlementSnapshot['policy'];
  publishedTxHash: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonZeroClaimData {
  seasonId: string;
  accountId: string;
  root: string;
  amountYocto: string;
  proof: string[];
  rank: number;
  score: number;
  claimed: boolean | null;
  claimedTxHash?: string | null;
}

function nowNs(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

function rowToSummary(row: SeasonSettlementRow): SeasonZeroSettlementSummary {
  return {
    seasonId: row.season_id,
    status: row.status,
    root: row.root,
    totalAmountYocto: row.total_amount,
    indexedPoolAmountYocto: row.indexed_pool_amount,
    participantCount: row.participant_count,
    rewardCount: row.reward_count,
    active: row.active,
    policy: row.snapshot.policy,
    publishedTxHash: row.published_tx_hash,
    publishedAt: row.published_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface SeasonPoolBreakdownInput {
  /** Caps join_rally pool contributions (typically season ends_at_ns). */
  joinCutoffTimestampNs?: string;
  /** Caps SEASON_POOL_FUNDED events (defaults to join cutoff when set). */
  sponsorCutoffTimestampNs?: string;
}

export interface SeasonDistributablePool {
  indexedPoolYocto: string;
  onChainPoolYocto: string;
  distributablePoolYocto: string;
}

/** Use the smaller of indexer vs on-chain pool so Merkle totals never exceed contract balance. */
export function resolveSeasonDistributablePool(
  indexedPoolYocto: string,
  onChainPoolYocto: string,
  options: { requireNonEmpty?: boolean } = {}
): SeasonDistributablePool {
  const requireNonEmpty = options.requireNonEmpty ?? true;
  const indexed = BigInt(indexedPoolYocto || '0');
  const onChain = BigInt(onChainPoolYocto || '0');
  if (indexed > onChain) {
    logger.warn(
      { indexedPoolYocto, onChainPoolYocto },
      'Indexed season pool exceeds on-chain pool; clamping distributable amount'
    );
  }
  const distributable = indexed <= onChain ? indexed : onChain;
  if (requireNonEmpty && distributable <= 0n) {
    throw new Error('Season pool is empty on-chain; nothing can be settled');
  }
  return {
    indexedPoolYocto: indexed.toString(),
    onChainPoolYocto: onChain.toString(),
    distributablePoolYocto: distributable.toString(),
  };
}

export async function getSeasonOnChainPoolYocto(
  seasonId: string
): Promise<string> {
  const id = assertSeasonId(seasonId);
  const pool = await viewContractAt<string>(
    config.socialSpendContract,
    'get_season_pool',
    { season_id: id }
  );
  return pool ?? '0';
}

export async function getSeasonPoolBreakdown(
  seasonId: string,
  input: SeasonPoolBreakdownInput = {}
): Promise<{
  joinPoolYocto: string;
  sponsoredPoolYocto: string;
  indexedPoolYocto: string;
}> {
  const id = assertSeasonId(seasonId);
  const joinCutoff = input.joinCutoffTimestampNs?.trim();
  const sponsorCutoff = input.sponsorCutoffTimestampNs?.trim();
  const joinCutoffClause = joinCutoff
    ? 'AND block_timestamp <= $2::numeric'
    : '';
  const sponsorCutoffClause = sponsorCutoff
    ? 'AND block_timestamp <= $2::numeric'
    : '';
  const joinParams = joinCutoff ? [id, joinCutoff] : [id];
  const sponsorParams = sponsorCutoff ? [id, sponsorCutoff] : [id];

  const [joinResult, sponsoredResult] = await Promise.all([
    indexerQuery<SeasonPoolRow>(
      `SELECT COALESCE(SUM(COALESCE(NULLIF(season_amount, ''), '0')::numeric), 0)::text AS pool_yocto
       FROM social_spend_events
       WHERE event_type = 'SOCIAL_SPENT'
         AND success = true
         AND action = 'join_rally'
         AND season_id = $1
         ${joinCutoffClause}`,
      joinParams
    ),
    indexerQuery<SeasonPoolRow>(
      `SELECT COALESCE(SUM(COALESCE(NULLIF(amount, ''), '0')::numeric), 0)::text AS pool_yocto
       FROM social_spend_events
       WHERE event_type = 'SEASON_POOL_FUNDED'
         AND success = true
         AND season_id = $1
         ${sponsorCutoffClause}`,
      sponsorParams
    ),
  ]);

  const joinPoolYocto = joinResult.rows[0]?.pool_yocto ?? '0';
  const sponsoredPoolYocto = sponsoredResult.rows[0]?.pool_yocto ?? '0';
  const indexedPoolYocto = (
    BigInt(joinPoolYocto) + BigInt(sponsoredPoolYocto)
  ).toString();

  return { joinPoolYocto, sponsoredPoolYocto, indexedPoolYocto };
}

export async function getSeasonZeroPoolBreakdown(
  cutoffTimestampNs?: string
): Promise<{
  joinPoolYocto: string;
  sponsoredPoolYocto: string;
  indexedPoolYocto: string;
}> {
  const joinCutoff = cutoffTimestampNs?.trim();
  return getSeasonPoolBreakdown(SEASON_ZERO_ID, {
    joinCutoffTimestampNs: joinCutoff,
    sponsorCutoffTimestampNs: joinCutoff,
  });
}

export async function getSeasonIndexedPoolYocto(
  seasonId: string,
  input: SeasonPoolBreakdownInput = {}
): Promise<string> {
  const breakdown = await getSeasonPoolBreakdown(seasonId, input);
  return breakdown.indexedPoolYocto;
}

export async function getSeasonZeroIndexedPoolYocto(
  cutoffTimestampNs?: string
): Promise<string> {
  return getSeasonIndexedPoolYocto(SEASON_ZERO_ID, {
    joinCutoffTimestampNs: cutoffTimestampNs,
    sponsorCutoffTimestampNs: cutoffTimestampNs,
  });
}

export async function getSeasonSettlementSummary(
  seasonId: string
): Promise<SeasonZeroSettlementSummary | null> {
  const id = assertSeasonId(seasonId);
  const result = await query<SeasonSettlementRow>(
    `SELECT *
     FROM season_settlements
     WHERE season_id = $1`,
    [id]
  );
  const row = result.rows[0];
  return row ? rowToSummary(row) : null;
}

export async function getSeasonZeroSettlementSummary(): Promise<SeasonZeroSettlementSummary | null> {
  return getSeasonSettlementSummary(SEASON_ZERO_ID);
}

export async function getSeasonClaimData(
  seasonId: string,
  accountId: string
): Promise<SeasonZeroClaimData | null> {
  const id = assertSeasonId(seasonId);
  const result = await query<SeasonSettlementClaimRow & SeasonSettlementRow>(
    `SELECT
       c.season_id,
       c.account_id,
       c.rank,
       c.score,
       c.amount,
       c.proof,
       c.standing,
       s.root,
       s.status,
       s.total_amount,
       s.indexed_pool_amount,
       s.participant_count,
       s.reward_count,
       s.snapshot,
       s.active,
       s.published_tx_hash,
       s.published_at,
       s.created_at,
       s.updated_at
     FROM season_settlement_claims c
     JOIN season_settlements s ON s.season_id = c.season_id
     WHERE c.season_id = $1
       AND c.account_id = $2`,
    [id, accountId]
  );
  const row = result.rows[0];
  if (!row) return null;

  let claimed: boolean | null = null;
  try {
    claimed = await viewContractAt<boolean>(
      config.socialSpendContract,
      'has_claimed_season',
      { season_id: id, account_id: accountId }
    );
  } catch {
    claimed = null;
  }

  let claimedTxHash: string | null = null;
  if (claimed) {
    claimedTxHash = await lookupSeasonClaimTxHash(accountId, id);
  }

  return {
    seasonId: row.season_id,
    accountId: row.account_id,
    root: row.root,
    amountYocto: row.amount,
    proof: row.proof,
    rank: row.rank,
    score: row.score,
    claimed,
    claimedTxHash,
  };
}

export async function getSeasonZeroClaimData(
  accountId: string
): Promise<SeasonZeroClaimData | null> {
  return getSeasonClaimData(SEASON_ZERO_ID, accountId);
}

export interface SeasonPublishedRewardRow {
  accountId: string;
  rank: number;
  score: number;
  amountYocto: string;
}

export function isSeasonSettlementPublished(
  settlement: SeasonZeroSettlementSummary | null | undefined
): boolean {
  return (
    settlement?.status === 'published' || Boolean(settlement?.publishedTxHash)
  );
}

export async function getSeasonPublishedRewards(
  seasonId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<{ total: number; rewards: SeasonPublishedRewardRow[] } | null> {
  const id = assertSeasonId(seasonId);
  const settlement = await getSeasonSettlementSummary(id);
  if (!settlement || !isSeasonSettlementPublished(settlement)) {
    return null;
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);

  const [rows, countResult] = await Promise.all([
    query<
      Pick<SeasonSettlementClaimRow, 'account_id' | 'rank' | 'score' | 'amount'>
    >(
      `SELECT account_id, rank, score, amount
       FROM season_settlement_claims
       WHERE season_id = $1
         AND amount::numeric > 0
       ORDER BY rank ASC, account_id ASC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM season_settlement_claims
       WHERE season_id = $1
         AND amount::numeric > 0`,
      [id]
    ),
  ]);

  return {
    total: Number(countResult.rows[0]?.count ?? 0),
    rewards: rows.rows.map((row) => ({
      accountId: row.account_id,
      rank: row.rank,
      score: row.score,
      amountYocto: row.amount,
    })),
  };
}

export interface SeasonZeroFinalizePreviewRow {
  rank: number;
  accountId: string;
  score: number;
  eligible: boolean;
}

export interface SeasonZeroFinalizePreview {
  seasonId: string;
  cutoffTimestampNs: string;
  indexedPoolAmountYocto: string;
  onChainPoolAmountYocto: string;
  distributablePoolAmountYocto: string;
  participantCount: number;
  stable: boolean;
  stabilityDelayMs: number;
  standings: SeasonZeroFinalizePreviewRow[];
}

async function resolveSeasonCutoffTimestampNs(
  seasonId: string,
  cutoffTimestampNs?: string
): Promise<string> {
  const id = assertSeasonId(seasonId);
  const onChainConfig = await getSeasonOnChainConfig(id);
  const resolved =
    cutoffTimestampNs?.trim() || onChainConfig?.ends_at_ns?.toString();
  if (!resolved) {
    throw new Error(
      `Season ${id} on-chain config is required before finalization`
    );
  }
  if (nowNs() < BigInt(resolved)) {
    throw new Error(`Season ${id} has not ended yet`);
  }
  return resolved;
}

async function loadStableSeasonStandings(
  seasonId: string,
  cutoffTimestampNs: string
) {
  const first = await getSeasonStandings(seasonId, {
    limit: Number.MAX_SAFE_INTEGER,
    offset: 0,
    cutoffTimestampNs,
    unbounded: true,
  });
  await sleep(SEASON_ZERO_STANDINGS_STABILITY_DELAY_MS);
  const second = await getSeasonStandings(seasonId, {
    limit: Number.MAX_SAFE_INTEGER,
    offset: 0,
    cutoffTimestampNs,
    unbounded: true,
  });
  const stable = areSeasonZeroStandingsStable(
    first.standings,
    second.standings
  );
  if (!stable) {
    throw new Error(
      'Standings are still changing — wait for the indexer to settle and try again'
    );
  }
  return second;
}

function settlementPoolInput(
  cutoffTimestampNs: string
): SeasonPoolBreakdownInput {
  return {
    joinCutoffTimestampNs: cutoffTimestampNs,
    sponsorCutoffTimestampNs: cutoffTimestampNs,
  };
}

export async function previewSeasonSettlement(
  seasonId: string,
  input: {
    cutoffTimestampNs?: string;
  } = {}
): Promise<SeasonZeroFinalizePreview> {
  const id = assertSeasonId(seasonId);
  const cutoffTimestampNs = await resolveSeasonCutoffTimestampNs(
    id,
    input.cutoffTimestampNs
  );
  const first = await getSeasonStandings(id, {
    limit: Number.MAX_SAFE_INTEGER,
    offset: 0,
    cutoffTimestampNs,
    unbounded: true,
  });
  await sleep(SEASON_ZERO_STANDINGS_STABILITY_DELAY_MS);
  const second = await getSeasonStandings(id, {
    limit: Number.MAX_SAFE_INTEGER,
    offset: 0,
    cutoffTimestampNs,
    unbounded: true,
  });
  const stable = areSeasonZeroStandingsStable(
    first.standings,
    second.standings
  );
  const [indexedPoolAmountYocto, onChainPoolAmountYocto] = await Promise.all([
    getSeasonIndexedPoolYocto(id, settlementPoolInput(cutoffTimestampNs)),
    getSeasonOnChainPoolYocto(id),
  ]);
  const { distributablePoolYocto: distributablePoolAmountYocto } =
    resolveSeasonDistributablePool(
      indexedPoolAmountYocto,
      onChainPoolAmountYocto,
      { requireNonEmpty: false }
    );

  return {
    seasonId: id,
    cutoffTimestampNs,
    indexedPoolAmountYocto,
    onChainPoolAmountYocto,
    distributablePoolAmountYocto,
    participantCount: second.total,
    stable,
    stabilityDelayMs: SEASON_ZERO_STANDINGS_STABILITY_DELAY_MS,
    standings: second.standings.map((standing) => ({
      rank: standing.rank,
      accountId: standing.accountId,
      score: standing.score,
      eligible: standing.eligible,
    })),
  };
}

export async function previewSeasonZeroSettlement(
  input: {
    cutoffTimestampNs?: string;
  } = {}
): Promise<SeasonZeroFinalizePreview> {
  return previewSeasonSettlement(SEASON_ZERO_ID, input);
}

export async function finalizeSeasonSettlement(
  seasonId: string,
  input: {
    cutoffTimestampNs?: string;
  } = {}
): Promise<SeasonZeroSettlementSummary> {
  const id = assertSeasonId(seasonId);
  const existing = await getSeasonSettlementSummary(id);
  if (existing) return existing;

  const cutoffTimestampNs = await resolveSeasonCutoffTimestampNs(
    id,
    input.cutoffTimestampNs
  );

  const [standings, indexedPoolAmountYocto, onChainPoolAmountYocto] =
    await Promise.all([
      loadStableSeasonStandings(id, cutoffTimestampNs),
      getSeasonIndexedPoolYocto(id, settlementPoolInput(cutoffTimestampNs)),
      getSeasonOnChainPoolYocto(id),
    ]);
  const { distributablePoolYocto } = resolveSeasonDistributablePool(
    indexedPoolAmountYocto,
    onChainPoolAmountYocto
  );
  const snapshot = buildSeasonZeroSettlementSnapshot(
    id,
    standings.standings,
    distributablePoolYocto
  );
  const { claims, ...snapshotSummary } = {
    ...snapshot,
    indexedPoolAmountYocto,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query<SeasonSettlementRow>(
      `INSERT INTO season_settlements (
         season_id,
         status,
         root,
         total_amount,
         indexed_pool_amount,
         participant_count,
         reward_count,
         snapshot,
         active
       )
       VALUES ($1, 'finalized', $2, $3, $4, $5, $6, $7::jsonb, true)
       ON CONFLICT (season_id) DO NOTHING
       RETURNING *`,
      [
        id,
        snapshot.root,
        snapshot.totalAmountYocto,
        snapshot.indexedPoolAmountYocto,
        snapshot.participantCount,
        snapshot.rewardCount,
        JSON.stringify(snapshotSummary),
      ]
    );

    if (inserted.rows.length === 0) {
      await client.query('ROLLBACK');
      const raced = await getSeasonSettlementSummary(id);
      if (raced) return raced;
      throw new Error(
        `Season ${id} settlement already exists but could not be loaded`
      );
    }

    for (const claim of claims) {
      await client.query(
        `INSERT INTO season_settlement_claims (
           season_id,
           account_id,
           rank,
           score,
           amount,
           proof,
           standing
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [
          id,
          claim.accountId,
          claim.rank,
          claim.score,
          claim.amountYocto,
          JSON.stringify(claim.proof),
          JSON.stringify(claim.standing),
        ]
      );
    }

    await client.query('COMMIT');
    return rowToSummary(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeSeasonZeroSettlement(
  input: {
    cutoffTimestampNs?: string;
  } = {}
): Promise<SeasonZeroSettlementSummary> {
  return finalizeSeasonSettlement(SEASON_ZERO_ID, input);
}

/** Recompute settlement without persisting — used to confirm finalized data is still valid. */
export async function recomputeSeasonSettlementSnapshot(
  seasonId: string,
  input: {
    cutoffTimestampNs?: string;
  } = {}
) {
  const id = assertSeasonId(seasonId);
  const cutoffTimestampNs = await resolveSeasonCutoffTimestampNs(
    id,
    input.cutoffTimestampNs
  );
  const [standings, indexedPoolAmountYocto, onChainPoolAmountYocto] =
    await Promise.all([
      loadStableSeasonStandings(id, cutoffTimestampNs),
      getSeasonIndexedPoolYocto(id, settlementPoolInput(cutoffTimestampNs)),
      getSeasonOnChainPoolYocto(id),
    ]);
  const { distributablePoolYocto } = resolveSeasonDistributablePool(
    indexedPoolAmountYocto,
    onChainPoolAmountYocto
  );
  return buildSeasonZeroSettlementSnapshot(
    id,
    standings.standings,
    distributablePoolYocto
  );
}

export async function confirmFinalizedSettlement(
  seasonId: string
): Promise<{ confirmed: boolean; reason?: string }> {
  const existing = await getSeasonSettlementSummary(seasonId);
  if (!existing) {
    return { confirmed: false, reason: 'Settlement has not been finalized' };
  }
  if (existing.status === 'published' && existing.publishedTxHash) {
    return { confirmed: true };
  }

  const recomputed = await recomputeSeasonSettlementSnapshot(seasonId);
  if (recomputed.root !== existing.root) {
    return {
      confirmed: false,
      reason: 'Recomputed Merkle root differs from finalized settlement',
    };
  }
  if (recomputed.totalAmountYocto !== existing.totalAmountYocto) {
    return {
      confirmed: false,
      reason: 'Recomputed payout total differs from finalized settlement',
    };
  }
  if (recomputed.participantCount !== existing.participantCount) {
    return {
      confirmed: false,
      reason: 'Participant count changed since finalization',
    };
  }
  if (recomputed.rewardCount !== existing.rewardCount) {
    return {
      confirmed: false,
      reason: 'Reward count changed since finalization',
    };
  }

  return { confirmed: true };
}

export async function publishSeasonSettlement(
  seasonId: string,
  input: {
    active?: boolean;
  } = {}
): Promise<SeasonZeroSettlementSummary> {
  const id = assertSeasonId(seasonId);
  const existing = await getSeasonSettlementSummary(id);
  if (!existing) {
    throw new Error(`Season ${id} settlement has not been finalized`);
  }
  if (existing.status === 'published' && existing.publishedTxHash) {
    return existing;
  }

  const claimRows = await query<{ amount: string }>(
    `SELECT amount
     FROM season_settlement_claims
     WHERE season_id = $1`,
    [id]
  );
  const claimTotal = claimRows.rows.reduce(
    (sum, row) => sum + BigInt(row.amount || '0'),
    0n
  );
  const totalAmount = BigInt(existing.totalAmountYocto || '0');
  if (claimTotal !== totalAmount) {
    throw new Error(
      `Settlement claim total (${claimTotal}) does not match total_amount (${totalAmount})`
    );
  }
  const onChainPoolAmountYocto = await getSeasonOnChainPoolYocto(id);
  if (totalAmount > BigInt(onChainPoolAmountYocto || '0')) {
    throw new Error(
      `Settlement total (${totalAmount}) exceeds on-chain season pool (${onChainPoolAmountYocto})`
    );
  }

  const active = input.active ?? true;
  const result = await relaySocialSpendSettlement({
    seasonId: id,
    root: existing.root,
    totalAmount: existing.totalAmountYocto,
    active,
  });
  if (!result.success) {
    throw new Error(
      result.error || `Relayer returned ${result.httpStatus} (${result.status})`
    );
  }

  const updated = await query<SeasonSettlementRow>(
    `UPDATE season_settlements
     SET status = 'published',
         active = $2,
         published_tx_hash = $3,
         published_at = now(),
         updated_at = now()
     WHERE season_id = $1
     RETURNING *`,
    [id, active, result.tx_hash ?? null]
  );
  return rowToSummary(updated.rows[0]);
}

export async function publishSeasonZeroSettlement(
  input: {
    active?: boolean;
  } = {}
): Promise<SeasonZeroSettlementSummary> {
  return publishSeasonSettlement(SEASON_ZERO_ID, input);
}

export const SEASON_ZERO_SETTLEMENT_JOIN_MIN_YOCTO =
  SEASON_ZERO_JOIN_RALLY_MIN_YOCTO.toString();
