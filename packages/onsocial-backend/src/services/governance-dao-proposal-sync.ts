import { query } from '../db/index.js';
import { logger } from '../logger.js';
import { viewContractAt } from './near.js';
import {
  isTerminalDaoProposalStatus,
  readProposalLastActionBlockHeight,
  readProposalSubmissionBlockHeight,
  resolveProposalPolicySnapshotsForRecords,
  type GovernanceDaoPolicySnapshot,
} from './governance-proposal-policy-snapshot.js';
import { resolveProposalResolvedAt } from './governance-proposal-resolved-at.js';
import {
  countDaoProposalSnapshots,
  getMaxPersistedProposalId,
  persistDaoProposalSnapshot,
  type PersistedDaoProposalSnapshot,
} from './governance-dao-proposal-store.js';
import { publishDaoProposalUpdated } from './governance-proposal-events.js';

const SYNC_BATCH_SIZE = 50;
const BACKFILL_BATCH_PAUSE_MS = 250;
const LIVE_SYNC_COALESCE_MS = 4_000;
const OPEN_PROPOSAL_FEED_REFRESH_TTL_MS = 30_000;

const liveSyncInFlight = new Map<
  string,
  Promise<PersistedDaoProposalSnapshot | null>
>();
const lastLiveSyncAt = new Map<string, number>();

type GovernanceDaoProposalRecord = {
  id?: number;
  proposer?: string;
  description?: string;
  kind?: Record<string, unknown>;
  status?: string;
  submission_time?: string;
  vote_counts?: Record<string, [string, string, string]>;
  votes?: Record<string, string>;
  last_actions_log?: Array<{ block_height: string }>;
};

let incrementalSyncInFlight: Promise<void> | null = null;
let backfillInFlight: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function proposalSyncKey(daoAccountId: string, proposalId: number): string {
  return `${daoAccountId}:${proposalId}`;
}

async function loadPersistedProposalSnapshot(
  daoAccountId: string,
  proposalId: number
): Promise<PersistedDaoProposalSnapshot | null> {
  const { loadDaoProposalSnapshot } = await import(
    './governance-dao-proposal-store.js'
  );
  const cached = await loadDaoProposalSnapshot(daoAccountId, proposalId);
  return cached?.proposalSnapshot ?? null;
}

async function fetchAndPersistDaoProposalFromChain(
  daoAccountId: string,
  proposalId: number,
  opts: { publishUpdate?: boolean } = {}
): Promise<PersistedDaoProposalSnapshot | null> {
  const proposal = await viewContractAt<GovernanceDaoProposalRecord>(
    daoAccountId,
    'get_proposal',
    { id: proposalId }
  );

  if (!proposal) {
    return null;
  }

  const persisted = await enrichAndPersistProposal(daoAccountId, {
    ...proposal,
    id: proposal.id ?? proposalId,
  });

  if (persisted && opts.publishUpdate) {
    publishDaoProposalUpdated({ daoAccountId, proposalId });
  }

  return persisted;
}

function normalizeDaoProposalStatus(
  status: string | null | undefined
): string | null {
  if (!status) {
    return null;
  }

  const normalized = status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  switch (normalized) {
    case 'approved':
    case 'executed':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'removed':
    case 'cancelled':
    case 'canceled':
      return 'Removed';
    case 'expired':
      return 'Expired';
    case 'failed':
    case 'executed_skipped':
      return 'Failed';
    case 'moved':
      return 'Moved';
    case 'inprogress':
    case 'in_progress':
    case 'active':
    case 'submitted':
    case 'draft':
      return 'InProgress';
    default:
      break;
  }

  if (
    status === 'Approved' ||
    status === 'Rejected' ||
    status === 'Removed' ||
    status === 'Failed' ||
    status === 'Expired' ||
    status === 'Moved' ||
    status === 'InProgress'
  ) {
    return status;
  }

  return status;
}

function toPersistedProposal(
  proposal: GovernanceDaoProposalRecord,
  proposalId: number,
  policySnapshot: GovernanceDaoPolicySnapshot | null,
  resolvedAt: string | null
): PersistedDaoProposalSnapshot {
  const status = normalizeDaoProposalStatus(proposal.status) ?? 'Unknown';

  return {
    id: proposalId,
    proposer: proposal.proposer ?? '',
    description: proposal.description ?? '',
    kind: proposal.kind ?? {},
    status,
    vote_counts: proposal.vote_counts ?? {},
    votes: proposal.votes ?? {},
    submission_time: proposal.submission_time ?? '',
    last_actions_log: proposal.last_actions_log,
    policy_snapshot: policySnapshot,
    resolved_at: resolvedAt,
  };
}

