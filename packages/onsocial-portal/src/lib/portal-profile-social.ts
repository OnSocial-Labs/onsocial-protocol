import type { MaterialisedProfile, ProfileSearchRow } from '@onsocial/sdk';
import type { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  STANDING_PREVIEW_LIMIT,
  mapStandingRowsToSummaries,
  profileSearchRowToMaterialised,
  profileStatsFromSearchRow,
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
  endorsementCounts: {
    received: number;
    given: number;
  };
  mutual: Awaited<ReturnType<typeof mapStandingRowsToSummaries>>;
  incoming: Awaited<ReturnType<typeof mapStandingRowsToSummaries>>;
  outgoing: Awaited<ReturnType<typeof mapStandingRowsToSummaries>>;
}

function buildSummaryMaps(peers: ProfileSearchRow[]) {
  const profiles: Record<string, MaterialisedProfile> = {};
  const profileStats = new Map<
    string,
    ReturnType<typeof profileStatsFromSearchRow>
  >();

  for (const row of peers) {
    profiles[row.accountId] = profileSearchRowToMaterialised(row);
    profileStats.set(row.accountId, profileStatsFromSearchRow(row));
  }

  return { profiles, profileStats };
}

function mapPreviewLists(
  os: PortalOnSocial,
  preview: Awaited<ReturnType<PortalOnSocial['standings']['profilePreview']>>
) {
  const { profiles, profileStats } = buildSummaryMaps(preview.peers);
  const viewerOutgoingSet = new Set(preview.viewerOutgoingPeerIds);
  const viewerIncomingSet = new Set(preview.viewerIncomingPeerIds);

  const mutual = mapStandingRowsToSummaries(
    os,
    preview.mutual as StandingListItem[],
    'mutual',
    profiles,
    profileStats,
    viewerOutgoingSet,
    viewerIncomingSet
  );
  const incoming = mapStandingRowsToSummaries(
    os,
    preview.incoming,
    'incoming',
    profiles,
    profileStats,
    viewerOutgoingSet,
    viewerIncomingSet
  );
  const outgoing = mapStandingRowsToSummaries(
    os,
    preview.outgoing,
    'outgoing',
    profiles,
    profileStats,
    viewerOutgoingSet,
    viewerIncomingSet
  );

  return { mutual, incoming, outgoing };
}

export async function loadPortalProfileSocial(
  os: PortalOnSocial,
  accountId: string,
  viewerAccountId: string | null
): Promise<PortalProfileSocialPayload> {
  const preview = await os.standings.profilePreview({
    accountId,
    viewerAccountId,
    previewLimit: STANDING_PREVIEW_LIMIT,
  });

  const { mutual, incoming, outgoing } = mapPreviewLists(os, preview);

  return {
    accountId,
    viewerAccountId: preview.viewerAccountId,
    viewerStanding: preview.viewerStanding,
    theyStandWithViewer: preview.theyStandWithViewer,
    counts: preview.counts,
    endorsementCounts: preview.endorsementCounts,
    mutual,
    incoming,
    outgoing,
  };
}
