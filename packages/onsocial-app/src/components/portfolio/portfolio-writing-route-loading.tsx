'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import {
  WritingIdentityToolbar,
  WritingSearchHeading,
} from '@/components/portfolio/portfolio-writing-chrome';
import { PortfolioWritingPending } from '@/components/portfolio/portfolio-writing-list';
import { displayName } from '@/lib/profile-display';
import { portfolioPath } from '@/lib/overlay-routes';

/** Shared Writing chrome for overlay soft-open. */
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

  return (
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
