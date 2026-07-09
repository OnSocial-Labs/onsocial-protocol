import { panelLabel } from '@/lib/overlay-routes';
import { FeedPanel } from '@/components/panels/feed-panel';
import { PanelPage } from '@/components/panels/panel-page';
import { fetchProfileRecentPosts } from '@/lib/fetch-profile-peeks';
import { resolveAccountPage } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function FeedPage({ params }: PanelRouteProps) {
  const { accountId, data } = await resolveAccountPage(params);
  const posts = await fetchProfileRecentPosts(accountId);
  const postCount = Math.max(
    data.stats.postCount ?? 0,
    data.recentPosts?.length ?? 0,
    posts.length
  );

  return (
    <PanelPage accountId={accountId} title={panelLabel('feed')}>
      <FeedPanel accountId={accountId} posts={posts} postCount={postCount} />
    </PanelPage>
  );
}
