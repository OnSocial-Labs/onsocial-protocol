'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { useOsAppNavigate } from '@/hooks/use-os-app-navigate';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { ThemeToggle } from '@/components/os/theme-toggle';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  appShellOsApps,
  ownerPortfolioOsApps,
  visitorPortfolioOsApps,
  type OsAppLink,
} from '@/lib/os-apps';

interface SummonLauncherProps {
  apps: OsAppLink[];
  pageAccountId?: string;
  showMyPage?: boolean;
}

export function SummonLauncher({
  apps,
  pageAccountId,
  showMyPage = false,
}: SummonLauncherProps) {
  const router = useRouter();
  const { accountId } = useAppWallet();
  const { navigate, openingPage } = useOsAppNavigate(pageAccountId);
  const [open, setOpen] = useState(false);

  useScrollLock(open);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function handleNavigate(app: OsAppLink) {
    if (navigate(app)) {
      setOpen(false);
    }
  }

  return (
    <>
      <div className="portfolio-summon-dock">
        <button
          type="button"
          className="portfolio-summon"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Open launcher"
        >
          <span className="portfolio-summon-grip" aria-hidden />
        </button>
      </div>

      {open ? (
        <div className="launcher-root" role="presentation">
          <button
            type="button"
            className="launcher-backdrop"
            aria-label="Close launcher"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="OnSocial launcher"
            className="launcher-sheet"
          >
            <span className="launcher-grip" aria-hidden />
            <ul className="launcher-grid">
              {apps.map((app) => (
                <li key={app.id}>
                  {app.kind === 'external' && app.href ? (
                    <a
                      className="launcher-item"
                      href={app.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpen(false)}
                    >
                      <span className="launcher-item-label">{app.label}</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={`launcher-item${app.soon ? ' is-soon' : ''}`}
                      disabled={app.soon || (app.kind === 'open-page' && openingPage)}
                      onClick={() => handleNavigate(app)}
                    >
                      <span className="launcher-item-label">
                        {app.kind === 'open-page' && openingPage
                          ? 'Opening…'
                          : app.label}
                      </span>
                      {app.soon ? (
                        <span className="launcher-item-soon">Soon</span>
                      ) : null}
                    </button>
                  )}
                </li>
              ))}
              {showMyPage && accountId ? (
                <li>
                  <button
                    type="button"
                    className="launcher-item"
                    onClick={() => {
                      setOpen(false);
                      router.push(portfolioPath(accountId));
                    }}
                  >
                    <span className="launcher-item-label">My page</span>
                  </button>
                </li>
              ) : null}
            </ul>

            <div className="launcher-footer">
              <ThemeToggle />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function PortfolioLauncher({
  pageAccountId,
}: {
  pageAccountId: string;
}) {
  const { accountId, isConnected } = useAppWallet();

  const isOwner =
    isConnected && Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId);
  const apps = isOwner
    ? ownerPortfolioOsApps(pageAccountId)
    : visitorPortfolioOsApps();

  return (
    <SummonLauncher
      apps={apps}
      pageAccountId={pageAccountId}
      showMyPage={!isOwner}
    />
  );
}

export function AppShellLauncher() {
  const { accountId } = useAppWallet();
  return <SummonLauncher apps={appShellOsApps(accountId)} />;
}
