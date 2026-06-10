import { panelLabel } from '@/lib/overlay-routes';
import { FeedPanel } from '@/components/panels/feed-panel';
import { GlassOverlayShell } from '@/components/overlay/glass-overlay-shell';
import { resolveAccountPage } from '@/lib/resolve-account';

type OverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function FeedOverlay({ params }: OverlayRouteProps) {
  const { accountId, data } = await resolveAccountPage(params);
  const title = panelLabel('feed');

  return (
    <GlassOverlayShell accountId={accountId} title={title}>
      <FeedPanel
        accountId={accountId}
        postCount={data.recentPosts?.length ?? 0}
      />
    </GlassOverlayShell>
  );
}
