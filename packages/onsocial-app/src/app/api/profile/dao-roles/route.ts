import { NextRequest, NextResponse } from 'next/server';
import {
  fetchProtocolDaoMemberships,
  fetchProtocolDaoProposerFlags,
  resolveDaoMembershipsForAccounts,
} from '@/lib/fetch-page-drawer-meta';
import { formatDaoRoleLabel, sortDaoRoleIds } from '@/lib/page-drawer-meta';
import { EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS } from '@/lib/protocol-dao-memberships';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export async function GET(request: NextRequest) {
  const batched = request.nextUrl.searchParams
    .getAll('accountIds')
    .flatMap((value) => value.split(','))
    .map((id) => id.trim().toLowerCase())
    .filter((id) => ACCOUNT_ID_PATTERN.test(id));
  if (batched.length > 0) {
    try {
      const memberships = await resolveDaoMembershipsForAccounts(batched);
      return NextResponse.json({
        accounts: batched.map((id) => ({
          accountId: id,
          memberships: memberships[id],
        })),
      });
    } catch {
      return NextResponse.json(
        { error: 'DAO roles unavailable', accounts: [] },
        { status: 502 }
      );
    }
  }

  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) {
    return NextResponse.json({ error: 'Invalid accountId' }, { status: 400 });
  }

  try {
    const [membershipRoles, proposer] = await Promise.all([
      fetchProtocolDaoMemberships(accountId),
      fetchProtocolDaoProposerFlags(accountId),
    ]);
    const memberships = { ...membershipRoles, proposer };
    const daoRoleIds = sortDaoRoleIds(
      [memberships.governance, memberships.treasury].filter(
        (role): role is NonNullable<typeof role> => Boolean(role)
      )
    );
    const daoRoleLabels = daoRoleIds.map(formatDaoRoleLabel).filter(Boolean);
    return NextResponse.json({
      accountId,
      daoRoleIds,
      daoRoleLabels,
      memberships,
    });
  } catch {
    return NextResponse.json(
      {
        error: 'DAO roles unavailable',
        daoRoleIds: [],
        daoRoleLabels: [],
        memberships: {
          governance: null,
          treasury: null,
          proposer: EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS,
        },
      },
      { status: 502 }
    );
  }
}