async function fetchDaoProposalsBatch(
  daoAccountId: string,
  fromIndex: number,
  limit: number
): Promise<GovernanceDaoProposalRecord[]> {
  const proposals = await viewContractAt<GovernanceDaoProposalRecord[]>(
    daoAccountId,
    'get_proposals',
    { from_index: fromIndex, limit }
  );

  if (!Array.isArray(proposals)) {
    return [];
  }

  return proposals.map((proposal, index) => ({
    ...proposal,
    id: proposal.id ?? fromIndex + index,
  }));
}

async function enrichAndPersistProposal(
  daoAccountId: string,
  proposal: GovernanceDaoProposalRecord
): Promise<PersistedDaoProposalSnapshot | null> {
  const proposalId =
    typeof proposal.id === 'number' && proposal.id >= 0 ? proposal.id : null;
  if (proposalId === null) {
    return null;
  }

  const normalizedStatus = normalizeDaoProposalStatus(proposal.status);
  const normalizedProposal: GovernanceDaoProposalRecord = {
    ...proposal,
    id: proposalId,
    status: normalizedStatus ?? proposal.status,
  };

  const policyByProposalId = await resolveProposalPolicySnapshotsForRecords(
    daoAccountId,
    [normalizedProposal]
  );
  const policySnapshot = policyByProposalId.get(proposalId) ?? null;

  const resolvedAt = isTerminalDaoProposalStatus(normalizedStatus)
    ? await resolveProposalResolvedAt(normalizedProposal)
    : null;

  const persisted = toPersistedProposal(
    normalizedProposal,
    proposalId,
    policySnapshot,
    resolvedAt
  );

  await persistDaoProposalSnapshot({
    daoAccountId,
    proposal: persisted,
    policySnapshot,
    submissionBlockHeight:
      readProposalSubmissionBlockHeight(normalizedProposal),
    resolvedBlockHeight: resolvedAt
      ? readProposalLastActionBlockHeight(normalizedProposal)
      : null,
    resolvedAt,
  });

  return persisted;
}

export async function syncDaoProposalById(
  daoAccountId: string,
  proposalId: number,
  opts: { live?: boolean } = {}
): Promise<PersistedDaoProposalSnapshot | null> {
  if (!Number.isInteger(proposalId) || proposalId < 0) {
    return null;
  }

  if (!opts.live) {
    const cached = await loadPersistedProposalSnapshot(
      daoAccountId,
      proposalId
    );
    if (cached) {
      return cached;
    }
  } else {
    const syncKey = proposalSyncKey(daoAccountId, proposalId);
    const now = Date.now();
    const lastSyncedAt = lastLiveSyncAt.get(syncKey) ?? 0;

    if (now - lastSyncedAt < LIVE_SYNC_COALESCE_MS) {
      const cached = await loadPersistedProposalSnapshot(
        daoAccountId,
        proposalId
      );
      if (cached) {
        return cached;
      }
    }

    const inFlight = liveSyncInFlight.get(syncKey);
    if (inFlight) {
      return inFlight;
    }

    const syncPromise = fetchAndPersistDaoProposalFromChain(
      daoAccountId,
      proposalId,
      { publishUpdate: true }
    ).finally(() => {
      liveSyncInFlight.delete(syncKey);
      lastLiveSyncAt.set(syncKey, Date.now());
    });

    liveSyncInFlight.set(syncKey, syncPromise);
    return syncPromise;
  }

  return fetchAndPersistDaoProposalFromChain(daoAccountId, proposalId);
}

async function syncProposalRange(
  daoAccountId: string,
  fromIndex: number,
  toProposalId: number
): Promise<number> {
  let synced = 0;

  for (let start = fromIndex; start <= toProposalId; start += SYNC_BATCH_SIZE) {
    const limit = Math.min(SYNC_BATCH_SIZE, toProposalId - start + 1);
    const proposals = await fetchDaoProposalsBatch(daoAccountId, start, limit);

    await Promise.all(
      proposals.map((proposal) =>
        enrichAndPersistProposal(daoAccountId, proposal)
      )
    );

    synced += proposals.length;

    if (start + limit <= toProposalId) {
      await sleep(BACKFILL_BATCH_PAUSE_MS);
    }
  }

  return synced;
}

const TERMINAL_RESOLVED_AT_REFRESH_LIMIT = 10;

async function refreshTerminalProposalsMissingResolvedAt(
  daoAccountId: string
): Promise<void> {
  const result = await query<{ proposal_id: string | number }>(
    `SELECT proposal_id
       FROM governance_dao_proposal_snapshots
      WHERE dao_account_id = $1
        AND status IN ('Approved', 'Rejected', 'Removed', 'Failed', 'Expired', 'Moved')
        AND (resolved_at IS NULL OR resolved_at = '')
      ORDER BY proposal_id ASC
      LIMIT $2`,
    [daoAccountId, TERMINAL_RESOLVED_AT_REFRESH_LIMIT]
  );

  await Promise.all(
    result.rows.map(async (row) => {
      const proposalId = Number(row.proposal_id);
      if (!Number.isInteger(proposalId) || proposalId < 0) {
        return;
      }

      await syncDaoProposalById(daoAccountId, proposalId, { live: true });
    })
  );
}

