import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { viewContractAt } from './near.js';
import type { GovernanceDaoPolicySnapshot } from './governance-proposal-policy-snapshot.js';
import { replaceDaoMembershipsFromPolicy } from './governance-dao-membership-store.js';

const MEMBERSHIP_SYNC_TTL_MS = 30_000;

const inFlight = new Map<string, Promise<void>>();
const lastSyncedAt = new Map<string, number>();

function normalizeDaoAccountId(value: string): string {
  return value.trim().toLowerCase();
}

function isMembershipAffectingKind(
  kind: Record<string, unknown> | null | undefined
): boolean {
  if (!kind || typeof kind !== 'object') return false;
  return (
    'AddMemberToRole' in kind ||
    'RemoveMemberFromRole' in kind ||
    'ChangePolicy' in kind ||
    'ChangePolicyAddOrUpdateRole' in kind ||
    'ChangePolicyRemoveRole' in kind ||
    'ChangePolicyUpdateDefaultVotePolicy' in kind ||
    'ChangePolicyUpdateParameters' in kind
  );
}

/** Index Group memberships from an already-fetched live policy (no extra RPC). */
export async function indexDaoMembershipsFromPolicy(
  daoAccountIdInput: string,
  policy: GovernanceDaoPolicySnapshot | null
): Promise<void> {
  const daoAccountId = normalizeDaoAccountId(daoAccountIdInput);
  if (!daoAccountId) return;

  try {
    await replaceDaoMembershipsFromPolicy(daoAccountId, policy);
    lastSyncedAt.set(daoAccountId, Date.now());
  } catch (error) {
    logger.warn(
      { err: error, daoAccountId },
      'Failed to index DAO memberships from policy'
    );
  }
}

/**
 * Fetch live get_policy and replace membership rows.
 * Coalesces in-flight work and skips RPC when synced within TTL.
 */
export async function syncDaoMemberships(
  daoAccountIdInput: string,
  opts: { force?: boolean } = {}
): Promise<void> {
  const daoAccountId = normalizeDaoAccountId(daoAccountIdInput);
  if (!daoAccountId) return;

  if (!opts.force) {
    const last = lastSyncedAt.get(daoAccountId);
    if (last != null && Date.now() - last < MEMBERSHIP_SYNC_TTL_MS) {
      return;
    }
  }

  let pending = inFlight.get(daoAccountId);
  if (!pending) {
    pending = (async () => {
      const policy = await viewContractAt<GovernanceDaoPolicySnapshot>(
        daoAccountId,
        'get_policy',
        {}
      ).catch(() => null);
      await indexDaoMembershipsFromPolicy(daoAccountId, policy);
    })()
      .catch((error) => {
        logger.warn(
          { err: error, daoAccountId },
          'DAO membership sync failed'
        );
      })
      .finally(() => {
        inFlight.delete(daoAccountId);
      });
    inFlight.set(daoAccountId, pending);
  }

  await pending;
}

/** Fire-and-forget membership refresh after member/policy proposals settle. */
export function scheduleDaoMembershipSyncAfterProposal(
  daoAccountId: string,
  proposal: {
    status?: string | null;
    kind?: Record<string, unknown> | null;
  }
): void {
  const status = proposal.status?.trim();
  if (status !== 'Approved') {
    return;
  }
  if (!isMembershipAffectingKind(proposal.kind ?? null)) {
    return;
  }
  void syncDaoMemberships(daoAccountId, { force: true });
}

export function startDaoMembershipSyncInBackground(
  daoAccountId: string = config.governanceDao
): void {
  void syncDaoMemberships(daoAccountId, { force: true });
}
