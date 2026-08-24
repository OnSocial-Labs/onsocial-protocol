'use client';

import { GuildFacepile } from '@/features/guilds/guild-facepile';
import {
  arePostAuthorProfilesResolved,
  usePostAuthorProfiles,
} from '@/hooks/use-post-author-profiles';

/** Loved fans on a drop row — facepile or count-only fallback. */
export function DropRowFans({
  fanIds,
  fanCount,
}: {
  fanIds?: string[];
  fanCount: number;
}) {
  const ids = (fanIds ?? []).slice(0, 3);
  const profiles = usePostAuthorProfiles(ids);
  const profilesLoading =
    ids.length > 0 && !arePostAuthorProfilesResolved(ids);
  if (ids.length === 0) {
    return (
      <span className="drops-discovery-deal-bit">
        {fanCount === 1 ? '1 fan' : `${fanCount} fans`}
      </span>
    );
  }
  return (
    <span className="drops-discovery-deal-fans">
      <GuildFacepile
        memberIds={ids}
        profiles={profiles}
        memberCount={fanCount}
        countUnit={{ one: 'fan', other: 'fans' }}
        slots={Math.min(3, ids.length)}
        loading={profilesLoading}
        showCount
        className="drops-discovery-fans-facepile"
      />
    </span>
  );
}
