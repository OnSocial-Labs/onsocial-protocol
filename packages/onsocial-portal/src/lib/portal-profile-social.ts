import type { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  STANDING_PREVIEW_LIMIT,
  listProfileStats,
  loadViewerContext,
  mapStandingRowsToSummaries,
  type StandingListItem,
} from '@/lib/profile-social-server';

type PortalOnSocial = ReturnType<typeof createPortalServerOnSocialClient>;

export interface PortalProfileSocialPayload {
  accountId: string;
  viewerAccountId: string | null;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
  counts: {
    incoming: number;
    outgoing: number;
    mutual: number;
  };
  mutual: Awaited<ReturnType<typeof mapStandingRowsToSummaries>>;
  incoming: Awaited<ReturnType<typeof mapStandingRowsToSummaries>>;
  outgoing: Awaited<ReturnType<typeof mapStandingRowsToSummaries>>;
}

function peerAccountIdsFromRows(
  rows: StandingListItem[],
  direction: 'incoming' | 'outgoing' | 'mutual'
): string[] {
  return rows.map((row) =>
    direction === 'outgoing' ? row.targetAccount : row.accountId
  );
}

export async function loadPortalProfileSocial(
  os: PortalOnSocial,
  accountId: string,
  viewerAccountId: string | null
): Promise<PortalProfileSocialPayload> {
  const [
    counts,
    outgoingRows,
    incomingRows,
    mutualRows,
    mutualCount,
    viewerStanding,
    theyStandWithViewer,
  ] = await Promise.all([
    os.standings.counts(accountId),
    os.standings.listOutgoingDetailed(accountId, {
      limit: STANDING_PREVIEW_LIMIT,
      offset: 0,
    }),
    os.standings.listIncomingDetailed(accountId, {
      limit: STANDING_PREVIEW_LIMIT,
      offset: 0,
    }),
    os.standings.mutualList(accountId, {
      limit: STANDING_PREVIEW_LIMIT,
      offset: 0,
    }),
    os.query.standings.mutualCount(accountId),
    viewerAccountId && viewerAccountId !== accountId
      ? os.query.standings.viewerStandsWith(viewerAccountId, accountId)
      : Promise.resolve(false),
    viewerAccountId && viewerAccountId !== accountId
      ? os.query.standings.viewerStandsWith(accountId, viewerAccountId)
      : Promise.resolve(false),
  ]);

  const peerAccountIds = [
    ...new Set([
      ...peerAccountIdsFromRows(mutualRows as StandingListItem[], 'mutual'),
      ...peerAccountIdsFromRows(incomingRows, 'incoming'),
      ...peerAccountIdsFromRows(outgoingRows, 'outgoing'),
    ]),
  ];

  const [profiles, profileStats, { viewerOutgoingSet, viewerIncomingSet }] =
    await Promise.all([
      os.profiles.getMany(peerAccountIds),
      listProfileStats(os, peerAccountIds).catch(() => new Map()),
      loadViewerContext(os, viewerAccountId, peerAccountIds),
    ]);

  const mutual = mapStandingRowsToSummaries(
    os,
    mutualRows as StandingListItem[],
    'mutual',
    profiles,
    profileStats,
    viewerOutgoingSet,
    viewerIncomingSet
  );
  const incoming = mapStandingRowsToSummaries(
    os,
    incomingRows,
    'incoming',
    profiles,
    profileStats,
    viewerOutgoingSet,
    viewerIncomingSet
  );
  const outgoing = mapStandingRowsToSummaries(
    os,
    outgoingRows,
    'outgoing',
    profiles,
    profileStats,
    viewerOutgoingSet,
    viewerIncomingSet
  );

  return {
    accountId,
    viewerAccountId,
    viewerStanding,
    theyStandWithViewer,
    counts: {
      incoming: counts.incoming,
      outgoing: counts.outgoing,
      mutual: mutualCount,
    },
    mutual,
    incoming,
    outgoing,
  };
}
