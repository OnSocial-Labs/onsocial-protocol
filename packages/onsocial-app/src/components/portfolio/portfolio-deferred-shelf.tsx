import {
  fetchProfileCreatedPeeks,
  fetchProfilePostPeeks,
} from '@/lib/fetch-profile-peeks';
import { fetchPageDrawerMeta } from '@/lib/fetch-page-drawer-meta';
import { fetchProfileGuilds } from '@/lib/profile-guilds';
import { fetchProfileHoldingsPeeks } from '@/lib/fetch-profile-holdings';
import { fetchProfileStoreShelf } from '@/lib/fetch-profile-store';
import type { PageDrawerMeta } from '@/lib/page-drawer-meta';
import { PortfolioDeferredShelfHydrator } from '@/components/portfolio/portfolio-deferred-shelf-hydrator';

/** Stream below-fold drawer data after the portfolio hero paints. */
export async function PortfolioDeferredShelf({
  accountId,
  drawerName,
  drawerTags = [],
  guildCountHint = 0,
  postCountHint = 0,
}: {
  accountId: string;
  drawerName: string;
  drawerTags?: string[];
  guildCountHint?: number;
  postCountHint?: number;
}) {
  const [postPeeks, createdPeeks, storeShelf, holdings, guilds, drawerMetaBase] =
    await Promise.all([
      fetchProfilePostPeeks(accountId),
      fetchProfileCreatedPeeks(accountId),
      fetchProfileStoreShelf(accountId),
      fetchProfileHoldingsPeeks(accountId),
      fetchProfileGuilds(accountId),
      fetchPageDrawerMeta(accountId, {
        profileName: drawerName,
        profileTags: drawerTags,
        guildCount: guildCountHint,
        postCount: postCountHint,
      }),
    ]);
  const drawerMeta: PageDrawerMeta = {
    ...drawerMetaBase,
    guildCount: Math.max(guilds.length, drawerMetaBase.guildCount ?? 0),
    postCount: Math.max(postCountHint, drawerMetaBase.postCount ?? 0),
  };

  return (
    <PortfolioDeferredShelfHydrator
      postPeeks={postPeeks}
      createdPeeks={createdPeeks}
      storeShelf={storeShelf}
      holdings={holdings}
      guilds={guilds}
      drawerMeta={drawerMeta}
    />
  );
}
