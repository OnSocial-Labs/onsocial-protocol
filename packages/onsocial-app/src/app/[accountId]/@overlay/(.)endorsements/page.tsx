import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { PortfolioFaceOverlayLeave } from '@/components/portfolio/portfolio-face-overlay-leave';
import { panelLabel } from '@/lib/overlay-routes';
import { EndorsementsPanel } from '@/components/panels/endorsements-panel';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
import {
  loadEndorsementsPageData,
  parseEndorsementsMode,
} from '@/lib/load-endorsements-page';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolveAccountId } from '@/lib/resolve-account';

type OverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
  searchParams?: Promise<{
    mode?: string | string[];
  }>;
};

export default async function EndorsementsOverlay({
  params,
  searchParams,
}: OverlayRouteProps) {
  const accountId = await resolveAccountId(params);
  const resolvedSearch = await searchParams;
  const rawMode = Array.isArray(resolvedSearch?.mode)
    ? resolvedSearch.mode[0]
    : resolvedSearch?.mode;
  const initialMode = parseEndorsementsMode(rawMode) ?? 'received';
  const title = panelLabel('endorsements');
  const [shell, initial] = await Promise.all([
    loadProfileShell(accountId),
    loadEndorsementsPageData(accountId),
  ]);
  return (
    <OverlayInterceptRoot>
      <SimpleOverlayPanel ariaTitle={title} title={title}>
        <PortfolioFaceOverlayLeave accountId={accountId} />
        <EndorsementsPanel
          accountId={accountId}
          profileName={shell?.name ?? null}
          avatarUrl={shell?.avatarUrl ?? null}
          initial={initial}
          initialMode={initialMode}
        />
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
