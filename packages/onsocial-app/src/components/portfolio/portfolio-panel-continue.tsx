'use client';

import { Suspense, useLayoutEffect, useRef, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PORTFOLIO_SHELF_PARAM } from '@/components/portfolio/account-place-link';
import { isPortfolioOverlayPath, portfolioPath } from '@/lib/overlay-routes';

/**
 * Home cannot open Writing directly. The face hop lands here, then this
 * continues to the shelf from inside the account route.
 */
function PortfolioPanelContinueInner({ accountId }: { accountId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const shelf = search.get(PORTFOLIO_SHELF_PARAM);
  const startedRef = useRef(false);

  useLayoutEffect(() => {
    if (!shelf?.startsWith('/') || shelf.startsWith('//') || startedRef.current) {
      return;
    }
    const target = `${portfolioPath(accountId)}${shelf}`;
    if (!isPortfolioOverlayPath(target)) return;
    if (pathname === target || pathname.startsWith(`${target}/`)) return;
    startedRef.current = true;
    const next = new URLSearchParams(search.toString());
    next.delete(PORTFOLIO_SHELF_PARAM);
    const qs = next.toString();
    router.replace(qs ? `${target}?${qs}` : target);
  }, [accountId, pathname, router, search, shelf]);

  return null;
}

export function PortfolioPanelContinue({
  accountId,
}: {
  accountId: string;
}) {
  return (
    <Suspense fallback={null}>
      <PortfolioPanelContinueInner accountId={accountId} />
    </Suspense>
  );
}

/** Hide the face for the instant before the shelf continues. */
export function PortfolioShelfHopFrame({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={children}>
      <PortfolioShelfHopFrameInner>{children}</PortfolioShelfHopFrameInner>
    </Suspense>
  );
}

function PortfolioShelfHopFrameInner({ children }: { children: ReactNode }) {
  const search = useSearchParams();
  const shelf = search.get(PORTFOLIO_SHELF_PARAM);
  const hopping = Boolean(shelf?.startsWith('/') && !shelf.startsWith('//'));
  return <div hidden={hopping || undefined}>{children}</div>;
}