async function refreshOpenDaoProposals(daoAccountId: string): Promise<void> {
  const result = await query<{ proposal_id: string | number }>(
    `SELECT proposal_id
       FROM governance_dao_proposal_snapshots
      WHERE dao_account_id = $1
        AND status = 'InProgress'
      ORDER BY proposal_id ASC`,
    [daoAccountId]
  );

  const now = Date.now();

  await Promise.all(
    result.rows.map(async (row) => {
      const proposalId = Number(row.proposal_id);
      if (!Number.isInteger(proposalId) || proposalId < 0) {
        return;
      }

      const syncKey = proposalSyncKey(daoAccountId, proposalId);
      const lastSyncedAt = lastLiveSyncAt.get(syncKey) ?? 0;
      if (now - lastSyncedAt < OPEN_PROPOSAL_FEED_REFRESH_TTL_MS) {
        return;
      }

      await syncDaoProposalById(daoAccountId, proposalId, { live: true });
    })
  );
}

export async function syncDaoProposalsIncremental(
  daoAccountId: string
): Promise<{ synced: number; lastProposalId: number | null }> {
  const lastProposalId = await viewContractAt<number>(
    daoAccountId,
    'get_last_proposal_id',
    {}
  );

  if (typeof lastProposalId !== 'number' || lastProposalId < 0) {
    return { synced: 0, lastProposalId: null };
  }

  const maxPersistedId = await getMaxPersistedProposalId(daoAccountId);
  const fromIndex = maxPersistedId === null ? 0 : maxPersistedId + 1;

  if (fromIndex > lastProposalId) {
    await refreshOpenDaoProposals(daoAccountId);
    await refreshTerminalProposalsMissingResolvedAt(daoAccountId);
    return { synced: 0, lastProposalId };
  }

  const synced = await syncProposalRange(
    daoAccountId,
    fromIndex,
    lastProposalId
  );
  await refreshOpenDaoProposals(daoAccountId);
  await refreshTerminalProposalsMissingResolvedAt(daoAccountId);
  return { synced, lastProposalId };
}

export async function syncDaoProposalsBackfill(
  daoAccountId: string
): Promise<{ synced: number; lastProposalId: number | null }> {
  const lastProposalId = await viewContractAt<number>(
    daoAccountId,
    'get_last_proposal_id',
    {}
  );

  if (typeof lastProposalId !== 'number' || lastProposalId < 0) {
    return { synced: 0, lastProposalId: null };
  }

  const synced = await syncProposalRange(daoAccountId, 0, lastProposalId);
  return { synced, lastProposalId };
}

export async function ensureDaoProposalsSynced(
  daoAccountId: string
): Promise<void> {
  if (!incrementalSyncInFlight) {
    incrementalSyncInFlight = syncDaoProposalsIncremental(daoAccountId)
      .then(({ synced, lastProposalId }) => {
        if (synced > 0) {
          logger.info(
            { daoAccountId, synced, lastProposalId },
            'Synced new DAO proposals'
          );
        }
      })
      .catch((error) => {
        logger.warn(
          { err: error, daoAccountId },
          'DAO proposal incremental sync failed'
        );
      })
      .finally(() => {
        incrementalSyncInFlight = null;
      });
  }

  await incrementalSyncInFlight;
}

export function startDaoProposalBackfillInBackground(
  daoAccountId: string
): void {
  if (backfillInFlight) {
    return;
  }

  backfillInFlight = (async () => {
    const existingCount = await countDaoProposalSnapshots(daoAccountId);
    const lastProposalId = await viewContractAt<number>(
      daoAccountId,
      'get_last_proposal_id',
      {}
    );

    if (
      typeof lastProposalId !== 'number' ||
      lastProposalId < 0 ||
      existingCount >= lastProposalId + 1
    ) {
      await refreshTerminalProposalsMissingResolvedAt(daoAccountId);
      return;
    }

    logger.info(
      { daoAccountId, existingCount, lastProposalId },
      'Starting DAO proposal backfill'
    );

    const { synced } = await syncDaoProposalsBackfill(daoAccountId);
    await refreshTerminalProposalsMissingResolvedAt(daoAccountId);
    logger.info(
      { daoAccountId, synced, lastProposalId },
      'DAO proposal backfill completed'
    );
  })()
    .catch((error) => {
      logger.warn({ err: error, daoAccountId }, 'DAO proposal backfill failed');
    })
    .finally(() => {
      backfillInFlight = null;
    });
}
