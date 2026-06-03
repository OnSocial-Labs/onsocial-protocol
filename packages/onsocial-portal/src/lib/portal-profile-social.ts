import type { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

type PortalOnSocial = ReturnType<typeof createPortalServerOnSocialClient>;
import {
  STANDING_PREVIEW_LIMIT,
  buildStandingAccountSummaries,
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
  const [counts, outgoingRows, incomingRows, mutualCount, viewerStanding] =
    await Promise.all([
      os.standings.counts(accountId),
      os.standings.listOutgoingDetailed(accountId, {
        limit: STANDING_PREVIEW_LIMIT,
        offset: 0,
      }),
      os.standings.listIncomingDetailed(accountId, {
        limit: STANDING_PREVIEW_LIMIT,
        offset: 0,
      }),
      os.query.standings.mutualCount(accountId),
      viewerAccountId && viewerAccountId !== accountId
        ? os.query.standings.viewerStandsWith(viewerAccountId, accountId)
        : Promise.resolve(false),
    ]);

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
