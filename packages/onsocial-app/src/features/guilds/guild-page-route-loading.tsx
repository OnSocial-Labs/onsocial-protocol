'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { GuildFeedFilterSkeleton } from '@/features/guilds/guild-feed-filter-list';
import { GuildPageHeroSkeleton } from '@/features/guilds/guild-page-hero';
import { PostRowSkeleton } from '@/features/home/post-skeleton';
import { GUILDS_PAGE_CLASS } from '@/lib/os-chrome-page';

/**
 * Route `loading.tsx` — same guild chrome + cold bones the live panel paints
 * while the room shell soft-fills.
 */
export function GuildPageRouteLoading() {
  return (
    <OsAppScreen
      title="Guild"
      dockBack
      backFallbackHref="/groups"
      immersiveHeader
    >
      <div aria-hidden className="os-chrome-glass" />
      <div className={GUILDS_PAGE_CLASS}>
        <div
          className="guild-loading"
          data-guild-page-skeleton
          data-guild-loading-presentation="skeleton"
          aria-busy="true"
          aria-label="Loading guild"
        >
          <p className="sr-only">Loading guild…</p>
          <GuildPageHeroSkeleton />
          <GuildFeedFilterSkeleton />
          <PostRowSkeleton rows={3} showChannel />
        </div>
      </div>
    </OsAppScreen>
  );
}
