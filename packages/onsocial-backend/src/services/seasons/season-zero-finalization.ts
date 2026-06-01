import { pool, query } from '../../db/index.js';
import { indexerQuery } from '../../db/indexer.js';
import { logger } from '../../logger.js';
import { viewContractAt, viewContractRawAt } from '../near.js';
import { relaySocialSpendSettlement } from '../social-spend-settlement-relay.js';
import {
  SEASON_ZERO_ID,
  SEASON_ZERO_JOIN_RALLY_MIN_YOCTO,
} from './season-zero-policy.js';
import { getSeasonZeroStandings } from './season-zero-standings.js';
import {
  buildSeasonZeroSettlementSnapshot,
  type SeasonZeroSettlementSnapshot,
} from './season-zero-settlement.js';
import { config } from '../../config/index.js';

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

export async function getSeasonZeroOnChainConfig(): Promise<SeasonZeroOnChainConfig | null> {
  try {
    const raw = await viewContractRawAt(
      config.socialSpendContract,
      'get_season_config',
      { season_id: SEASON_ZERO_ID }
    );
    if (raw === 'null') return null;
    const parsed = JSON.parse(raw) as Omit<
      SeasonZeroOnChainConfig,
      'starts_at_ns' | 'ends_at_ns' | 'claim_starts_at_ns'
    >;
    return {
      ...parsed,
      starts_at_ns: extractJsonInteger(raw, 'starts_at_ns') ?? '0',
      ends_at_ns: extractJsonInteger(raw, 'ends_at_ns') ?? '0',
      claim_starts_at_ns: extractJsonInteger(raw, 'claim_starts_at_ns'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Season Zero on-chain config unavailable');
    return null;
  }
}

export async function getSeasonZeroIndexedPoolYocto(
  cutoffTimestampNs?: string
): Promise<string> {
  const hasCutoff = Boolean(cutoffTimestampNs?.trim());
  const cutoffParam = cutoffTimestampNs?.trim() ?? '';
  const result = await indexerQuery<SeasonPoolRow>(
    `SELECT COALESCE(SUM(COALESCE(NULLIF(season_amount, ''), '0')::numeric), 0)::text AS pool_yocto
     FROM social_spend_events
     WHERE event_type = 'SOCIAL_SPENT'
       AND success = true
       AND action = 'join_rally'
       AND season_id = $1
       ${hasCutoff ? 'AND block_timestamp <= $2::numeric' : ''}`,
    hasCutoff ? [SEASON_ZERO_ID, cutoffParam] : [SEASON_ZERO_ID]
  );
  return result.rows[0]?.pool_yocto ?? '0';
}

export async function getSeasonZeroSettlementSummary(): Promise<SeasonZeroSettlementSummary | null> {
  const result = await query<SeasonSettlementRow>(
    `SELECT *
     FROM season_settlements
     WHERE season_id = $1`,
    [SEASON_ZERO_ID]
  );
  const row = result.rows[0];
  return row ? rowToSummary(row) : null;
}

export async function getSeasonZeroClaimData(
  accountId: string
): Promise<SeasonZeroClaimData | null> {
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
    [SEASON_ZERO_ID, accountId]
  );
  const row = result.rows[0];
  if (!row) return null;

  let claimed: boolean | null = null;
  try {
    claimed = await viewContractAt<boolean>(
      config.socialSpendContract,
      'has_claimed_season',
      { season_id: SEASON_ZERO_ID, account_id: accountId }
    );
  } catch {
    claimed = null;
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
  };
}

export async function finalizeSeasonZeroSettlement(
  input: {
    cutoffTimestampNs?: string;
  } = {}
): Promise<SeasonZeroSettlementSummary> {
  const existing = await getSeasonZeroSettlementSummary();
  if (existing) return existing;

  const onChainConfig = await getSeasonZeroOnChainConfig();
  const cutoffTimestampNs =
    input.cutoffTimestampNs?.trim() || onChainConfig?.ends_at_ns?.toString();
  if (!cutoffTimestampNs) {
    throw new Error(
      'Season Zero on-chain config is required before finalization'
    );
  }
  if (nowNs() < BigInt(cutoffTimestampNs)) {
    throw new Error('Season Zero has not ended yet');
  }

  const [standings, indexedPoolAmountYocto] = await Promise.all([
    getSeasonZeroStandings({
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0,
      cutoffTimestampNs,
      unbounded: true,
    }),
    getSeasonZeroIndexedPoolYocto(cutoffTimestampNs),
  ]);
  const snapshot = buildSeasonZeroSettlementSnapshot(
    standings.standings,
    indexedPoolAmountYocto
  );
  const { claims, ...snapshotSummary } = snapshot;

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
        SEASON_ZERO_ID,
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
      const raced = await getSeasonZeroSettlementSummary();
      if (raced) return raced;
      throw new Error(
        'Season Zero settlement already exists but could not be loaded'
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
          SEASON_ZERO_ID,
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

export async function publishSeasonZeroSettlement(
  input: {
    active?: boolean;
  } = {}
): Promise<SeasonZeroSettlementSummary> {
  const existing = await getSeasonZeroSettlementSummary();
  if (!existing) {
    throw new Error('Season Zero settlement has not been finalized');
  }
  if (existing.status === 'published' && existing.publishedTxHash) {
    return existing;
  }

  const active = input.active ?? true;
  const result = await relaySocialSpendSettlement({
    seasonId: SEASON_ZERO_ID,
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
    [SEASON_ZERO_ID, active, result.tx_hash ?? null]
  );
  return rowToSummary(updated.rows[0]);
}

function extractJsonInteger(raw: string, field: string): string | null {
  const match = raw.match(
    new RegExp(`"${field}"\\s*:\\s*(null|"\\d+"|\\d+)`, 'u')
  );
  if (!match) return null;
  const value = match[1];
  if (!value || value === 'null') return null;
  return value.replace(/"/g, '');
}

export const SEASON_ZERO_SETTLEMENT_JOIN_MIN_YOCTO =
  SEASON_ZERO_JOIN_RALLY_MIN_YOCTO.toString();
