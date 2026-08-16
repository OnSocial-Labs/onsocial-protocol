import type {
  ProtocolDaoPolicy,
  ProtocolDaoProposal,
  ProtocolFeedResponse,
} from '@/features/protocol/types';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function assertDaoAccountId(daoAccountId: string): string {
  const id = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(id)) {
    throw new Error('Invalid DAO account id.');
  }
  return id;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function fetchProtocolFeed(
  daoAccountId: string,
  scope: 'protocol' | 'all' = 'protocol'
): Promise<ProtocolFeedResponse> {
  const dao = assertDaoAccountId(daoAccountId);
  const search = new URLSearchParams({
    scope,
    daoAccountId: dao,
  });
  const body = await readJson<{
    success?: boolean;
    applications?: ProtocolFeedResponse['applications'];
    daoPolicy?: ProtocolDaoPolicy | null;
    daoAccountId?: string;
    syncing?: boolean;
    error?: string;
  }>(
    await fetch(`/api/governance?${search.toString()}`, {
      cache: 'no-store',
    })
  );
  if (body.success === false) {
    throw new Error(body.error || 'Governance feed unavailable.');
  }
  return {
    applications: Array.isArray(body.applications) ? body.applications : [],
    daoPolicy: body.daoPolicy ?? null,
    daoAccountId: body.daoAccountId?.trim() || dao,
    syncing: Boolean(body.syncing),
  };
}

export async function fetchProtocolProposal(opts: {
  daoAccountId: string;
  proposalId: number;
  live?: boolean;
}): Promise<{
  proposal: ProtocolDaoProposal | null;
  daoPolicy: ProtocolDaoPolicy | null;
}> {
  const dao = assertDaoAccountId(opts.daoAccountId);
  const search = new URLSearchParams({
    daoAccountId: dao,
    proposalId: String(opts.proposalId),
  });
  if (opts.live) search.set('live', 'true');
  const body = await readJson<{
    proposal?: ProtocolDaoProposal | null;
    daoPolicy?: ProtocolDaoPolicy | null;
    error?: string;
  }>(
    await fetch(`/api/governance/proposal?${search.toString()}`, {
      cache: 'no-store',
    })
  );
  return {
    proposal: body.proposal ?? null,
    daoPolicy: body.daoPolicy ?? null,
  };
}
