import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { panelLabel } from '@/lib/overlay-routes';
import { FeedPanel } from '@/components/panels/feed-panel';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
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
    <OverlayInterceptRoot>
      <SimpleOverlayPanel ariaTitle={title} title={title}>
        <FeedPanel
          accountId={accountId}
          postCount={data.recentPosts?.length ?? 0}
        />
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
