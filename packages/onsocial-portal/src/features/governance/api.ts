import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  GOVERNANCE_DAO_ACCOUNT,
  GOVERNANCE_PROPOSAL_BOND,
} from '@/lib/portal-config';
import { resolveGovernanceDaoAccountId } from '@/features/governance/governance-dao-board';
import type { DaoProposalPayload } from '@/features/governance/governance-proposal-builders';
import { extractNearTransactionHashes } from '@/lib/near-rpc';
import {
  getGovernanceProposalBond,
  type OnChainAppConfig,
} from '@/lib/near-rpc';
import { buildGovernanceApplicationFromDaoProposal } from '@/features/governance/page-utils';
import type {
  Application,
  GovernanceDaoAction,
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
} from '@/features/governance/types';

const DAO_ACT_PROPOSAL_GAS = '300000000000000';
const DAO_ADD_PROPOSAL_GAS = '300000000000000';

function decodeProposalId(result: unknown): number | null {
  const successValue = (result as { status?: { SuccessValue?: string } })
    ?.status?.SuccessValue;

  if (typeof successValue !== 'string') {
    return null;
  }

  const decoded = atob(successValue).trim();
  if (!decoded) {
    return null;
  }

  const normalized = decoded.replace(/^"|"$/g, '');
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

async function getVerifiedSignerId(
  wallet: NearWalletBase,
  accountId: string
): Promise<string> {
  const accounts = await wallet.getAccounts({ network: ACTIVE_NEAR_NETWORK });
  const accountIds = accounts.map((account) => account.accountId);

  if (!accountIds.includes(accountId)) {
    throw new Error(
      `Wallet account mismatch. Portal is connected as ${accountId}, but the wallet is using ${accountIds.join(', ') || 'no account'}. Switch the wallet account or reconnect before signing.`
    );
  }

  return accountId;
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error('Empty response body');
  }

  return JSON.parse(raw) as T;
}

import {
  fetchGovernanceFeedCached,
  type GovernanceFeedResponse,
} from '@/features/governance/governance-feed-client';

export type { GovernanceFeedResponse };
export {
  applyGovernanceFeedApplications,
  fetchGovernanceFeedBootstrap,
  fetchGovernanceFeedCached,
  readGovernanceFeedCache,
} from '@/features/governance/governance-feed-client';

export async function fetchGovernanceFeed(options?: {
  daoAccountId?: string;
  onRevalidate?: (data: GovernanceFeedResponse) => void;
  skipMemoryCache?: boolean;
}): Promise<GovernanceFeedResponse> {
  const daoAccountId =
    options?.daoAccountId ?? resolveGovernanceDaoAccountId('governance');
  return fetchGovernanceFeedCached(daoAccountId, {
    onRevalidate: options?.onRevalidate,
    skipMemoryCache: options?.skipMemoryCache,
  });
}

export async function fetchDaoPolicy(
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<GovernanceDaoPolicy | null> {
  try {
    const search = new URLSearchParams({ daoAccountId });
    const response = await fetch(
      `/api/governance/dao/policy?${search.toString()}`,
      { cache: 'no-store' }
    );
    const body = (await response.json().catch(() => null)) as {
      policy?: GovernanceDaoPolicy | null;
    } | null;
    if (!response.ok) return null;
    return body?.policy ?? null;
  } catch {
    return null;
  }
}

export async function fetchGovernanceProposalBootstrap(
  appId: string,
  proposalId: number,
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<{
  app: Application;
  daoPolicy: GovernanceDaoPolicy;
} | null> {
  const [daoPolicy, liveProposal] = await Promise.all([
    fetchDaoPolicy(daoAccountId),
    fetchDaoProposal(proposalId, daoAccountId),
  ]);

  if (!daoPolicy || !liveProposal) {
    return null;
  }

  return {
    app: buildGovernanceApplicationFromDaoProposal(
      appId,
      liveProposal,
      proposalId,
      { daoAccountId }
    ),
    daoPolicy,
  };
}

export async function fetchDaoProposal(
  proposalId: number,
  daoAccountId = GOVERNANCE_DAO_ACCOUNT,
  opts: { live?: boolean } = {}
): Promise<GovernanceDaoProposal | null> {
  try {
    const search = new URLSearchParams({
      daoAccountId,
      proposalId: String(proposalId),
    });
    if (opts.live) {
      search.set('live', 'true');
    }
    const response = await fetch(
      `/api/governance/dao/proposal?${search.toString()}`,
      { cache: 'no-store' }
    );
    const body = (await response.json().catch(() => null)) as {
      proposal?: GovernanceDaoProposal | null;
    } | null;
    if (!response.ok) return null;
    return body?.proposal ?? null;
  } catch {
    return null;
  }
}

export async function fetchRewardsAppConfig(
  appId: string
): Promise<OnChainAppConfig | null> {
  try {
    const search = new URLSearchParams({ appId });
    const response = await fetch(
      `/api/governance/app-config?${search.toString()}`,
      { cache: 'no-store' }
    );
    const body = (await response.json().catch(() => null)) as {
      config?: OnChainAppConfig | null;
    } | null;
    if (!response.ok) return null;
    return body?.config ?? null;
  } catch {
    return null;
  }
}

export async function submitDaoProposal(
  wallet: NearWalletBase,
  accountId: string,
  payload: DaoProposalPayload,
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<{ proposalId: number | null; txHash: string | null }> {
  const proposalBond =
    (await getGovernanceProposalBond(daoAccountId).catch(() => null)) ??
    GOVERNANCE_PROPOSAL_BOND;
  const signerId = await getVerifiedSignerId(wallet, accountId);

  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: daoAccountId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'add_proposal',
          args: payload,
          gas: DAO_ADD_PROPOSAL_GAS,
          deposit: proposalBond,
        },
      },
    ],
  });

  return {
    proposalId: decodeProposalId(result),
    txHash: extractNearTransactionHashes(result)[0] ?? null,
  };
}

export async function actOnGovernanceProposal(
  wallet: NearWalletBase,
  accountId: string,
  proposalId: number,
  action: GovernanceDaoAction,
  proposalKind: Record<string, unknown>,
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<string | null> {
  const signerId = await getVerifiedSignerId(wallet, accountId);
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: daoAccountId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'act_proposal',
          args: {
            id: proposalId,
            action,
            proposal: proposalKind,
          },
          gas: DAO_ACT_PROPOSAL_GAS,
          deposit: '0',
        },
      },
    ],
  });

  return extractNearTransactionHashes(result)[0] ?? null;
}
