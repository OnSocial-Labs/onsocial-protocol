import 'server-only';

import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';
import type { GovernanceDaoPolicy } from '@/features/governance/types';

const BACKEND_URL = process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL;

export async function loadPersistedProposalPolicySnapshot(
  proposalId: number,
  daoAccountId: string
): Promise<GovernanceDaoPolicy | null> {
  if (!Number.isInteger(proposalId) || proposalId < 0) {
    return null;
  }

  const url = new URL(
    `${BACKEND_URL.replace(/\/$/, '')}/v1/governance/proposal-policy-snapshot`
  );
  url.searchParams.set('proposalId', String(proposalId));
  url.searchParams.set('daoAccountId', daoAccountId);

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      policy_snapshot?: GovernanceDaoPolicy | null;
    };

    return payload.policy_snapshot ?? null;
  } catch {
    return null;
  }
}
