import 'server-only';

import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';
import type {
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
} from '@/features/governance/types';

const BACKEND_URL = process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL;

function buildGovernanceBackendUrl(path: string): URL {
  return new URL(`${BACKEND_URL.replace(/\/$/, '')}/v1/governance/${path}`);
}

export async function loadDaoProposalFromBackend(
  proposalId: number,
  daoAccountId: string,
  opts: { live?: boolean } = {}
): Promise<GovernanceDaoProposal | null> {
  if (!Number.isInteger(proposalId) || proposalId < 0) {
    return null;
  }

  const url = buildGovernanceBackendUrl('proposal');
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

export async function loadDaoRecentFromBackend(
  daoAccountId: string,
  limit = 20
): Promise<{
  proposals: GovernanceDaoProposal[];
  daoPolicy: GovernanceDaoPolicy | null;
} | null> {
  const url = buildGovernanceBackendUrl('recent');
  url.searchParams.set('daoAccountId', daoAccountId);
  url.searchParams.set('limit', String(limit));

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      proposals?: GovernanceDaoProposal[] | null;
      daoPolicy?: GovernanceDaoPolicy | null;
    };

    const proposals = Array.isArray(payload.proposals) ? payload.proposals : [];
    if (proposals.length === 0 || !payload.daoPolicy) {
      return null;
    }

    return {
      proposals: proposals.map((proposal) => ({
        ...proposal,
        status: proposal.status as GovernanceDaoProposal['status'],
      })),
      daoPolicy: payload.daoPolicy,
    };
  } catch {
    return null;
  }
}

export async function loadDaoPolicyFromBackend(
  daoAccountId: string
): Promise<GovernanceDaoPolicy | null> {
  const url = buildGovernanceBackendUrl('policy');
  url.searchParams.set('daoAccountId', daoAccountId);

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      daoPolicy?: GovernanceDaoPolicy | null;
    };

    return payload.daoPolicy ?? null;
  } catch {
    return null;
  }
}
