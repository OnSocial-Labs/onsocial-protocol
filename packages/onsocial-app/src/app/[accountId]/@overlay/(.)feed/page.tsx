import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { ProfileFeedOverlayPanel } from '@/components/panels/profile-feed-panels';
import { fetchProfileRecentPosts } from '@/lib/fetch-profile-peeks';
import { resolveAccountId } from '@/lib/resolve-account';

type OverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function FeedOverlay({ params }: OverlayRouteProps) {
  const accountId = await resolveAccountId(params);
  const posts = await fetchProfileRecentPosts(accountId);

  return (
    <OverlayInterceptRoot>
      <ProfileFeedOverlayPanel
        accountId={accountId}
        posts={posts}
        postCount={posts.length}
      />
    </OverlayInterceptRoot>
  );
}
