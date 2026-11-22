'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import { PortfolioAboutPending } from '@/components/portfolio/portfolio-about-pending';
import { portfolioPath } from '@/lib/overlay-routes';

export function PortfolioAboutColdShell({
  accountId,
  embedded = false,
  onDockBack,
}: {
  accountId: string;
  embedded?: boolean;
  onDockBack?: () => void;
}) {
  return (
    <OsAppScreen
      title="About"
      compactChrome
      leading={null}
      dockBack
      onDockBack={onDockBack}
      backFallbackHref={accountId ? portfolioPath(accountId) : '/'}
      embedded={embedded}
    >
      <p className="sr-only">Loading about…</p>
      <PortfolioAboutPending />
    </OsAppScreen>
  );
}

export function PortfolioAboutOverlayLoading({
  accountId,
}: {
  accountId: string;
}) {
  return (
    <>
      <OverlayPanelChrome ariaTitle="About" hideTitle />
      <PortfolioAboutColdShell accountId={accountId} embedded />
    </>
  );
}
