import { Suspense } from 'react';
import { panelLabel } from '@/lib/overlay-routes';
import { ProfileFeedPagePanel } from '@/components/panels/profile-feed-panels';
import { PanelPage } from '@/components/panels/panel-page';
import { fetchProfileRecentPosts } from '@/lib/fetch-profile-peeks';
import { resolveAccountId } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

/**
 * Hard refresh / shared link — full-page feed fallback.
 * Soft nav still opens the glass sheet via `@overlay/(.)feed`.
 */
export default async function FeedPage({ params }: PanelRouteProps) {
  const accountId = await resolveAccountId(params);
  const posts = await fetchProfileRecentPosts(accountId);
  const title = panelLabel('feed');

  return (
    <PanelPage accountId={accountId} title={title}>
      <Suspense fallback={null}>
        <ProfileFeedPagePanel
          accountId={accountId}
          posts={posts}
          postCount={posts.length}
        />
      </Suspense>
    </PanelPage>
  );
}
