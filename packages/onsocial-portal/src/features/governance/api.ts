import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  GOVERNANCE_DAO_ACCOUNT,
} from '@/lib/portal-config';
import { extractNearTransactionHashes, viewContractAt } from '@/lib/near-rpc';
import type {
  Application,
  GovernanceDaoAction,
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
} from '@/features/governance/types';

const DAO_ACT_PROPOSAL_GAS = '300000000000000';

async function readJsonResponse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error('Empty response body');
  }

  return JSON.parse(raw) as T;
}

export async function fetchGovernanceFeed(): Promise<Application[]> {
  const res = await fetch('/api/governance', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch governance feed');
  const data = await readJsonResponse<{
    success: boolean;
    applications: Application[];
  }>(res);
  return data.applications;
}

export async function fetchDaoPolicy(
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<GovernanceDaoPolicy | null> {
  try {
    return await viewContractAt<GovernanceDaoPolicy>(
      daoAccountId,
      'get_policy'
    );
  } catch {
    return null;
  }
}

export async function fetchDaoProposal(
  proposalId: number,
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<GovernanceDaoProposal | null> {
  try {
    return await viewContractAt<GovernanceDaoProposal>(
      daoAccountId,
      'get_proposal',
      { id: proposalId }
    );
  } catch {
    return null;
  }
}

export async function actOnGovernanceProposal(
  wallet: NearWalletBase,
  proposalId: number,
  action: GovernanceDaoAction,
  proposalKind: Record<string, unknown>,
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<string | null> {
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
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
