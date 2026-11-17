'use client';

import { useParams } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import {
  WritingIdentityToolbar,
  WritingSearchHeading,
} from '@/components/portfolio/portfolio-writing-chrome';
import { PortfolioWritingPending } from '@/components/portfolio/portfolio-writing-list';
import { displayName } from '@/lib/profile-display';
import { portfolioPath } from '@/lib/overlay-routes';

function resolveWritingAccountId(params: { accountId?: string }): string {
  return typeof params?.accountId === 'string' ? params.accountId : '';
}

/** Shared Writing chrome for cold routes and overlay loading. */
export function PortfolioWritingColdShell({
  accountId,
  embedded = false,
  onDockBack,
}: {
  accountId: string;
  embedded?: boolean;
  onDockBack?: () => void;
}) {
  const titleLabel = accountId ? displayName(accountId) : '';

  const screen = (
    <OsAppScreen
      title="Writing"
      compactChrome
      glassChrome
      scrollTuck="search"
      leading={null}
      dockBack
      onDockBack={onDockBack}
      backFallbackHref={accountId ? portfolioPath(accountId) : '/'}
      embedded={embedded}
      heading={<WritingSearchHeading interactive={false} />}
      toolbar={
        accountId ? (
          <WritingIdentityToolbar
            accountId={accountId}
            titleLabel={titleLabel}
            avatarUrl={null}
            articleCount={0}
          />
        ) : null
      }
    >
      <p className="sr-only">Loading writing…</p>
      <PortfolioWritingPending />
    </OsAppScreen>
  );

  return screen;
}

/** Route `loading.tsx` — same chrome as `PortfolioWritingScreen`. */
export function PortfolioWritingRouteLoading() {
  const accountId = resolveWritingAccountId(useParams<{ accountId?: string }>());
  return <PortfolioWritingColdShell accountId={accountId} />;
}

/** Soft-nav Writing overlay while the intercept route resolves. */
export function PortfolioWritingOverlayLoading({
  accountId,
}: {
  accountId: string;
}) {
  return (
    <>
      <OverlayPanelChrome ariaTitle="Writing" hideTitle />
      <PortfolioWritingColdShell accountId={accountId} embedded />
    </>
  );
}