import { ProfileFeedPagePanel } from '@/components/panels/profile-feed-panels';
import { fetchProfileRecentPosts } from '@/lib/fetch-profile-peeks';
import { resolveAccountId } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function FeedPage({ params }: PanelRouteProps) {
  const accountId = await resolveAccountId(params);
  const posts = await fetchProfileRecentPosts(accountId);

  return (
    <ProfileFeedPagePanel
      accountId={accountId}
      posts={posts}
      postCount={posts.length}
    />
  );
}
