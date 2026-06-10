import { panelLabel } from '@/lib/overlay-routes';
import { FeedPanel } from '@/components/panels/feed-panel';
import { PanelPage } from '@/components/panels/panel-page';
import { resolveAccountPage } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function FeedPage({ params }: PanelRouteProps) {
  const { accountId, data } = await resolveAccountPage(params);

  return (
    <PanelPage accountId={accountId} title={panelLabel('feed')}>
      <FeedPanel
        accountId={accountId}
        postCount={data.recentPosts?.length ?? 0}
      />
    </PanelPage>
  );
}
