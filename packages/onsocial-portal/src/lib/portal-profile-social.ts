import type { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

type PortalOnSocial = ReturnType<typeof createPortalServerOnSocialClient>;
import {
  STANDING_PREVIEW_LIMIT,
  buildStandingAccountSummaries,
  countMutualStandings,
  listStandingRows,
} from '@/lib/profile-social-server';

export interface PortalProfileSocialPayload {
  accountId: string;
  viewerAccountId: string | null;
  viewerStanding: boolean;
  counts: {
    incoming: number;
    outgoing: number;
    mutual: number;
  };
  incoming: Awaited<ReturnType<typeof buildStandingAccountSummaries>>;
  outgoing: Awaited<ReturnType<typeof buildStandingAccountSummaries>>;
}

export async function loadPortalProfileSocial(
  os: PortalOnSocial,
  accountId: string,
  viewerAccountId: string | null
): Promise<PortalProfileSocialPayload> {
  const [counts, outgoingRows, incomingRows, mutualCount, viewerOutgoingIds] =
    await Promise.all([
      os.standings.counts(accountId),
      listStandingRows(os, accountId, 'outgoing', STANDING_PREVIEW_LIMIT, 0),
      listStandingRows(os, accountId, 'incoming', STANDING_PREVIEW_LIMIT, 0),
      countMutualStandings(os, accountId),
      viewerAccountId
        ? os.standings
            .listOutgoing(viewerAccountId, { limit: 1000 })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

  const viewerOutgoingSet = new Set(viewerOutgoingIds);
  const viewerStanding =
    Boolean(viewerAccountId) &&
    viewerAccountId !== accountId &&
    viewerOutgoingSet.has(accountId);

  const [incoming, outgoing] = await Promise.all([
    buildStandingAccountSummaries(
      os,
      incomingRows,
      'incoming',
      viewerAccountId
    ),
    buildStandingAccountSummaries(
      os,
      outgoingRows,
      'outgoing',
      viewerAccountId
    ),
  ]);

  return {
    accountId,
    viewerAccountId,
    viewerStanding,
    counts: {
      incoming: counts.incoming,
      outgoing: counts.outgoing,
      mutual: mutualCount,
    },
    incoming,
    outgoing,
  };
}
