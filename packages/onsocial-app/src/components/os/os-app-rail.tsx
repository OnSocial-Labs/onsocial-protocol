'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { appPageHref } from '@/lib/app-links';
import { isPortfolioOverlayPath, overlayPath } from '@/lib/overlay-routes';
import {
  appShellOsApps,
  ownerPortfolioOsApps,
  visitorPortfolioOsApps,
  type OsAppLink,
} from '@/lib/os-apps';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function nearestIndex(container: HTMLElement): number {
  const items = container.querySelectorAll<HTMLElement>('[data-os-app-item]');
  if (items.length === 0) {
    return 0;
  }

  const centerY = container.scrollTop + container.clientHeight / 2;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  items.forEach((item, index) => {
    const itemCenter = item.offsetTop + item.offsetHeight / 2;
    const distance = Math.abs(itemCenter - centerY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

interface OsAppRailProps {
  apps: OsAppLink[];
  accountId?: string;
  ariaLabel?: string;
  className?: string;
}

export function OsAppRail({
  apps,
  accountId,
  ariaLabel = 'OnSocial apps',
  className,
}: OsAppRailProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { getSigningWallet } = useAppWallet();
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openingPage, setOpeningPage] = useState(false);

  const syncActiveIndex = useCallback(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }

    setActiveIndex(nearestIndex(container));
  }, []);

  useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }

    syncActiveIndex();
    container.addEventListener('scroll', syncActiveIndex, { passive: true });

    return () => {
      container.removeEventListener('scroll', syncActiveIndex);
    };
  }, [apps.length, syncActiveIndex]);

  const openPage = useCallback(async () => {
    if (openingPage) {
      return;
    }

    setOpeningPage(true);
    try {
      const { accountId: viewerAccountId } = await getSigningWallet();
      router.push(appPageHref(viewerAccountId));
    } catch (error) {
      if (!isWalletUserCancellation(error)) {
        console.error('Could not open OnPage', error);
      }
    } finally {
      setOpeningPage(false);
    }
  }, [getSigningWallet, openingPage, router]);

  const navigate = useCallback(
    (app: OsAppLink) => {
      if (app.soon) {
        return;
      }

      if (app.kind === 'open-page') {
        void openPage();
        return;
      }

      if (app.kind === 'app' && app.href) {
        router.push(app.href);
        return;
      }

      if (app.kind === 'overlay' && app.overlay && accountId) {
        const href = overlayPath(accountId, app.overlay);
        const openOverlay = isPortfolioOverlayPath(pathname)
          ? router.replace.bind(router)
          : router.push.bind(router);
        openOverlay(href, { scroll: false });
      }
    },
    [accountId, openPage, pathname, router]
  );

  if (apps.length === 0) {
    return null;
  }

  const rootClassName = ['gate-dapp-rail', className].filter(Boolean).join(' ');

  return (
    <nav className={rootClassName} aria-label={ariaLabel}>
      <ul ref={listRef} className="gate-dapp-list">
        {apps.map((app, index) => {
          const distance = Math.abs(index - activeIndex);
          const opacity =
            distance === 0 ? 1 : distance === 1 ? 0.34 : distance === 2 ? 0.14 : 0.06;
          const itemClassName = `gate-dapp-link${app.soon ? ' is-soon' : ''}`;

          if (app.kind === 'external' && app.href) {
            return (
              <li key={app.id} data-os-app-item data-dapp-item className="gate-dapp-item">
                <a
                  href={app.href}
                  className={itemClassName}
                  style={{ opacity }}
                  aria-current={index === activeIndex ? 'true' : undefined}
                >
                  {app.label}
                </a>
              </li>
            );
          }

          return (
            <li key={app.id} data-os-app-item data-dapp-item className="gate-dapp-item">
              <button
                type="button"
                className={itemClassName}
                style={{ opacity }}
                aria-current={index === activeIndex ? 'true' : undefined}
                disabled={
                  app.soon ||
                  (app.kind === 'overlay' && !accountId) ||
                  (app.kind === 'open-page' && openingPage)
                }
                onClick={() => navigate(app)}
              >
                {app.kind === 'open-page' && openingPage && index === activeIndex
                  ? 'Opening…'
                  : app.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

interface PortfolioOsRailProps {
  pageAccountId: string;
}

export function PortfolioOsRail({ pageAccountId }: PortfolioOsRailProps) {
  const { accountId, isConnected, isLoading } = useAppWallet();

  if (isLoading) {
    return null;
  }

  const isOwner = isConnected && accountId === pageAccountId;
  const apps = isOwner
    ? ownerPortfolioOsApps(pageAccountId)
    : visitorPortfolioOsApps(pageAccountId);

  return (
    <OsAppRail
      apps={apps}
      accountId={pageAccountId}
      ariaLabel={isOwner ? 'Your OnSocial apps' : 'Profile sections'}
      className="portfolio-os-rail"
    />
  );
}

export function AppShellOsRail() {
  const { accountId } = useAppWallet();

  return (
    <OsAppRail
      apps={appShellOsApps(accountId)}
      accountId={accountId ?? undefined}
      ariaLabel="OnSocial apps"
      className="app-shell-os-rail"
    />
  );
}
