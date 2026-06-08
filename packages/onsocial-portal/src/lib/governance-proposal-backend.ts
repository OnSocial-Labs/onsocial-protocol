import 'server-only';

import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';
import type { GovernanceDaoProposal } from '@/features/governance/types';

const BACKEND_URL = process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL;

export async function loadDaoProposalFromBackend(
  proposalId: number,
  daoAccountId: string,
  opts: { live?: boolean } = {}
): Promise<GovernanceDaoProposal | null> {
  if (!Number.isInteger(proposalId) || proposalId < 0) {
    return null;
  }

  const url = new URL(
    `${BACKEND_URL.replace(/\/$/, '')}/v1/governance/proposal`
  );
  url.searchParams.set('proposalId', String(proposalId));
  url.searchParams.set('daoAccountId', daoAccountId);
  if (opts.live) {
    url.searchParams.set('live', 'true');
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(opts.live ? 12_000 : 8_000),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      proposal?: GovernanceDaoProposal | null;
    };

    const proposal = payload.proposal;
    if (!proposal) {
      return null;
    }

    return {
      ...proposal,
      status: proposal.status as GovernanceDaoProposal['status'],
    };
  } catch {
    return null;
  }
}
