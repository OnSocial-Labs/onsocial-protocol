import { panelLabel } from '@/lib/overlay-routes';
import { EndorsementsPanel } from '@/components/panels/endorsements-panel';
import { PanelPage } from '@/components/panels/panel-page';
import { loadEndorsementsPageData } from '@/lib/load-endorsements-page';
import { displayName } from '@/lib/profile-display';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolveAccountId } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

/**
 * Hard refresh / shared link — full-page endorsements fallback.
 * Soft nav still opens the glass sheet via `@overlay/(.)endorsements`.
 */
export default async function EndorsementsPage({ params }: PanelRouteProps) {
  const accountId = await resolveAccountId(params);
  const title = panelLabel('endorsements');
  const [shell, initial] = await Promise.all([
    loadProfileShell(accountId),
    loadEndorsementsPageData(accountId),
  ]);
  const profileName = displayName(accountId, shell?.name ?? undefined);

  return (
    <PanelPage accountId={accountId} title={title}>
      <EndorsementsPanel
        accountId={accountId}
        profileName={profileName}
        avatarUrl={shell?.avatarUrl ?? null}
        initial={initial}
      />
    </PanelPage>
  );
}
